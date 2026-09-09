"use client";

import { useEffect, useState } from "react";

export function MetadataStatus({ objectKey, onSavingChange }: { objectKey: string; onSavingChange: (saving: boolean) => void }) {
  const [status, setStatus] = useState<"saving" | "saved" | "error">("saving");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function save() {
      try {
        const response = await fetch("/api/uploads/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: objectKey }),
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(typeof result?.error === "string" ? result.error : "Could not save file details. Please retry.");
        if (typeof result?.fileId !== "string") throw new Error("Could not confirm that file details were saved. Please retry.");
        if (!controller.signal.aborted) setStatus("saved");
      } catch (error) {
        if (!controller.signal.aborted) {
          setError(error instanceof Error && error.name === "Error" ? error.message : "Your file is uploaded, but saving its details failed. Check your connection and retry.");
          setStatus("error");
        }
      } finally {
        if (!controller.signal.aborted) onSavingChange(false);
      }
    }
    void save();
    return () => controller.abort();
  }, [objectKey, attempt, onSavingChange]);

  return (
    <div className="mt-3 text-center text-xs leading-5">
      <p role="status" className={status === "error" ? "text-red-700" : "text-muted"}>
        {status === "saving" ? "Saving file details…" : status === "saved" ? "File details saved." : error}
      </p>
      {status === "error" && <button type="button" onClick={() => { onSavingChange(true); setStatus("saving"); setError(""); setAttempt((value) => value + 1); }} className="mt-2 font-medium text-accent underline underline-offset-4">Retry saving details</button>}
    </div>
  );
}
