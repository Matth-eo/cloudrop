import { DeleteItemCommand, DynamoDBClient, GetItemCommand, ScanCommand } from "@aws-sdk/client-dynamodb";
import { DeleteObjectCommand, GetBucketVersioningCommand, ListObjectVersionsCommand, S3Client } from "@aws-sdk/client-s3";
const ALLOWED_EXTENSIONS = [
    ".pdf", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".avif",
    ".bmp", ".tif", ".tiff", ".heic", ".heif", ".zip",
    ".txt", ".md", ".csv", ".rtf", ".doc", ".docx", ".odt",
];
function getFileId(key) {
    const match = /^uploads\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(\.[a-z]+)$/.exec(key);
    return match && ALLOWED_EXTENSIONS.includes(match[2]) ? match[1] : null;
}
const dynamodb = new DynamoDBClient({});
const s3 = new S3Client({});
function errorName(error) {
    return error instanceof Error ? error.name : "UnknownError";
}
async function deleteFile(bucket, key, versioned) {
    if (!versioned) {
        // Deleting an already missing object succeeds, allowing safe retries.
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
        return;
    }
    let keyMarker;
    let versionIdMarker;
    do {
        const page = await s3.send(new ListObjectVersionsCommand({
            Bucket: bucket, Prefix: key, KeyMarker: keyMarker, VersionIdMarker: versionIdMarker,
        }));
        for (const version of [...(page.Versions ?? []), ...(page.DeleteMarkers ?? [])]) {
            // Prefix results can include other objects. Delete only the exact file key.
            if (version.Key === key && version.VersionId) {
                await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key, VersionId: version.VersionId }));
            }
        }
        keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined;
        versionIdMarker = page.IsTruncated ? page.NextVersionIdMarker : undefined;
    } while (keyMarker);
}
export async function handler() {
    const table = process.env.AWS_DYNAMODB_TABLE_NAME;
    const bucket = process.env.AWS_S3_BUCKET_NAME;
    if (!table || !bucket) {
        console.error("cleanup_configuration_missing");
        throw new Error("Cleanup requires a table and bucket name.");
    }
    const cutoff = Math.floor(Date.now() / 1000);
    const summary = { deleted: 0, skipped: 0, failed: 0 };
    let startKey;
    try {
        const versioning = await s3.send(new GetBucketVersioningCommand({ Bucket: bucket }));
        const versioned = versioning.Status === "Enabled" || versioning.Status === "Suspended";
        do {
            const page = await dynamodb.send(new ScanCommand({
                TableName: table,
                ExclusiveStartKey: startKey,
                FilterExpression: "#expiresAt <= :now",
                ProjectionExpression: "fileId",
                ExpressionAttributeNames: { "#expiresAt": "expiresAt" },
                ExpressionAttributeValues: { ":now": { N: String(cutoff) } },
                Limit: 100,
            }));
            for (const candidate of page.Items ?? []) {
                const fileId = candidate.fileId?.S;
                if (!fileId) {
                    summary.skipped++;
                    continue;
                }
                try {
                    // Scan is not a snapshot. Recheck the current record before deleting S3 data.
                    const { Item: item } = await dynamodb.send(new GetItemCommand({
                        TableName: table, Key: { fileId: { S: fileId } }, ConsistentRead: true,
                    }));
                    if (!item) {
                        summary.skipped++;
                        continue;
                    }
                    const key = item.s3Key?.S;
                    const expiresAt = Number(item.expiresAt?.N);
                    if (!key || getFileId(key) !== fileId || !Number.isSafeInteger(expiresAt) || expiresAt <= 0) {
                        console.error("cleanup_invalid_record", { fileId });
                        summary.failed++;
                        continue;
                    }
                    if (expiresAt > cutoff) {
                        summary.skipped++;
                        continue;
                    }
                    await deleteFile(bucket, key, versioned);
                    await dynamodb.send(new DeleteItemCommand({
                        TableName: table,
                        Key: { fileId: { S: fileId } },
                        ConditionExpression: "s3Key = :key AND expiresAt = :expiry",
                        ExpressionAttributeValues: { ":key": { S: key }, ":expiry": { N: String(expiresAt) } },
                    }));
                    summary.deleted++;
                }
                catch (error) {
                    summary.failed++;
                    console.error("cleanup_file_failed", { fileId, error: errorName(error) });
                }
            }
            startKey = page.LastEvaluatedKey;
        } while (startKey);
    }
    catch (error) {
        console.error("cleanup_run_failed", { error: errorName(error), ...summary });
        throw new Error("Cleanup could not finish. See the cleanup logs.");
    }
    console.info("cleanup_completed", summary);
    return summary;
}
