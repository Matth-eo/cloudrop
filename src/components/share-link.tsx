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
    <div className="mt-4 rounded-xl border border-line bg-[#f6f8fd] p-4 text-left">
      <p className="text-sm font-medium">Share your file</p>
      <label htmlFor="share-link" className="sr-only">Cloudrop share link</label>
      <input id="share-link" readOnly value={url} onFocus={(event) => event.target.select()} className="mt-3 w-full min-w-0 rounded-lg border border-line bg-white px-3 py-2.5 text-xs text-muted" />
      <div className="mt-3 flex gap-3">
        <button type="button" onClick={copyLink} className="flex-1 rounded-lg bg-accent px-3 py-2.5 text-sm font-medium text-white hover:bg-[#3b5bc0]">Copy link</button>
        <a href={url} target="_blank" rel="noopener noreferrer" className="flex-1 rounded-lg border border-line bg-white px-3 py-2.5 text-center text-sm font-medium hover:bg-[#f0f4ff]">Open link</a>
      </div>
      <p className="mt-3 text-xs leading-5 text-muted">Anyone with this link can download the file until it expires. Opening the link checks its availability.</p>
      <p role="status" className={copyMessage ? "mt-2 text-xs leading-5 text-muted" : "sr-only"}>{copyMessage}</p>
    </div>
  );
}
