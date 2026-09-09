import { saveFileMetadata } from "@/lib/dynamodb";
import { getFileId } from "@/lib/file-key";
import { validateFile } from "@/lib/file-validation";
import { getUploadedFile } from "@/lib/s3";
import { getCurrentUser, isSameOrigin } from "@/lib/auth";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: "Metadata requests must come from this site." }, { status: 403, headers });
  }
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in again to save this upload." }, { status: 401, headers });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send valid JSON with the uploaded file key." }, { status: 400, headers });
  }
  if (!body || typeof body !== "object" || !("key" in body) || typeof body.key !== "string") {
    return Response.json({ error: "The uploaded file key is required." }, { status: 400, headers });
  }
  const fileId = getFileId(body.key);
  if (!fileId) return Response.json({ error: "The uploaded file key is invalid." }, { status: 400, headers });

  try {
    const file = await getUploadedFile(body.key);
    if (file.userId !== user.id) {
      return Response.json({ error: "This upload does not belong to your account." }, { status: 403, headers });
    }
    const validationError = validateFile(file);
    if (validationError) return Response.json({ error: validationError }, { status: 400, headers });
    await saveFileMetadata({
      fileId,
      originalFileName: file.name,
      s3Key: body.key,
      fileSize: file.size,
      uploadedAt: file.uploadedAt.toISOString(),
      expiresAt: Math.floor(file.uploadedAt.getTime() / 1000) + file.expirationSeconds,
      downloadCount: 0,
      userId: user.id,
    });
    return Response.json({ fileId }, { headers });
  } catch {
    return Response.json({ error: "Your file is uploaded, but its details could not be saved. Retry saving. If this continues, check the server’s table configuration, DynamoDB write permission, and S3 read permission." }, { status: 503, headers });
  }
}
