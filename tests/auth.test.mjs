import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import * as crypto from "node:crypto";
import ts from "typescript";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { NextResponse } from "next/server.js";
import * as dynamodb from "@aws-sdk/client-dynamodb";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsx from "react/jsx-runtime";

const env = { APP_URL: "https://cloudrop.test", COGNITO_DOMAIN: "https://example.auth.us-east-1.amazoncognito.com",
  COGNITO_USER_POOL_ID: "us-east-1_Test", COGNITO_CLIENT_ID: "testclient", COGNITO_CLIENT_SECRET: "test-only-secret",
  AWS_DYNAMODB_TABLE_NAME: "test-table" };

function load(path, resolve, extra = {}) {
  const exports = {};
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(code, { exports, require: resolve, process: { env }, Date, Buffer, URL, URLSearchParams, Response, AbortSignal, ...extra });
  return exports;
}

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "test-key", alg: "RS256", use: "sig" };
function token(overrides = {}) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const data = `${encode({ alg: "RS256", kid: "test-key" })}.${encode({
    iss: `https://cognito-idp.us-east-1.amazonaws.com/${env.COGNITO_USER_POOL_ID}`,
    aud: env.COGNITO_CLIENT_ID, token_use: "id", sub: "user-one", email: "test@example.test",
    exp: Math.floor(Date.now() / 1000) + 3600, nonce: "test-nonce", ...overrides,
  })}`;
  return `${data}.${crypto.sign("RSA-SHA256", Buffer.from(data), privateKey).toString("base64url")}`;
}

function authSetup() {
  const jar = new Map();
  const cookieAccess = async () => ({ get: name => jar.has(name) ? { value: jar.get(name) } : undefined });
  const auth = load("../src/lib/auth.ts", name => ({ "server-only": {}, "next/headers": { cookies: cookieAccess },
    "aws-jwt-verify": { CognitoJwtVerifier: { create: config => { const verifier = CognitoJwtVerifier.create(config); verifier.cacheJwks({ keys: [jwk] }); return verifier; } } },
  })[name]);
  return { auth, jar, cookieAccess };
}

test("session verifies real JWT signatures, issuer, audience, token use, and expiry", async () => {
  const { auth, jar } = authSetup();
  assert.equal(await auth.getCurrentUser(), null);
  jar.set(auth.authCookieName("session"), token());
  assert.equal((await auth.getCurrentUser()).id, "user-one");
  for (const invalid of [token({ exp: 1 }), token({ aud: "other-client" }), token({ iss: "https://other.invalid" }), token({ token_use: "access" }), token().replace(/.$/, "!")]) {
    jar.set(auth.authCookieName("session"), invalid);
    assert.equal(await auth.getCurrentUser(), null);
  }
  assert.equal(auth.authCookieOptions().httpOnly, true);
  assert.equal(auth.authCookieOptions().secure, true);
  assert.equal(auth.isSameOrigin(new Request(env.APP_URL, { headers: { Origin: "https://other.invalid" } })), false);
});

test("sign-in and sign-up use PKCE, state, nonce and HttpOnly flow cookies", async () => {
  const { auth } = authSetup();
  const start = load("../src/app/auth/start/route.ts", name => ({ "node:crypto": crypto, "next/server": { NextResponse }, "@/lib/auth": auth })[name]);
  for (const mode of ["", "?mode=signup"]) {
    const response = await start.GET(new Request(`${env.APP_URL}/auth/start${mode}`));
    const location = new URL(response.headers.get("location"));
    const cookie = response.cookies.get(auth.authCookieName("flow"));
    const flow = JSON.parse(cookie.value);
    assert.equal(location.pathname, mode ? "/signup" : "/oauth2/authorize");
    assert.equal(location.searchParams.get("state"), flow.state);
    assert.equal(location.searchParams.get("nonce"), flow.nonce);
    assert.equal(location.searchParams.get("code_challenge"), crypto.createHash("sha256").update(flow.verifier).digest("base64url"));
    assert.equal(cookie.httpOnly, true);
    assert.ok(!location.href.includes(env.COGNITO_CLIENT_SECRET));
  }
});

test("callback checks state and nonce before setting a verified session", async () => {
  const { auth, jar, cookieAccess } = authSetup();
  let exchanges = 0;
  const callback = load("../src/app/auth/callback/route.ts", name => ({ "node:crypto": crypto, "next/headers": { cookies: cookieAccess }, "next/server": { NextResponse }, "@/lib/auth": auth })[name], {
    fetch: async (_url, options) => { exchanges++; assert.equal(options.body.get("code_verifier"), "test-verifier"); return Response.json({ id_token: token() }); },
  });
  jar.set(auth.authCookieName("flow"), JSON.stringify({ state: "test-state", nonce: "test-nonce", verifier: "test-verifier", expiresAt: Date.now() + 60_000 }));
  const bad = await callback.GET(new Request(`${env.APP_URL}/auth/callback?code=test&state=wrong`));
  assert.equal(new URL(bad.headers.get("location")).pathname, "/auth/error");
  assert.equal(exchanges, 0);
  const good = await callback.GET(new Request(`${env.APP_URL}/auth/callback?code=test&state=test-state`));
  assert.equal(new URL(good.headers.get("location")).pathname, "/");
  assert.equal(good.cookies.get(auth.authCookieName("session")).httpOnly, true);
  assert.equal(good.cookies.get(auth.authCookieName("flow")).maxAge, 0);
  jar.set(auth.authCookieName("flow"), JSON.stringify({ state: "test-state", nonce: "wrong", verifier: "test-verifier", expiresAt: Date.now() + 60_000 }));
  const wrongNonce = await callback.GET(new Request(`${env.APP_URL}/auth/callback?code=test&state=test-state`));
  assert.equal(wrongNonce.cookies.get(auth.authCookieName("session")), undefined);
});

test("sign-out requires same-origin POST and clears local session", async () => {
  const { auth } = authSetup();
  const logout = load("../src/app/auth/logout/route.ts", name => ({ "next/server": { NextResponse }, "@/lib/auth": auth })[name]);
  assert.equal((await logout.POST(new Request(env.APP_URL, { method: "POST" }))).status, 403);
  const response = await logout.POST(new Request(env.APP_URL, { method: "POST", headers: { Origin: env.APP_URL } }));
  assert.equal(response.status, 303);
  assert.equal(response.cookies.get(auth.authCookieName("session")).maxAge, 0);
  assert.equal(new URL(response.headers.get("location")).pathname, "/logout");
});

test("My uploads queries only the current owner and never returns foreign records", async () => {
  const validation = load("../src/lib/file-validation.ts");
  const keys = load("../src/lib/file-key.ts", () => validation);
  const id = "12345678-1234-4234-8234-123456789abc";
  const item = { fileId: { S: id }, s3Key: { S: `uploads/${id}.txt` }, originalFileName: { S: "notes.txt" }, fileSize: { N: "5" }, expiresAt: { N: "1900000000" }, userId: { S: "user-one" } };
  let calls = 0;
  class Client {
    async send(command) {
      assert.ok(command instanceof dynamodb.QueryCommand);
      assert.equal(command.input.KeyConditionExpression, "userId = :userId");
      assert.equal(command.input.ExpressionAttributeValues[":userId"].S, "user-one");
      calls++;
      return calls === 1 ? { Items: [item, { ...item, userId: { S: "other-user" } }], LastEvaluatedKey: { fileId: { S: id } } } : { Items: [] };
    }
    destroy() {}
  }
  const db = load("../src/lib/dynamodb.ts", name => ({ "server-only": {}, "@aws-sdk/client-dynamodb": { ...dynamodb, DynamoDBClient: Client }, "./aws-config": { getAwsConfig: () => ({}) }, "./file-key": keys })[name]);
  const result = await db.listUserUploads("user-one");
  assert.equal(result.length, 1);
  assert.equal(result[0].userId, "user-one");
  assert.equal(calls, 2);
});

test("public share page does not require authentication", async () => {
  const page = load("../src/app/d/[fileId]/page.tsx", name => {
    const dependencies = { "react/jsx-runtime": jsx, "next/link": { default: "a" }, "next/navigation": { redirect: () => {} },
      "@/components/cloud-icon": { CloudIcon: () => null },
      "@/lib/dynamodb": { getFileMetadata: async () => ({ originalFileName: "public.txt", fileSize: 5, expiresAt: 1900000000 }), isFileExpired: () => false },
      "@/lib/s3": { createDownloadLink: async () => ({ url: "https://storage.invalid" }) },
    };
    assert.ok(name in dependencies, `Unexpected dependency on public page: ${name}`);
    return dependencies[name];
  });
  const html = renderToStaticMarkup(await page.default({ params: Promise.resolve({ fileId: "test" }), searchParams: Promise.resolve({}) }));
  assert.match(html, /public.txt/);
  assert.match(html, /Download file/);
});

test("callback diagnostics allowlist errors and never log sensitive response data", async () => {
  const { auth, jar, cookieAccess } = authSetup();
  const logs = [];
  const sensitive = "SECRET_CODE_TOKEN_COOKIE";
  jar.set(auth.authCookieName("flow"), JSON.stringify({ state: "test-state", nonce: sensitive, verifier: sensitive, expiresAt: Date.now() + 60_000 }));
  let body = { error: "invalid_client", error_description: sensitive, access_token: sensitive };
  const callback = load("../src/app/auth/callback/route.ts", name => ({ "node:crypto": crypto, "next/headers": { cookies: cookieAccess }, "next/server": { NextResponse }, "@/lib/auth": auth })[name], {
    console: { error: (...args) => logs.push(args) },
    fetch: async () => Response.json(body, { status: 400 }),
  });
  for (const expected of ["invalid_client", "unknown_oauth_error"]) {
    const response = await callback.GET(new Request(`${env.APP_URL}/auth/callback?code=${sensitive}&state=test-state`));
    assert.equal(new URL(response.headers.get("location")).pathname, "/auth/error");
    assert.equal(response.cookies.get(auth.authCookieName("session")), undefined);
    assert.equal(logs.at(-1)[1].stage, "token_exchange");
    assert.equal(logs.at(-1)[1].status, 400);
    assert.equal(logs.at(-1)[1].oauthError, expected);
    body = { error: sensitive, error_description: sensitive };
  }
  assert.ok(!JSON.stringify(logs).includes(sensitive));
  assert.ok(!JSON.stringify(logs).includes(env.COGNITO_CLIENT_SECRET));
});

test("configuration rejects the documented client secret placeholder", () => {
  const previous = env.COGNITO_CLIENT_SECRET;
  try {
    env.COGNITO_CLIENT_SECRET = "your_actual_app_client_secret";
    const { auth } = authSetup();
    assert.throws(() => auth.getAuthConfig(), { name: "CognitoClientSecretPlaceholderError" });
  } finally {
    env.COGNITO_CLIENT_SECRET = previous;
  }
});

test("sign-out accepts privacy-restricted same-origin forms but rejects cross-site requests", async () => {
  const { auth } = authSetup();
  const logout = load("../src/app/auth/logout/route.ts", name => ({ "next/server": { NextResponse }, "@/lib/auth": auth })[name], { console: { error() {} } });
  for (const origin of [undefined, "null"]) {
    const headers = { "Sec-Fetch-Site": "same-origin", ...(origin ? { Origin: origin } : {}) };
    const response = await logout.POST(new Request(`${env.APP_URL}/auth/logout`, { method: "POST", headers }));
    assert.equal(response.status, 303);
    assert.equal(response.cookies.get(auth.authCookieName("session")).maxAge, 0);
    assert.equal(response.cookies.get(auth.authCookieName("flow")).maxAge, 0);
    assert.equal(new URL(response.headers.get("location")).searchParams.get("logout_uri"), `${env.APP_URL}/`);
  }
  for (const headers of [
    { Origin: "null" },
    { Origin: "null", "Sec-Fetch-Site": "cross-site" },
    { Origin: "null", "Sec-Fetch-Site": "same-site" },
    { Origin: "https://other.invalid", "Sec-Fetch-Site": "same-origin" },
  ]) {
    const response = await logout.POST(new Request(`${env.APP_URL}/auth/logout`, { method: "POST", headers }));
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("set-cookie"), null);
  }
  const wrongHost = await logout.POST(new Request("https://other.invalid/auth/logout", { method: "POST", headers: { Origin: "null", "Sec-Fetch-Site": "same-origin" } }));
  assert.equal(wrongHost.status, 403);
});
