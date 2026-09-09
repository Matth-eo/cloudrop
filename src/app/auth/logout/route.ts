import { NextResponse } from "next/server";
import { authCookieName, authCookieOptions, getAuthConfig, isSameOrigin } from "@/lib/auth";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Invalid sign-out request." }, { status: 403 });
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
