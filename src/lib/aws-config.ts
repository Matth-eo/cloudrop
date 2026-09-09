import "server-only";

export function getAwsConfig() {
  const region = process.env.AWS_REGION;
  if (!region) throw new Error("AWS_REGION is not configured.");
  // Both SDK clients use the same server-side credential provider chain.
  return { region };
}
