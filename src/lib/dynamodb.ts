import "server-only";

import { ConditionalCheckFailedException, DynamoDBClient, GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { getAwsConfig } from "./aws-config";
import { getFileId } from "./file-key";

export type FileMetadata = {
  fileId: string;
  originalFileName: string;
  s3Key: string;
  fileSize: number;
  uploadedAt: string;
  expiresAt: number;
  downloadCount: number;
};

export function isFileExpired(file: FileMetadata) {
  return file.expiresAt <= Date.now() / 1000;
}

export async function getFileMetadata(fileId: string): Promise<FileMetadata | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(fileId)) return null;
  const tableName = process.env.AWS_DYNAMODB_TABLE_NAME;
  if (!tableName) throw new Error("Metadata storage is not configured.");
  const client = new DynamoDBClient(getAwsConfig());
  try {
    const { Item: item } = await client.send(new GetItemCommand({
      TableName: tableName,
      Key: { fileId: { S: fileId } },
      ConsistentRead: true,
    }));
    if (!item) return null;
    const metadata = {
      fileId: item.fileId?.S ?? "",
      originalFileName: item.originalFileName?.S ?? "",
      s3Key: item.s3Key?.S ?? "",
      fileSize: Number(item.fileSize?.N),
      uploadedAt: item.uploadedAt?.S ?? "",
      expiresAt: Number(item.expiresAt?.N),
      downloadCount: Number(item.downloadCount?.N),
    };
    if (metadata.fileId !== fileId || getFileId(metadata.s3Key) !== fileId ||
      !metadata.originalFileName || !Number.isSafeInteger(metadata.fileSize) || metadata.fileSize < 0 ||
      !Number.isSafeInteger(metadata.expiresAt) || metadata.expiresAt <= 0) return null;
    return metadata;
  } finally {
    client.destroy();
  }
}

export async function saveFileMetadata(metadata: FileMetadata) {
  const tableName = process.env.AWS_DYNAMODB_TABLE_NAME;
  if (!tableName) throw new Error("AWS_DYNAMODB_TABLE_NAME is not configured.");
  const client = new DynamoDBClient(getAwsConfig());
  try {
    await client.send(new PutItemCommand({
      TableName: tableName,
      Item: {
        fileId: { S: metadata.fileId },
        originalFileName: { S: metadata.originalFileName },
        s3Key: { S: metadata.s3Key },
        fileSize: { N: String(metadata.fileSize) },
        uploadedAt: { S: metadata.uploadedAt },
        expiresAt: { N: String(metadata.expiresAt) },
        downloadCount: { N: String(metadata.downloadCount) },
      },
      // A retry after a lost response must not reset timestamps or downloadCount.
      ConditionExpression: "attribute_not_exists(fileId)",
    }));
  } catch (error) {
    if (!(error instanceof ConditionalCheckFailedException)) throw error;
  } finally {
    client.destroy();
  }
}
