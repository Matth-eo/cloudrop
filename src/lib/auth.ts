import "server-only";

import { cookies } from "next/headers";
import { CognitoJwtVerifier } from "aws-jwt-verify";

export function getAuthConfig() {
  const appUrl = process.env.APP_URL;
  const domain = process.env.COGNITO_DOMAIN;
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  const clientId = process.env.COGNITO_CLIENT_ID;
  const clientSecret = process.env.COGNITO_CLIENT_SECRET;
  if (!appUrl || !domain || !userPoolId || !clientId || !clientSecret) {
    throw new Error("Cognito is not configured.");
  }
  if (["your_actual_app_client_secret", "<client secret>", "your_app_client_secret"].includes(clientSecret)) {
    const error = new Error("Replace the Cognito client secret placeholder in server configuration.");
    error.name = "CognitoClientSecretPlaceholderError";
    throw error;
  }
  const app = new URL(appUrl);
  const cognito = new URL(domain);
  if ((app.protocol !== "https:" && !(app.protocol === "http:" && app.hostname === "localhost")) ||
    cognito.protocol !== "https:" || app.pathname !== "/" || cognito.pathname !== "/" ||
    app.search || app.hash || app.username || app.password || cognito.search || cognito.hash || cognito.username || cognito.password) {
    throw new Error("Invalid authentication URL configuration.");
  }
  return { origin: app.origin, domain: cognito.origin, userPoolId, clientId, clientSecret,
    callback: `${app.origin}/auth/callback`, secure: app.protocol === "https:" };
}

export function authCookieOptions() {
  return { httpOnly: true, secure: getAuthConfig().secure, sameSite: "lax" as const, path: "/" };
}

export function authCookieName(kind: "session" | "flow") {
  return `${getAuthConfig().secure ? "__Host-" : ""}cloudrop_${kind}`;
}

let verifier: ReturnType<typeof CognitoJwtVerifier.create> | undefined;

export async function verifyIdToken(token: string) {
  const { userPoolId, clientId } = getAuthConfig();
  verifier ??= CognitoJwtVerifier.create({ userPoolId, clientId, tokenUse: "id" });
  return verifier.verify(token);
}

export async function getCurrentUser() {
  try {
    const token = (await cookies()).get(authCookieName("session"))?.value;
    if (!token) return null;
    const claims = await verifyIdToken(token);
    return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : "" };
  } catch {
    // Invalid, expired, or unverifiable tokens must never authorize an upload.
    return null;
  }
}

export function isSameOrigin(request: Request) {
  try { return request.headers.get("origin") === getAuthConfig().origin; }
  catch { return false; }
}
