# Cloudrop

A learning-focused Next.js App Router project with private S3 uploads. The browser selects and validates a file, requests a short-lived upload URL, then sends the file directly to S3.

## Local development

Run `npm install`, then `npm run dev`, and open http://localhost:3000.

Keep these values in the git-ignored `.env.local` file (never prefix them with `NEXT_PUBLIC_`):

- `AWS_REGION`: the bucket's actual AWS region.
- `AWS_S3_BUCKET_NAME`: your private bucket name.
- `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`: server credentials.
- `AWS_SESSION_TOKEN`: also required if using temporary credentials.

Restart the development server after changing environment variables. The SDK resolves credentials on the server; the browser has no AWS SDK or credential configuration. Standard presigned URLs necessarily contain the signing access-key identifier, but never the secret access key. Do not log or share the generated upload URLs.

## Private bucket setup

Keep S3 Block Public Access enabled (all four settings), use Bucket owner enforced object ownership, and do not add a public bucket policy or public-read ACL. This app does not change bucket permissions or add ACLs.

The server's IAM identity needs `s3:PutObject` on `arn:aws:s3:::YOUR_BUCKET_NAME/uploads/*`. A bucket using a customer-managed KMS key may also require that key's encryption permissions. No read, list, or delete permission is needed for this upload flow.

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

There are no public download links, authentication, database, or automatic expiration. Uploaded objects remain until removed outside the app. The signing endpoint is unauthenticated, as requested, so anyone who can access it can request uploads. File validation checks metadata, not file contents. A 60-second URL lifetime limits when an upload can start; it does not expire the stored object. See [AWS SDK presigner documentation](https://github.com/aws/aws-sdk-js-v3/tree/main/packages/s3-request-presigner).

## Troubleshooting

- **Could not prepare the upload:** check server credentials, environment variables, and whether temporary credentials have expired.
- **S3 refused the upload:** confirm the bucket region, IAM PutObject permission, bucket policy, and matching file size/content type, then retry.
- **Could not reach storage:** check your network and the bucket's CORS allowed origin and PUT method. Browsers can report S3 permission errors as CORS/network errors too.

Run `npm run lint` and `npm run build` to check the app.
