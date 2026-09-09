"use client";

import { useRef, useState, type DragEvent } from "react";
import { CloudIcon } from "./cloud-icon";
import { ALLOWED_EXTENSIONS, validateFile } from "@/lib/file-validation";
import { uploadFile } from "@/lib/upload-file";
import { MetadataStatus } from "./metadata-status";
import { ExpirationPicker } from "./expiration-picker";
import { DEFAULT_EXPIRATION_SECONDS } from "@/lib/expiration";

type UploadStatus = "idle" | "preparing" | "uploading" | "success" | "error";

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} ${bytes === 1 ? "byte" : "bytes"}`;
  const units = ["KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)) - 1, units.length - 1);
  return `${(bytes / 1024 ** (index + 1)).toLocaleString(undefined, { maximumFractionDigits: 1 })} ${units[index]}`;
}

export function FileUploader() {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const uploadInFlight = useRef(false);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [uploadedKey, setUploadedKey] = useState<string | null>(null);
  const [metadataSaving, setMetadataSaving] = useState(false);
  const [expirationSeconds, setExpirationSeconds] = useState<number>(DEFAULT_EXPIRATION_SECONDS);
  const [sessionExpired, setSessionExpired] = useState(false);
  const validationError = validateFile(file);
  const isUploading = status === "preparing" || status === "uploading" || metadataSaving;

  function selectFile(files: FileList | null) {
    if (uploadInFlight.current || metadataSaving || !files?.length) return;
    setFile(files[0]);
    setUploadedKey(null);
    setStatus("idle");
    setProgress(0);
    setMessage(files.length > 1 ? "One file at a time for now. The first file is selected." : "");
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    selectFile(event.dataTransfer.files);
  }

  function removeFile() {
    if (uploadInFlight.current || metadataSaving) return;
    setFile(null);
    setUploadedKey(null);
    setStatus("idle");
    setProgress(0);
    setMessage("");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleUpload() {
    if (!file || validationError || uploadInFlight.current || status === "success") return;
    uploadInFlight.current = true;
    setStatus("preparing");
    setProgress(0);
    setMessage("Preparing your upload…");
    setSessionExpired(false);

    try {
      const response = await fetch("/api/uploads/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type, expirationSeconds }),
        signal: AbortSignal.timeout(30_000),
      });
      const result = await response.json();
      if (response.status === 401) setSessionExpired(true);
      if (!response.ok) {
        throw new Error(typeof result?.error === "string" ? result.error : "Could not prepare the upload. Please try again.");
      }
      if (typeof result?.url !== "string" || typeof result?.contentType !== "string" || typeof result?.key !== "string") {
        throw new Error("The server returned an invalid upload link. Please try again.");
      }

      setStatus("uploading");
      setMessage("Uploading your file…");
      await uploadFile(result.url, file, result.contentType, setProgress);
      setProgress(100);
      setStatus("success");
      setMetadataSaving(true);
      setUploadedKey(result.key);
      setMessage("Upload complete. Your file is stored privately.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error && error.name === "Error"
        ? error.message
        : "Could not complete the upload. Check your connection and try again.");
    } finally {
      uploadInFlight.current = false;
    }
  }

  return (
    <section aria-label="File upload" aria-busy={isUploading} className="upload-workspace">
      <div
        onDragEnter={(event) => {
          event.preventDefault();
          if (uploadInFlight.current || metadataSaving) return;
          dragDepth.current += 1;
          setIsDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = isUploading ? "none" : "copy";
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setIsDragging(false);
        }}
        onDrop={handleDrop}
        className={`drop-surface ${isDragging ? "is-dragging" : ""}`}
      >
        <div className="drop-symbol" aria-hidden="true">
          <CloudIcon className="size-12" />
        </div>
        <h2 className="font-heading text-[clamp(2.1rem,4vw,3.25rem)] leading-[1.05] font-medium tracking-[-0.055em]">{isDragging ? "Let it drop." : "Drop it here."}</h2>
        <p className="mt-4 text-sm text-muted">Drag &amp; drop a file here, or pick one below.</p>
        <input ref={inputRef} disabled={isUploading} type="file" accept={ALLOWED_EXTENSIONS.join(",")} aria-label="Choose a file" aria-describedby="file-requirements file-error" aria-invalid={!!validationError} className="sr-only" tabIndex={-1} onChange={(event) => selectFile(event.target.files)} />
        <button type="button" disabled={isUploading} onClick={() => inputRef.current?.click()} className="choose-file">
          {file ? "Choose another file" : "Choose file"}
        </button>
        <p id="file-requirements" className="mt-7 max-w-xs text-[11px] leading-5 text-muted">PDF, images, ZIP &amp; text documents · Max 25 MB · One file at a time</p>
      </div>

      <div className="upload-controls">
        <div aria-live="polite" aria-atomic="true">
          {file ? (
            <div className="mb-6 flex min-w-0 items-center gap-3 border-b border-line pb-5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#e9eee7] text-accent">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-5"><path d="M14 3H6v18h12V7l-4-4Z" /><path d="M14 3v5h4M9 12h6m-6 4h6" /></svg>
              </span>
              <div className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-medium" title={file.name}>{file.name}</p>
                <p className="mt-0.5 text-xs text-muted">{formatFileSize(file.size)} · {status === "success" ? "Uploaded" : "Selected locally"}</p>
              </div>
              <button type="button" disabled={isUploading} aria-label="Clear file selection" onClick={removeFile} className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-[#e9eee7] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-4"><path d="m6 6 12 12M18 6 6 18" /></svg>
              </button>
            </div>
          ) : (
            <div className="mb-6 flex items-center justify-between gap-3 text-[11px] text-muted"><span>Ready when you are</span><span>No file selected</span></div>
          )}
        </div>
        <p id="file-error" role="alert" className={validationError ? "mb-4 rounded-lg bg-red-50 p-3 text-center text-xs leading-5 text-red-700" : "sr-only"}>{validationError}</p>
        <ExpirationPicker value={expirationSeconds} onChange={setExpirationSeconds} disabled={isUploading || status === "success"} />
        {status === "uploading" && (
          <div className="mb-4">
            <div className="mb-2 flex justify-between text-xs text-muted"><span>{progress === 100 ? "Confirming upload…" : "Uploading…"}</span><span>{progress}%</span></div>
            <div role="progressbar" aria-label="File upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className="h-1.5 overflow-hidden rounded-full bg-[#e3e8e0]">
              <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
        <button type="button" disabled={!file || !!validationError || isUploading || status === "success"} aria-describedby="upload-note file-error" onClick={handleUpload} className="primary-action flex min-h-13 w-full items-center justify-center gap-3 rounded-lg py-3.5 text-sm font-medium">
          {status === "preparing" ? "Preparing…" : status === "uploading" ? "Uploading…" : status === "success" ? "Uploaded ✓" : status === "error" ? "Try upload again ↗" : "Upload file ↗"}
        </button>
        <p id="upload-note" className="mt-3 text-center text-xs leading-5 text-muted">Private storage. Temporary links for easy sharing.</p>
        <p role="status" className={message ? `mt-3 rounded-lg p-3 text-center text-xs leading-5 ${status === "error" ? "bg-red-50 text-red-700" : status === "success" ? "text-emerald-800" : "bg-[#e9eee7] text-accent"}` : "sr-only"}>{message}</p>
        {sessionExpired && <a href="/auth/start" target="_blank" rel="noopener noreferrer" className="mt-3 block text-center text-sm text-accent underline">Sign in in a new tab, then retry here</a>}
        {status === "success" && uploadedKey && (
          <div key={uploadedKey}>
            <MetadataStatus objectKey={uploadedKey} onSavingChange={setMetadataSaving} />
          </div>
        )}
      </div>
    </section>
  );
}
