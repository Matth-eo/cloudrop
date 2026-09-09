import { ALLOWED_EXTENSIONS } from "./file-validation";

export function getFileId(key: string) {
  const match = /^uploads\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(\.[a-z]+)$/.exec(key);
  return match && ALLOWED_EXTENSIONS.includes(match[2]) ? match[1] : null;
}
