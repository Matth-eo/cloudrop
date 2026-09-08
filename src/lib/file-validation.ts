export const MAX_FILE_SIZE = 25 * 1024 * 1024;
export const ALLOWED_EXTENSIONS = [
  ".pdf", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".avif",
  ".bmp", ".tif", ".tiff", ".heic", ".heif", ".zip",
  ".txt", ".md", ".csv", ".rtf", ".doc", ".docx", ".odt",
];

export function validateFile(file: { name: string; size: number } | null) {
  if (!file) return "";
  if (!file.name.trim() || file.name.length > 255) {
    return "Choose a file with a name between 1 and 255 characters.";
  }
  if (!Number.isSafeInteger(file.size) || file.size < 0) {
    return "This file has an invalid size. Please choose it again.";
  }
  if (file.size > MAX_FILE_SIZE) {
    return "This file is too large. Choose a file that is 25 MB or smaller.";
  }

  // Extensions work even when the browser reports an empty MIME type.
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    return "This file type is not supported. Choose a PDF, image, ZIP, or text document (TXT, MD, CSV, RTF, DOC, DOCX, or ODT).";
  }

  return "";
}
