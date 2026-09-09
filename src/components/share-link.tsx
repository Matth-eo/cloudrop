"use client";

import { useState } from "react";

export function ShareLink({ url }: { url: string }) {
  const [copyMessage, setCopyMessage] = useState("");
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopyMessage("Link copied.");
    } catch {
      setCopyMessage("Could not copy automatically. Select the link and copy it manually.");
    }
  }
  return (
    <div className="share-result">
      <div className="mb-6 flex items-start gap-4"><span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center text-emerald-700"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-7"><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></svg></span><div><p className="font-heading text-3xl font-medium tracking-[-0.05em]">Ready to pass along.</p><p className="mt-0.5 text-xs text-muted">Your private file now has a share link.</p></div></div>
      <label htmlFor="share-link" className="sr-only">Cloudrop share link</label>
      <input id="share-link" readOnly value={url} onFocus={(event) => event.target.select()} className="share-url" />
      <div className="mt-3 flex flex-wrap gap-2.5">
        <button type="button" onClick={copyLink} className="primary-action min-h-12 flex-1 rounded-lg px-4 py-3 text-sm font-medium">Copy link</button>
        <a href={url} target="_blank" rel="noopener noreferrer" className="min-h-12 flex-1 rounded-lg px-4 py-3 text-center text-sm font-medium transition-colors hover:bg-white/70">Open link</a>
      </div>
      <p className="mt-3 text-xs leading-5 text-muted">Anyone with this link can download the file until it expires. Opening the link checks its availability.</p>
      <p role="status" className={copyMessage ? "mt-2 text-xs leading-5 text-muted" : "sr-only"}>{copyMessage}</p>
    </div>
  );
}
