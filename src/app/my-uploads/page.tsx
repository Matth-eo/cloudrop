import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { getCurrentUser } from "@/lib/auth";
import { isFileExpired, listUserUploads, type FileMetadata } from "@/lib/dynamodb";

export const dynamic = "force-dynamic";
export const metadata = { title: "My uploads · Cloudrop", robots: { index: false, follow: false } };

export default async function MyUploads() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/start");
  let files: FileMetadata[] = [];
  let failed = false;
  try { files = await listUserUploads(user.id); } catch { failed = true; }

  return <div className="site-shell">
    <SiteHeader signedIn />
    <main className="uploads-library">
      <p className="eyebrow mb-6">Your collection, for now</p>
      <h1 className="font-heading text-5xl font-medium tracking-[-0.065em] sm:text-7xl">My uploads</h1>
      <p className="mt-3 text-sm text-muted">Your shared files, until their time is up.</p>
      {failed ? <div role="alert" className="mt-10 border-y border-line py-8 text-sm leading-6 text-muted">We couldn’t load your uploads. Please try again. <Link href="/my-uploads" className="text-accent underline">Reload</Link></div>
        : files.length === 0 ? <div className="mt-10 border-y border-line px-3 py-14 text-center text-sm leading-7 text-muted">No uploads yet. Newly uploaded files may take a moment to appear.<br /><Link href="/" className="mt-4 inline-block text-accent underline">Share your first file</Link></div>
          : <ul className="mt-14 divide-y divide-line border-t border-line">
            {files.map(file => <li key={file.fileId} className="group flex flex-col items-start justify-between gap-3 py-7 sm:flex-row sm:items-center sm:gap-10">
              <div className="min-w-0 max-w-full flex-1"><p className="[overflow-wrap:anywhere] font-heading text-lg font-medium tracking-tight sm:text-xl">{file.originalFileName}</p><p className="mt-1 text-xs leading-5 text-muted">{file.fileSize.toLocaleString("en-US")} bytes · {isFileExpired(file) ? "Expired · awaiting cleanup" : `Expires ${new Date(file.expiresAt * 1000).toISOString().replace("T", " ").replace(".000Z", " UTC")}`}</p></div>
              {!isFileExpired(file) && <Link href={`/d/${file.fileId}`} className="inline-flex min-h-11 shrink-0 items-center text-xs font-medium text-accent underline-offset-4 hover:underline">Open share page ↗</Link>}
            </li>)}
          </ul>}
      <Link href="/" className="mt-8 inline-flex min-h-11 items-center text-sm font-medium text-accent">Upload another file</Link>
    </main>
  </div>;
}
