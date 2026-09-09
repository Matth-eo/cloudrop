export const EXPIRATION_OPTIONS = [
  { seconds: 3600, label: "1 hour" },
  { seconds: 86400, label: "24 hours" },
  { seconds: 604800, label: "7 days" },
] as const;

export const DEFAULT_EXPIRATION_SECONDS = 86400;

export function isExpirationSeconds(value: unknown): value is number {
  return typeof value === "number" && EXPIRATION_OPTIONS.some((option) => option.seconds === value);
}
