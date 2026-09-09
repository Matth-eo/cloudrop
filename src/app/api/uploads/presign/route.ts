import { randomUUID } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { validateFile } from "@/lib/file-validation";
import { getS3Storage } from "@/lib/s3";
import { DEFAULT_EXPIRATION_SECONDS, isExpirationSeconds } from "@/lib/expiration";
import { getCurrentUser, isSameOrigin } from "@/lib/auth";

export const runtime = "nodejs";

const RESPONSE_HEADERS = { "Cache-Control": "no-store" };

function errorResponse(error: string, status: number) {
  return Response.json({ error }, { status, headers: RESPONSE_HEADERS });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return errorResponse("Upload requests must come from this site.", 403);
  }
  const user = await getCurrentUser();
  if (!user) return errorResponse("Sign in to upload a file. Your session may have expired.", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Send valid JSON with the file name, size, and content type.", 400);
  }

  if (!body || typeof body !== "object" ||
    !("name" in body) || typeof body.name !== "string" ||
    !("size" in body) || typeof body.size !== "number" ||
    !("contentType" in body) || typeof body.contentType !== "string") {
    return errorResponse("The file name, size, and content type are required.", 400);
  }

  const validationError = validateFile({ name: body.name, size: body.size });
  if (validationError) return errorResponse(validationError, 400);

  const expirationSeconds = "expirationSeconds" in body ? body.expirationSeconds : DEFAULT_EXPIRATION_SECONDS;
  if (!isExpirationSeconds(expirationSeconds)) {
    return errorResponse("Choose an expiration of 1 hour, 24 hours, or 7 days.", 400);
  }

  const contentType = body.contentType || "application/octet-stream";
  if (contentType.length > 255 || !/^[\w!#$&^.+-]+\/[\w!#$&^.+-]+$/.test(contentType)) {
    return errorResponse("The file content type is invalid. Please choose the file again.", 400);
  }

  const region = process.env.AWS_REGION;
  const bucket = process.env.AWS_S3_BUCKET_NAME;
  if (!region || !bucket) {
    return errorResponse("Storage is not configured. Set AWS_REGION and AWS_S3_BUCKET_NAME on the server.", 503);
  }

  const { client } = getS3Storage();
  const extension = body.name.slice(body.name.lastIndexOf(".")).toLowerCase();
  const fileId = randomUUID();
  const key = `uploads/${fileId}${extension}`;

  try {
    const url = await getSignedUrl(client, new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: body.size,
      // Base64url keeps Unicode names within S3's metadata header limits.
      Metadata: {
        "original-name": Buffer.from(body.name, "utf8").toString("base64url"),
        "expiration-seconds": String(expirationSeconds),
        "owner-id": user.id,
      },
      // No public ACL: objects inherit the private bucket's access controls.
    }), {
      expiresIn: 60,
      signableHeaders: new Set(["content-type", "content-length"]),
    });

    return Response.json({ url, contentType, key, fileId }, { headers: RESPONSE_HEADERS });
  } catch {
    // Never return or log credentials, signed URLs, or raw SDK errors.
    return errorResponse("Could not prepare the upload. Check the server’s AWS credentials and storage configuration, then try again.", 503);
  } finally {
    client.destroy();
  }
}
