"use client";

import { useRef, useState, type DragEvent } from "react";
import { CloudIcon } from "./cloud-icon";
import { ALLOWED_EXTENSIONS, validateFile } from "@/lib/file-validation";
import { uploadFile } from "@/lib/upload-file";
import { MetadataStatus } from "./metadata-status";

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

    try {
      const response = await fetch("/api/uploads/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
        signal: AbortSignal.timeout(30_000),
      });
      const result = await response.json();
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
    <section aria-label="File upload" aria-busy={isUploading} className="mt-10 w-full max-w-[580px] rounded-3xl border border-white bg-white/85 p-3 shadow-[0_12px_60px_-20px_#697da338] sm:mt-12 sm:p-4">
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
        className={`flex min-h-[290px] flex-col items-center justify-center rounded-2xl border border-dashed px-5 py-9 text-center transition-colors ${isDragging ? "border-accent bg-[#eaf0ff]" : "border-[#cdd7ed] bg-[#f6f8fd]/80"}`}
      >
        <div className="mb-6 flex size-16 -rotate-6 items-center justify-center rounded-[20px] border border-white bg-white text-accent shadow-[0_6px_20px_#526fba12]">
          <CloudIcon className="size-8 rotate-6" />
        </div>
        <h2 className="font-heading text-xl font-medium tracking-tight">{isDragging ? "Let it drop." : "Your file’s next stop."}</h2>
        <p className="mt-2 text-sm text-muted">Drag &amp; drop a file here, or pick one below.</p>
        <input ref={inputRef} disabled={isUploading} type="file" accept={ALLOWED_EXTENSIONS.join(",")} aria-label="Choose a file" aria-describedby="file-requirements file-error" aria-invalid={!!validationError} className="sr-only" tabIndex={-1} onChange={(event) => selectFile(event.target.files)} />
        <button type="button" disabled={isUploading} onClick={() => inputRef.current?.click()} className="mt-6 rounded-xl border border-line bg-white px-5 py-2.5 text-sm font-medium shadow-sm transition-colors hover:border-[#b6c5ed] hover:bg-[#f0f4ff] disabled:cursor-not-allowed disabled:opacity-50">
          {file ? "Choose another file" : "Choose file"}
        </button>
        <p id="file-requirements" className="mt-4 text-xs leading-5 text-muted">PDF, images, ZIP &amp; text documents · Max 25 MB · One file at a time</p>
      </div>

      <div className="px-2 pb-2 pt-5 sm:px-3">
        <div aria-live="polite" aria-atomic="true">
          {file ? (
            <div className="mb-5 flex min-w-0 items-center gap-3 rounded-xl border border-line p-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#f0f4ff] text-accent">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-5"><path d="M14 3H6v18h12V7l-4-4Z" /><path d="M14 3v5h4M9 12h6m-6 4h6" /></svg>
              </span>
              <div className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-medium" title={file.name}>{file.name}</p>
                <p className="mt-0.5 text-xs text-muted">{formatFileSize(file.size)} · {status === "success" ? "Uploaded" : "Selected locally"}</p>
              </div>
              <button type="button" disabled={isUploading} aria-label="Clear file selection" onClick={removeFile} className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-[#f0f4ff] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-4"><path d="m6 6 12 12M18 6 6 18" /></svg>
              </button>
            </div>
          ) : (
            <div className="mb-5 flex items-center justify-between gap-3 text-xs text-muted"><span>Ready when you are</span><span>No file selected</span></div>
          )}
        </div>
        <p id="file-error" role="alert" className={validationError ? "mb-4 rounded-lg bg-red-50 p-3 text-center text-xs leading-5 text-red-700" : "sr-only"}>{validationError}</p>
        {status === "uploading" && (
          <div className="mb-4">
            <div className="mb-2 flex justify-between text-xs text-muted"><span>{progress === 100 ? "Confirming upload…" : "Uploading…"}</span><span>{progress}%</span></div>
            <div role="progressbar" aria-label="File upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className="h-1.5 overflow-hidden rounded-full bg-[#e9edf5]">
              <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
        <button type="button" disabled={!file || !!validationError || isUploading || status === "success"} aria-describedby="upload-note file-error" onClick={handleUpload} className="flex w-full items-center justify-center gap-3 rounded-xl bg-accent py-3.5 text-sm font-medium text-white transition-colors hover:bg-[#3b5bc0] disabled:cursor-not-allowed disabled:bg-[#e9edf5] disabled:text-[#768297]">
          {status === "preparing" ? "Preparing…" : status === "uploading" ? "Uploading…" : status === "success" ? "Uploaded ✓" : status === "error" ? "Try upload again ↗" : "Upload file ↗"}
        </button>
        <p id="upload-note" className="mt-3 text-center text-xs leading-5 text-muted">Private storage. Temporary links for easy sharing.</p>
        <p role="status" className={message ? `mt-3 rounded-lg p-3 text-center text-xs leading-5 ${status === "error" ? "bg-red-50 text-red-700" : status === "success" ? "bg-emerald-50 text-emerald-800" : "bg-[#f0f4ff] text-accent"}` : "sr-only"}>{message}</p>
        {status === "success" && uploadedKey && (
          <div key={uploadedKey}>
            <MetadataStatus objectKey={uploadedKey} onSavingChange={setMetadataSaving} />
          </div>
        )}
      </div>
    </section>
  );
}
