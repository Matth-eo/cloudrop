import "server-only";

import { ConditionalCheckFailedException, DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { getAwsConfig } from "./aws-config";

export type FileMetadata = {
  fileId: string;
  originalFileName: string;
  s3Key: string;
  fileSize: number;
  uploadedAt: string;
  expiresAt: number;
  downloadCount: number;
};

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
