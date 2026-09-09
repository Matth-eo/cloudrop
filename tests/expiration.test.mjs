import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as aws from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";

function load(path, resolve) {
  const exports = {};
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { exports, require: resolve, Buffer, Date, Response, URL, Set,
    process: { env: { AWS_REGION: "us-east-1", AWS_S3_BUCKET_NAME: "test-bucket" } } });
  return exports;
}

const expiration = load("../src/lib/expiration.ts");
const validation = load("../src/lib/file-validation.ts");
const keys = load("../src/lib/file-key.ts", () => validation);

function setup(user = { id: "test-user" }) {
  let objectMetadata;
  let saved;
  const uploadedAt = new Date("2026-09-09T12:00:00.500Z");
  class Client extends aws.S3Client {
    constructor(config) { super({ ...config, credentials: { accessKeyId: "TEST_ONLY", secretAccessKey: "test-only-placeholder" } }); }
    async send() { return { Metadata: objectMetadata, LastModified: uploadedAt, ContentLength: 5 }; }
  }
  const storage = load("../src/lib/s3.ts", name => ({
    "server-only": {},
    "@aws-sdk/client-s3": { ...aws, S3Client: Client },
    "@aws-sdk/s3-request-presigner": { getSignedUrl },
    "./aws-config": { getAwsConfig: () => ({ region: "us-east-1" }) },
    "./expiration": expiration,
  })[name]);
  const presign = load("../src/app/api/uploads/presign/route.ts", name => ({
    "node:crypto": { randomUUID }, "@aws-sdk/client-s3": aws,
    "@aws-sdk/s3-request-presigner": { getSignedUrl },
    "@/lib/file-validation": validation, "@/lib/s3": storage, "@/lib/expiration": expiration,
    "@/lib/auth": { getCurrentUser: async () => user, isSameOrigin: request => request.headers.get("origin") === "http://localhost" },
  })[name]);
  const complete = load("../src/app/api/uploads/complete/route.ts", name => ({
    "@/lib/dynamodb": { saveFileMetadata: async value => { saved = value; } },
    "@/lib/file-key": keys, "@/lib/file-validation": validation, "@/lib/s3": storage,
    "@/lib/auth": { getCurrentUser: async () => user, isSameOrigin: request => request.headers.get("origin") === "http://localhost" },
  })[name]);
  return { presign, complete, uploadedAt, setMetadata: value => { objectMetadata = value; }, saved: () => saved };
}

const request = body => new Request("http://localhost/api/uploads", { method: "POST", headers: { Origin: "http://localhost" }, body: JSON.stringify(body) });

for (const seconds of [3600, 86400, 604800]) {
  test(`${seconds} seconds survives signed S3 metadata and is saved as expiresAt`, async () => {
    const app = setup();
    const response = await app.presign.POST(request({ name: "notes.txt", size: 5, contentType: "text/plain", expirationSeconds: seconds }));
    assert.equal(response.status, 200);
    const signed = await response.json();
    const url = new URL(signed.url);
    assert.equal(url.searchParams.get("x-amz-meta-expiration-seconds"), String(seconds));
    assert.equal(url.searchParams.get("X-Amz-Expires"), "60");
    assert.equal(url.searchParams.get("x-amz-meta-owner-id"), "test-user");
    app.setMetadata({ "original-name": url.searchParams.get("x-amz-meta-original-name"), "expiration-seconds": url.searchParams.get("x-amz-meta-expiration-seconds"), "owner-id": url.searchParams.get("x-amz-meta-owner-id") });
    // Extra client fields must not override the signed S3 metadata at completion.
    assert.equal((await app.complete.POST(request({ key: signed.key, expirationSeconds: 1 }))).status, 200);
    assert.equal(app.saved().expiresAt, Math.floor(app.uploadedAt.getTime() / 1000) + seconds);
    assert.equal(app.saved().downloadCount, 0);
    assert.equal(app.saved().originalFileName, "notes.txt");
    assert.equal(app.saved().userId, "test-user");
  });
}

test("missing selection and legacy S3 metadata retain the 24-hour default", async () => {
  const app = setup();
  const result = await (await app.presign.POST(request({ name: "notes.txt", size: 5, contentType: "text/plain" }))).json();
  assert.equal(new URL(result.url).searchParams.get("x-amz-meta-expiration-seconds"), "86400");
  app.setMetadata({ "original-name": Buffer.from("notes.txt").toString("base64url"), "owner-id": "test-user" });
  assert.equal((await app.complete.POST(request({ key: result.key }))).status, 200);
  assert.equal(app.saved().expiresAt, Math.floor(app.uploadedAt.getTime() / 1000) + 86400);
});

test("unsupported choices are rejected before signing", async () => {
  const app = setup();
  for (const value of [0, -1, 3601, 604801, "3600", null]) {
    assert.equal((await app.presign.POST(request({ name: "notes.txt", size: 5, contentType: "text/plain", expirationSeconds: value }))).status, 400);
  }
});

test("invalid stored duration never reaches DynamoDB", async () => {
  const app = setup();
  app.setMetadata({ "original-name": Buffer.from("notes.txt").toString("base64url"), "expiration-seconds": "invalid" });
  assert.equal((await app.complete.POST(request({ key: `uploads/${randomUUID()}.txt` }))).status, 503);
  assert.equal(app.saved(), undefined);
});

test("anonymous users cannot sign or complete uploads", async () => {
  const app = setup(null);
  assert.equal((await app.presign.POST(request({ name: "notes.txt", size: 5, contentType: "text/plain" }))).status, 401);
  assert.equal((await app.complete.POST(request({ key: `uploads/${randomUUID()}.txt` }))).status, 401);
  assert.equal(app.saved(), undefined);
});

test("foreign-origin upload requests are rejected", async () => {
  const app = setup();
  const foreign = () => new Request("http://localhost/api/uploads", { method: "POST", headers: { Origin: "https://other.invalid" }, body: "{}" });
  assert.equal((await app.presign.POST(foreign())).status, 403);
  assert.equal((await app.complete.POST(foreign())).status, 403);
});

test("completion cannot claim another user's or an ownerless upload", async () => {
  const app = setup();
  for (const owner of ["another-user", ""]) {
    app.setMetadata({ "original-name": Buffer.from("notes.txt").toString("base64url"), "owner-id": owner });
    assert.equal((await app.complete.POST(request({ key: `uploads/${randomUUID()}.txt`, userId: "test-user" }))).status, 403);
    assert.equal(app.saved(), undefined);
  }
});

test("browser-supplied ownership is ignored when signing", async () => {
  const app = setup();
  const result = await (await app.presign.POST(request({ name: "notes.txt", size: 5, contentType: "text/plain", userId: "victim" }))).json();
  assert.equal(new URL(result.url).searchParams.get("x-amz-meta-owner-id"), "test-user");
});
