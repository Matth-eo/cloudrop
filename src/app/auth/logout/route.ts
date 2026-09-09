import { NextResponse } from "next/server";
import { authCookieName, authCookieOptions, getAuthConfig, isSameOrigin } from "@/lib/auth";

function isAllowedSignOut(request: Request) {
  if (isSameOrigin(request)) return true;
  const origin = request.headers.get("origin");
  // A no-referrer policy can make a legitimate native form POST's Origin null.
  // Fetch Metadata is browser-controlled: same-site or cross-site is not enough.
  if (origin !== null && origin !== "null") return false;
  try {
    return request.headers.get("sec-fetch-site") === "same-origin" &&
      new URL(request.url).origin === getAuthConfig().origin;
  } catch { return false; }
}

export async function POST(request: Request) {
  if (!isAllowedSignOut(request)) {
    console.error("cognito_signout_rejected", {
      reason: "unverified_request_origin",
      originMissingOrNull: !request.headers.get("origin") || request.headers.get("origin") === "null",
      browserReportsSameOrigin: request.headers.get("sec-fetch-site") === "same-origin",
    });
    return Response.json({ error: "Invalid sign-out request." }, { status: 403 });
  }
  const config = getAuthConfig();
  const url = new URL("/logout", config.domain);
  url.search = new URLSearchParams({ client_id: config.clientId, logout_uri: `${config.origin}/` }).toString();
  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "no-store");
  for (const kind of ["session", "flow"] as const) {
    response.cookies.set(authCookieName(kind), "", { ...authCookieOptions(), maxAge: 0 });
  }
  return response;
}
