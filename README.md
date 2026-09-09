# Cloudrop

A learning-focused Next.js App Router project with private S3 uploads. The browser selects and validates a file, requests a short-lived upload URL, then sends the file directly to S3.

## Local development

Run `npm install`, then `npm run dev`, and open http://localhost:3000.

Keep these values in the git-ignored `.env.local` file (never prefix them with `NEXT_PUBLIC_`):

- `AWS_REGION`: the bucket's actual AWS region.
- `AWS_S3_BUCKET_NAME`: your private bucket name.
- `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`: server credentials.
- `AWS_SESSION_TOKEN`: also required if using temporary credentials.
- `AWS_DYNAMODB_TABLE_NAME`: the metadata table in the same `AWS_REGION`.

Restart the development server after changing environment variables. The SDK resolves credentials on the server; the browser has no AWS SDK or credential configuration. Standard presigned URLs necessarily contain the signing access-key identifier, but never the secret access key. Do not log or share the generated upload URLs.

## Private bucket setup

Keep S3 Block Public Access enabled (all four settings), use Bucket owner enforced object ownership, and do not add a public bucket policy or public-read ACL. This app does not change bucket permissions or add ACLs.

The server's IAM identity needs `s3:PutObject` and `s3:GetObject` on `arn:aws:s3:::YOUR_BUCKET_NAME/uploads/*`. GetObject permission is also used by the HeadObject existence check before generating a download link. A bucket using a customer-managed KMS key may also require that key's encryption/decryption permissions. No list or delete permission is needed.

In the S3 console, under **Permissions ? Cross-origin resource sharing (CORS)**, allow the local app's origin to PUT files:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 300
  }
]
```

Use the exact origin (including port); add your deployed HTTPS origin when needed. Preserve unrelated existing CORS rules. CORS does not make the bucket public or grant S3 permissions. See [AWS CORS documentation](https://docs.aws.amazon.com/AmazonS3/latest/userguide/enabling-cors-examples.html).

## Upload flow

1. The picker and drop zone share the same 25 MiB limit (shown as 25 MB) and extension allowlist.
2. The browser POSTs only the file name, size, and MIME type to `/api/uploads/presign`.
3. The route revalidates the metadata and signs a PUT for a random `uploads/<uuid>.<extension>` key, valid for 60 seconds. Content type and exact content length are signed. No file bytes pass through Next.js.
4. The browser PUTs the original File to S3 using XMLHttpRequest for progress events. The browser supplies Content-Length automatically; the code sets the signed Content-Type.
5. Only an S3 2xx response produces success. Failures allow retry with a fresh URL. Changing or clearing the selection resets the interface; clearing it does not delete any uploaded object.

There is no authentication or automatic file deletion. Uploaded objects remain until removed outside the app. Anyone who can access the app can request uploads, and anyone holding a Cloudrop share URL can download until its metadata expires. File validation checks metadata, not file contents. A 60-second upload URL lifetime limits when an upload can start; it does not expire the stored object. See [AWS SDK presigner documentation](https://github.com/aws/aws-sdk-js-v3/tree/main/packages/s3-request-presigner).

## File metadata in DynamoDB

Use a table with a **String partition key named `fileId` and no sort key**, in the same region as `AWS_REGION`. Set its name in `AWS_DYNAMODB_TABLE_NAME`. The server identity needs `dynamodb:PutItem` and `dynamodb:GetItem` permissions on that table, in addition to the existing S3 permissions. The app does not create the table or change its settings.

The upload endpoint generates a UUID used for both `fileId` and the S3 key. It signs the original filename into S3 object metadata (base64url encoded to support Unicode). After S3 confirms the PUT, the browser POSTs only the key to `/api/uploads/complete`. The server reads the original name, actual size, and LastModified time from S3, validates the file, and saves:

| Attribute | Type | Value |
| --- | --- | --- |
| `fileId` | String | Server-generated UUID from the object key |
| `originalFileName` | String | Original filename, including its extension |
| `s3Key` | String | `uploads/<fileId>.<extension>` |
| `fileSize` | Number | S3 object size in bytes |
| `uploadedAt` | String | S3 LastModified as an ISO 8601 UTC timestamp |
| `expiresAt` | Number | Unix epoch seconds, 24 hours after upload |
| `downloadCount` | Number | Initially `0` |

The 24-hour default is `FILE_LIFETIME_SECONDS` in the completion route. Cloudrop enforces this expiry on share-page visits and download requests. TTL cleanup is not enabled and S3 objects are not deleted. The download count is stored but not incremented yet.

A conditional PutItem prevents retries from overwriting existing metadata or resetting downloadCount. The success card reports saving/saved/error and supports retrying only the metadata write. The Cloudrop share link appears after metadata is saved successfully. Keep the page open until details are saved; closing it between upload and completion can leave an S3 object without a DynamoDB record. There is no background reconciliation yet. Older uploads without the new S3 filename metadata are not backfilled.

AWS credentials and all DynamoDB operations stay server-side. The shared AWS configuration uses the same region and credential provider chain for S3 and DynamoDB. See [AWS conditional PutItem documentation](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_PutItem.html).

## Download flow

After S3 upload and DynamoDB saving succeed, the success card displays a Cloudrop URL such as `https://your-site/d/<fileId>` with Copy and Open buttons. It uses the app's current origin; localhost links only work on the same computer, so use a deployed origin to share with others.

The dynamic server page reads DynamoDB with a strongly consistent GetItem. Missing, invalid, or expired files show an unavailable/expired state. Valid records show the filename, size, expiry, and a Download file button. Storage errors show a retryable unavailable state.

The Download action requests `/d/<fileId>?download=1`. The server rechecks metadata expiry, verifies the S3 object, and redirects to a GET URL signed for at most 15 minutes, capped by the file's remaining lifetime. The S3 URL is not displayed as the share link, though the browser necessarily receives it during the redirect. The old `/api/downloads/presign` endpoint now returns 410 and cannot bypass metadata expiry. Downloads are attachment responses and travel directly from private S3 to the recipient. Browser navigation requires no GET addition to upload CORS settings.

Anyone with the Cloudrop URL can download until metadata expiry. Expiry prevents new downloads; it does not delete S3 objects or recall downloaded copies. No authentication, Lambda, or cleanup process is added.

## Troubleshooting

- **Could not prepare the upload:** check server credentials, environment variables, and whether temporary credentials have expired.
- **S3 refused the upload:** confirm the bucket region, IAM PutObject permission, bucket policy, and matching file size/content type, then retry.
- **Could not reach storage:** check your network and the bucket's CORS allowed origin and PUT method. Browsers can report S3 permission errors as CORS/network errors too.
- **Share page unavailable:** confirm `dynamodb:GetItem` and `s3:GetObject` permissions, table/bucket configuration, and that the record and file exist. Expired records cannot start new downloads.
- **Could not copy automatically:** select the displayed link and copy manually; browser clipboard access requires a secure context such as HTTPS or localhost.

Run `npm run lint` and `npm run build` to check the app.
