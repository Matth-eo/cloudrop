import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authCookieName, authCookieOptions, getAuthConfig, verifyIdToken } from "@/lib/auth";

export const runtime = "nodejs";

function matches(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function GET(request: Request) {
  let response: NextResponse;
  let stage = "configuration";
  let status: number | undefined;
  let oauthError: string | undefined;
  try {
    const config = getAuthConfig();
    stage = "callback_parameters";
    const params = new URL(request.url).searchParams;
    const code = params.get("code");
    const state = params.get("state");
    const stored = (await cookies()).get(authCookieName("flow"))?.value;
    if (!code || !state || !stored || params.has("error")) throw new Error("Invalid callback.");
    stage = "flow_validation";
    const flow = JSON.parse(stored);
    if (typeof flow.state !== "string" || typeof flow.nonce !== "string" || typeof flow.verifier !== "string" ||
      !Number.isFinite(flow.expiresAt) || flow.expiresAt < Date.now() || !matches(state, flow.state)) throw new Error("Invalid flow.");

    stage = "token_exchange";
    const tokens = await fetch(`${config.domain}/oauth2/token`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(15_000),
      headers: { "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}` },
      body: new URLSearchParams({ grant_type: "authorization_code", client_id: config.clientId,
        code, redirect_uri: config.callback, code_verifier: flow.verifier }),
    });
    status = tokens.status;
    if (!tokens.ok) {
      const body = await tokens.json().catch(() => null);
      // Only known protocol error labels are safe to log, never response bodies/descriptions.
      oauthError = ["invalid_request", "invalid_client", "invalid_grant", "unauthorized_client",
        "unsupported_grant_type", "invalid_scope", "server_error"].includes(body?.error)
        ? body.error : "unknown_oauth_error";
      throw new Error("Token exchange failed.");
    }
    stage = "token_response";
    const result = await tokens.json();
    if (typeof result.id_token !== "string" || result.id_token.length > 3800) throw new Error("Invalid token.");
    stage = "token_verification";
    const claims = await verifyIdToken(result.id_token);
    stage = "nonce_validation";
    if (typeof claims.nonce !== "string" || !matches(claims.nonce, flow.nonce)) throw new Error("Invalid nonce.");
    stage = "session_cookie";
    response = NextResponse.redirect(new URL("/", config.origin));
    response.cookies.set(authCookieName("session"), result.id_token, {
      ...authCookieOptions(), maxAge: Math.max(0, Math.floor(claims.exp - Date.now() / 1000)),
    });
  } catch (error) {
    const name = error && typeof error === "object" && "name" in error ? error.name : undefined;
    const errorType = ["Error", "TypeError", "SyntaxError", "TimeoutError", "AbortError", "CognitoClientSecretPlaceholderError",
      "JwtExpiredError", "JwtInvalidIssuerError", "JwtInvalidAudienceError", "JwtInvalidSignatureError",
      "CognitoJwtInvalidClientIdError", "CognitoJwtInvalidTokenUseError"].includes(name as string)
      ? name : "UnknownError";
    // Do not log the error object/message, request URL, headers, or any credential values.
    console.error("cognito_callback_failed", { stage, errorType, status, oauthError });
    response = NextResponse.redirect(new URL("/auth/error", request.url));
  }
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  try { response.cookies.set(authCookieName("flow"), "", { ...authCookieOptions(), maxAge: 0 }); } catch { /* Configuration may be missing. */ }
  return response;
}
