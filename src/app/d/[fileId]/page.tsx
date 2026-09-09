import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CloudIcon } from "@/components/cloud-icon";
import { getFileMetadata, isFileExpired } from "@/lib/dynamodb";
import { createDownloadLink } from "@/lib/s3";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = {
  title: "Shared file · Cloudrop",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function DownloadPage({ params, searchParams }: {
  params: Promise<{ fileId: string }>;
  searchParams: Promise<{ download?: string }>;
}) {
  const { fileId } = await params;
  const { download } = await searchParams;
  let file = null;
  let title = "File unavailable";
  let description = "This link is invalid or the file is no longer available.";
  let downloadUrl: string | null = null;

  try {
    file = await getFileMetadata(fileId);
    if (file && isFileExpired(file)) {
      title = "This link has expired";
      description = "This file is no longer available through Cloudrop. Ask the sender to share it again.";
      file = null;
    } else if (file && download === "1") {
      downloadUrl = (await createDownloadLink(file.s3Key, file.expiresAt)).url;
    }
  } catch {
    title = "Temporarily unavailable";
    description = "We couldn’t prepare this file. It may have been removed, or storage may be unavailable. Please try again.";
    file = null;
  }

  // Next.js redirect throws internally, so keep it outside the AWS error handler.
  if (downloadUrl) redirect(downloadUrl);

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-[620px] flex-col items-center justify-center px-6 py-16">
      <Link href="/" className="mb-8 flex items-center gap-2 font-heading text-xl font-semibold">
        <span className="rounded-xl bg-accent p-2 text-white"><CloudIcon className="size-6" /></span>cloudrop.
      </Link>
      <section className="w-full rounded-3xl border border-white bg-white/85 p-7 text-center shadow-[0_12px_60px_-20px_#697da338] sm:p-10">
        <h1 className="font-heading text-2xl font-medium tracking-tight">{file ? "A file for you." : title}</h1>
        {file ? (
          <>
            <p className="mt-5 break-words text-base font-medium">{file.originalFileName}</p>
            <p className="mt-2 text-sm text-muted">{file.fileSize.toLocaleString("en-US")} bytes</p>
            <form action={`/d/${fileId}`} method="get" className="mt-6">
              <input type="hidden" name="download" value="1" />
              <button type="submit" className="w-full rounded-xl bg-accent px-5 py-3.5 text-sm font-medium text-white hover:bg-[#3b5bc0]">Download file ↗</button>
            </form>
            <p className="mt-4 text-xs leading-5 text-muted">Available until {new Date(file.expiresAt * 1000).toISOString().replace("T", " ").replace(".000Z", " UTC")}. Stored privately, shared by link.</p>
          </>
        ) : (
          <>
            <p className="mt-4 text-sm leading-6 text-muted">{description}</p>
            <Link href={`/d/${fileId}`} className="mt-6 inline-block text-sm font-medium text-accent underline underline-offset-4">Check again</Link>
          </>
        )}
      </section>
      <Link href="/" className="mt-6 text-sm text-muted hover:text-foreground">Share a file with Cloudrop</Link>
    </main>
  );
}
