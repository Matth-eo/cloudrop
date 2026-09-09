import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { authCookieName, authCookieOptions, getAuthConfig } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const config = getAuthConfig();
    const state = randomBytes(32).toString("base64url");
    const nonce = randomBytes(32).toString("base64url");
    const verifier = randomBytes(32).toString("base64url");
    const signup = new URL(request.url).searchParams.get("mode") === "signup";
    const url = new URL(signup ? "/signup" : "/oauth2/authorize", config.domain);
    url.search = new URLSearchParams({
      client_id: config.clientId, response_type: "code", scope: "openid email",
      redirect_uri: config.callback, state, nonce,
      code_challenge_method: "S256",
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    }).toString();
    const response = NextResponse.redirect(url);
    response.headers.set("Cache-Control", "no-store");
    response.cookies.set(authCookieName("flow"), JSON.stringify({ state, nonce, verifier, expiresAt: Date.now() + 600_000 }), { ...authCookieOptions(), maxAge: 600 });
    return response;
  } catch {
    return NextResponse.redirect(new URL("/auth/error", request.url));
  }
}
