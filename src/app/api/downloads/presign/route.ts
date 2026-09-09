// Retire raw-key signing: all downloads must pass the share page's expiry checks.
export async function POST() {
  return Response.json({ error: "Use the Cloudrop share page at /d/[fileId] to download this file." }, {
    status: 410,
    headers: { "Cache-Control": "no-store" },
  });
}
