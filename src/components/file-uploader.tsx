"use client";

import { useRef, useState, type DragEvent } from "react";
import { CloudIcon } from "./cloud-icon";

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [
  ".pdf", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".avif",
  ".bmp", ".tif", ".tiff", ".heic", ".heif", ".zip",
  ".txt", ".md", ".csv", ".rtf", ".doc", ".docx", ".odt",
];

function validateFile(file: File | null) {
  if (!file) return "";
  if (file.size > MAX_FILE_SIZE) {
    return "This file is too large. Choose a file that is 25 MB or smaller.";
  }

  // Check the extension because browsers may report an empty or inconsistent MIME type.
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    return "This file type is not supported. Choose a PDF, image, ZIP, or text document (TXT, MD, CSV, RTF, DOC, DOCX, or ODT).";
  }

  return "";
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} ${bytes === 1 ? "byte" : "bytes"}`;
  const units = ["KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)) - 1, units.length - 1);
  return `${(bytes / 1024 ** (index + 1)).toLocaleString(undefined, { maximumFractionDigits: 1 })} ${units[index]}`;
}

export function FileUploader() {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [message, setMessage] = useState("");
  const validationError = validateFile(file);

  function selectFile(files: FileList | null) {
    if (!files?.length) return;
    setFile(files[0]);
    setMessage(files.length > 1 ? "One file at a time for now. The first file is selected." : "");
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    selectFile(event.dataTransfer.files);
  }

  function removeFile() {
    setFile(null);
    setMessage("");
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <section aria-label="File upload preview" className="mt-10 w-full max-w-[580px] rounded-3xl border border-white bg-white/85 p-3 shadow-[0_12px_60px_-20px_#697da338] sm:mt-12 sm:p-4">
      <div
        onDragEnter={(event) => {
          event.preventDefault();
          dragDepth.current += 1;
          setIsDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
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
        <input ref={inputRef} type="file" accept={ALLOWED_EXTENSIONS.join(",")} aria-label="Choose a file" aria-describedby="file-requirements file-error" aria-invalid={!!validationError} className="sr-only" tabIndex={-1} onChange={(event) => selectFile(event.target.files)} />
        <button type="button" onClick={() => inputRef.current?.click()} className="mt-6 rounded-xl border border-line bg-white px-5 py-2.5 text-sm font-medium shadow-sm transition-colors hover:border-[#b6c5ed] hover:bg-[#f0f4ff]">
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
                <p className="mt-0.5 text-xs text-muted">{formatFileSize(file.size)} · Selected locally</p>
              </div>
              <button type="button" aria-label="Remove selected file" onClick={removeFile} className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-[#f0f4ff] hover:text-foreground">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-4"><path d="m6 6 12 12M18 6 6 18" /></svg>
              </button>
            </div>
          ) : (
            <div className="mb-5 flex items-center justify-between gap-3 text-xs text-muted"><span>Ready when you are</span><span>No file selected</span></div>
          )}
        </div>
        <p id="file-error" role="alert" className={validationError ? "mb-4 rounded-lg bg-red-50 p-3 text-center text-xs leading-5 text-red-700" : "sr-only"}>{validationError}</p>
        <button type="button" disabled={!file || !!validationError} aria-describedby="upload-note file-error" onClick={() => {
          if (!file || validationError) return;
          setMessage("This is a frontend preview. Your file has not been uploaded and stays on your device.");
        }} className="flex w-full items-center justify-center gap-3 rounded-xl bg-accent py-3.5 text-sm font-medium text-white transition-colors hover:bg-[#3b5bc0] disabled:cursor-not-allowed disabled:bg-[#e9edf5] disabled:text-[#768297]">
          Upload file <span aria-hidden="true">↗</span>
        </button>
        <p id="upload-note" className="mt-3 text-center text-xs leading-5 text-muted">Just a preview for now. Uploads are coming later.</p>
        <p role="status" className={message ? "mt-3 rounded-lg bg-[#f0f4ff] p-3 text-center text-xs leading-5 text-accent" : "sr-only"}>{message}</p>
      </div>
    </section>
  );
}
