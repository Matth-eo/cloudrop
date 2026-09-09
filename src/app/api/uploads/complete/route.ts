import { saveFileMetadata } from "@/lib/dynamodb";
import { getFileId } from "@/lib/file-key";
import { validateFile } from "@/lib/file-validation";
import { getUploadedFile } from "@/lib/s3";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
const FILE_LIFETIME_SECONDS = 24 * 60 * 60;

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: "Metadata requests must come from this site." }, { status: 403, headers });
  }

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
    const validationError = validateFile(file);
    if (validationError) return Response.json({ error: validationError }, { status: 400, headers });
    await saveFileMetadata({
      fileId,
      originalFileName: file.name,
      s3Key: body.key,
      fileSize: file.size,
      uploadedAt: file.uploadedAt.toISOString(),
      expiresAt: Math.floor(file.uploadedAt.getTime() / 1000) + FILE_LIFETIME_SECONDS,
      downloadCount: 0,
    });
    return Response.json({ fileId }, { headers });
  } catch {
    return Response.json({ error: "Your file is uploaded, but its details could not be saved. Retry saving. If this continues, check the server’s table configuration, DynamoDB write permission, and S3 read permission." }, { status: 503, headers });
  }
}
