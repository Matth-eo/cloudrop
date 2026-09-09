"use client";

import { useEffect, useState } from "react";

export function ShareLink({ objectKey }: { objectKey: string }) {
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function generateLink() {
      try {
        const response = await fetch("/api/downloads/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: objectKey }),
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result?.error || "Could not create a download link. Please try again.");
        if (typeof result?.url !== "string" || !result.url.startsWith("https://") ||
          typeof result?.expiresAt !== "string" || !Number.isFinite(Date.parse(result.expiresAt))) {
          throw new Error("The server returned an invalid download link. Please try again.");
        }
        if (!controller.signal.aborted) setLink(result);
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error && error.name === "Error"
          ? error.message : "Could not create a download link. Check your connection and try again.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void generateLink();
    return () => controller.abort();
  }, [objectKey, attempt]);

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopyMessage("Link copied.");
    } catch {
      setCopyMessage("Could not copy automatically. Select the link above and copy it manually.");
    }
  }

  function retry() {
    setLink(null);
    setError("");
    setCopyMessage("");
    setLoading(true);
    setAttempt((value) => value + 1);
  }

  return (
    <div className="mt-4 rounded-xl border border-line bg-[#f6f8fd] p-4">
      <p className="text-sm font-medium">Share your file</p>
      {loading && <p role="status" className="mt-2 text-xs text-muted">Creating your temporary link…</p>}
      {error && <p role="alert" className="mt-2 text-xs leading-5 text-red-700">{error}</p>}
      {link && (
        <>
          <label htmlFor="share-link" className="sr-only">Temporary download link</label>
          <input id="share-link" readOnly value={link.url} onFocus={(event) => event.target.select()} className="mt-3 w-full min-w-0 rounded-lg border border-line bg-white px-3 py-2.5 text-xs text-muted" />
          <div className="mt-3 flex gap-3">
            <button type="button" onClick={copyLink} className="flex-1 rounded-lg bg-accent px-3 py-2.5 text-sm font-medium text-white hover:bg-[#3b5bc0]">Copy link</button>
            <a href={link.url} target="_blank" rel="noopener noreferrer" className="flex-1 rounded-lg border border-line bg-white px-3 py-2.5 text-center text-sm font-medium hover:bg-[#f0f4ff]">Open link ↗</a>
          </div>
          <p className="mt-3 text-xs leading-5 text-muted">Anyone with this link can download the file. Valid for up to 15 minutes, until {new Date(link.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. The file itself is not deleted when the link expires.</p>
          <p role="status" className={copyMessage ? "mt-2 text-xs leading-5 text-muted" : "sr-only"}>{copyMessage}</p>
        </>
      )}
      {!loading && <button type="button" onClick={retry} className="mt-3 text-xs font-medium text-accent underline underline-offset-4">{error ? "Retry link generation" : "Generate a new link"}</button>}
    </div>
  );
}
