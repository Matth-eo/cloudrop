import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountNav } from "@/components/account-nav";
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

  return <div className="mx-auto w-full max-w-3xl px-6 py-8">
    <header className="flex items-center justify-between gap-4"><Link href="/" className="font-heading text-xl font-semibold">cloudrop.</Link><AccountNav signedIn /></header>
    <main className="py-14">
      <h1 className="font-heading text-3xl tracking-tight">My uploads</h1>
      <p className="mt-3 text-sm text-muted">Your shared files, until their time is up.</p>
      {failed ? <div role="alert" className="mt-8 rounded-2xl border border-line bg-white p-6 text-sm text-muted">We couldn’t load your uploads. Please try again. <Link href="/my-uploads" className="text-accent underline">Reload</Link></div>
        : files.length === 0 ? <div className="mt-8 rounded-2xl border border-line bg-white p-8 text-center text-sm text-muted">No uploads yet. Newly uploaded files may take a moment to appear.<br /><Link href="/" className="mt-4 inline-block text-accent underline">Share your first file</Link></div>
          : <ul className="mt-8 divide-y divide-line rounded-2xl border border-line bg-white px-5">
            {files.map(file => <li key={file.fileId} className="flex flex-wrap items-center justify-between gap-4 py-5">
              <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{file.originalFileName}</p><p className="mt-1 text-xs leading-5 text-muted">{file.fileSize.toLocaleString("en-US")} bytes · {isFileExpired(file) ? "Expired · awaiting cleanup" : `Expires ${new Date(file.expiresAt * 1000).toISOString().replace("T", " ").replace(".000Z", " UTC")}`}</p></div>
              {!isFileExpired(file) && <Link href={`/d/${file.fileId}`} className="text-sm font-medium text-accent">Open share page ↗</Link>}
            </li>)}
          </ul>}
      <Link href="/" className="mt-8 inline-block text-sm text-accent">Upload another file</Link>
    </main>
  </div>;
}
