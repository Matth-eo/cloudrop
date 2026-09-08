// XMLHttpRequest provides upload progress events without another dependency.
export function uploadFile(
  url: string,
  file: File,
  contentType: string,
  onProgress: (progress: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.timeout = 5 * 60 * 1000;
    request.setRequestHeader("Content-Type", contentType);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        resolve();
      } else {
        reject(new Error(request.status === 403
          ? "S3 refused the upload. The upload link may have expired or bucket permissions may need updating. Please try again."
          : `The upload failed (HTTP ${request.status}). Please try again.`));
      }
    };
    request.onerror = () => reject(new Error("Could not reach storage. Check your connection and the bucket’s CORS settings, then try again."));
    request.ontimeout = () => reject(new Error("The upload timed out. Check your connection and try again."));
    request.onabort = () => reject(new Error("The upload was interrupted. Please try again."));
    request.send(file);
  });
}
