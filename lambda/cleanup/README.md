# Expired file cleanup

## Standalone Lambda console version

`index.mjs` is the standalone JavaScript ES module version. Paste its contents into an `index.mjs` file in a Node.js 22.x Lambda function and set the handler to `index.handler`. It uses the AWS SDK v3 supplied by the Lambda Node.js runtime; no TypeScript compilation or project-relative imports are needed.

Set `AWS_S3_BUCKET_NAME` and `AWS_DYNAMODB_TABLE_NAME` in the function environment. Use the execution role permissions, five-minute timeout, concurrency limit of one, and 15-minute schedule described below. Do not paste AWS access keys into the code; Lambda supplies role credentials and region automatically. Creating the console file alone does not configure the schedule or permissions.

The UUID pattern and extension allowlist are inlined from the project's file-key validator. Keep them synchronized if accepted file extensions change. `index.ts` remains the source used by the existing bundled SAM deployment; the JavaScript version preserves its cleanup behavior.

`node --check lambda/cleanup/index.mjs` verifies syntax. The cleanup tests run against `index.mjs` by default; set `CLEANUP_TEST_ENTRY=./index.ts` to run them against the TypeScript source instead.

This standalone TypeScript Lambda runs every 15 minutes after deployment. It uses the existing SDK v3 packages and Lambda's execution role, not `.env.local` credentials. No app routes or UI components are changed.

## Flow

1. Scan DynamoDB for `expiresAt <= current Unix time`, following every `LastEvaluatedKey` (including empty filtered pages).
2. Read each candidate consistently and confirm the timestamp and matching Cloudrop UUID/key.
3. Delete its S3 object. For versioned or suspended-versioning buckets, delete every version and delete marker for that exact key, following pagination.
4. Only after S3 succeeds, conditionally delete the DynamoDB record if its key and expiry still match.
5. Log a summary and per-file errors. Failed records remain for the next scheduled run. An already missing S3 object is safe to retry, including when S3 deletion succeeded but the DynamoDB delete failed.

Malformed records are logged and retained for investigation. Scan/configuration failures fail the invocation. Other per-file failures do not stop remaining files. Logs include file IDs and AWS error names, never filenames, credentials, or presigned URLs. Logs are retained for 14 days.

## Build and deploy

Install the AWS SAM CLI and configure an AWS deployment profile with permission to create the Lambda, its execution role, log group, and EventBridge scheduled rule. Use the same region as the existing table and bucket.

From the project root:

```powershell
npm run build:cleanup
node --test lambda/cleanup/cleanup.test.mjs
sam validate --template-file lambda/cleanup/template.yaml
sam deploy --template-file lambda/cleanup/template.yaml --guided --resolve-s3 --capabilities CAPABILITY_IAM
```

Supply your existing bucket and table names for `BucketName` and `TableName`, and choose a stack name such as `cloudrop-cleanup`. SAM packages the bundled output using its deployment-artifact bucket. Do not package `.env.local`. Deployment enables the schedule immediately; it can permanently delete already-expired files, including all their S3 versions.

The template grants only table Scan/GetItem/DeleteItem and bucket version-inspection/deletion permissions scoped to `uploads/*`, plus CloudWatch logging. It does not grant the web app deletion permissions or change bucket policies. Lambda supplies `AWS_REGION` automatically; the template supplies the existing `AWS_S3_BUCKET_NAME` and `AWS_DYNAMODB_TABLE_NAME` names.

Do **not** enable DynamoDB TTL on `expiresAt`: TTL can remove the metadata before this function has deleted the S3 object. If TTL was already enabled, disable it and allow in-flight TTL deletes to settle before relying on this cleanup process. S3 objects without metadata cannot be discovered by this scan.

## Scope and limits

- Share-page expiry is still enforced immediately. Physical cleanup occurs on the next successful scheduled run.
- This is a simple full-table scan for the current learning project. The filter reduces returned records, not scan read costs. Timeout is five minutes and concurrency is one. A timeout leaves unfinished records for a later run, restarting from the beginning; a larger table requires indexed queries/checkpointing to avoid starvation.
- Cloudrop currently uses immutable object keys and expiry timestamps. Do not add overwrites or expiry-extension flows without coordinating them with cleanup: S3 and DynamoDB deletion are not one atomic transaction.
- Object Lock, explicit denies, or missing permissions retain the record and produce errors. The function does not bypass retention controls.
- Downloads are not counted, authentication is not added, and neither uploads nor share pages are modified.

AWS references: [Scan pagination](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Scan.html), [S3 version deletion](https://docs.aws.amazon.com/AmazonS3/latest/API/API_DeleteObject.html), [SAM schedules](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-property-function-schedule.html).
