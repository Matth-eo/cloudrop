import "server-only";

import { GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getAwsConfig } from "./aws-config";

export function getS3Storage() {
  const bucket = process.env.AWS_S3_BUCKET_NAME;
  if (!bucket) throw new Error("Storage is not configured.");

  return {
    bucket,
    client: new S3Client({
      ...getAwsConfig(),
      // Upload bytes arrive later from the browser, so don't checksum an empty body.
      requestChecksumCalculation: "WHEN_REQUIRED",
    }),
  };
}

export async function getUploadedFile(key: string) {
  const { client, bucket } = getS3Storage();
  try {
    const object = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    const encodedName = object.Metadata?.["original-name"];
    if (!encodedName || object.ContentLength === undefined || !object.LastModified) {
      throw new Error("Uploaded file metadata is incomplete.");
    }
    return {
      name: Buffer.from(encodedName, "base64url").toString("utf8"),
      size: object.ContentLength,
      uploadedAt: object.LastModified,
    };
  } finally {
    client.destroy();
  }
}

export async function createDownloadLink(key: string) {
  const { client, bucket } = getS3Storage();
  try {
    // Do not issue a download link for a missing or unsuccessful upload.
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    const expiresIn = 15 * 60;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    const url = await getSignedUrl(client, new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentDisposition: "attachment",
      ResponseCacheControl: "private, no-store",
    }), { expiresIn });
    return { url, expiresAt };
  } finally {
    client.destroy();
  }
}
