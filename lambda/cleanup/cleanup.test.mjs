import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as dynamodb from "@aws-sdk/client-dynamodb";
import * as s3 from "@aws-sdk/client-s3";

const fileId = "12345678-1234-4234-8234-123456789abc";
const key = `uploads/${fileId}.txt`;
const record = { fileId: { S: fileId }, s3Key: { S: key }, expiresAt: { N: "1" } };

function load(relativePath, require, extra = {}) {
  const exports = {};
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { exports, require, ...extra });
  return exports;
}

function setup(options = {}) {
  const calls = [];
  const logs = [];
  let scanIndex = 0;
  let versionIndex = 0;
  class DynamoClient {
    async send(command) {
      calls.push(command);
      if (command instanceof dynamodb.ScanCommand) {
        if (options.scanFailure) throw new Error("scan detail");
        return (options.pages ?? [{ Items: [record] }])[scanIndex++];
      }
      if (command instanceof dynamodb.GetItemCommand) return { Item: options.record ?? record };
      if (options.dbFailure) throw new Error("write detail");
      return {};
    }
  }
  class S3Client {
    async send(command) {
      calls.push(command);
      if (command instanceof s3.GetBucketVersioningCommand) return { Status: options.versioned ? "Enabled" : undefined };
      if (command instanceof s3.ListObjectVersionsCommand) return options.versions[versionIndex++];
      if (options.s3Failure) throw new Error("private detail");
      return {};
    }
  }
  const validation = load("../../src/lib/file-validation.ts", () => {});
  const keys = load("../../src/lib/file-key.ts", () => validation);
  const { handler } = load(process.env.CLEANUP_TEST_ENTRY ?? "./index.mjs", name => name === "@aws-sdk/client-dynamodb"
    ? { ...dynamodb, DynamoDBClient: DynamoClient }
    : name === "@aws-sdk/client-s3" ? { ...s3, S3Client } : keys, {
    process: { env: { AWS_S3_BUCKET_NAME: "test", AWS_DYNAMODB_TABLE_NAME: "test" } },
    console: { error: (...args) => logs.push(args), info: (...args) => logs.push(args) },
  });
  return { handler, calls, logs };
}

test("follows empty scan pages and deletes S3 before metadata", async () => {
  const marker = { fileId: { S: "marker" } };
  const { handler, calls } = setup({ pages: [{ Items: [], LastEvaluatedKey: marker }, { Items: [record] }] });
  assert.equal((await handler()).deleted, 1);
  const scans = calls.filter(command => command instanceof dynamodb.ScanCommand);
  assert.equal(scans[1].input.ExclusiveStartKey, marker);
  assert.ok(calls.findIndex(command => command instanceof s3.DeleteObjectCommand) < calls.findIndex(command => command instanceof dynamodb.DeleteItemCommand));
  const deletion = calls.find(command => command instanceof dynamodb.DeleteItemCommand);
  assert.equal(deletion.input.ConditionExpression, "s3Key = :key AND expiresAt = :expiry");
});

test("S3 failure retains metadata and logs only basic error details", async () => {
  const { handler, calls, logs } = setup({ s3Failure: true });
  assert.equal((await handler()).failed, 1);
  assert.ok(!calls.some(command => command instanceof dynamodb.DeleteItemCommand));
  assert.ok(!JSON.stringify(logs).includes("private detail"));
});

test("DynamoDB failure retains a retryable record; missing S3 deletion succeeds", async () => {
  assert.equal((await setup({ dbFailure: true }).handler()).failed, 1);
  assert.equal((await setup().handler()).deleted, 1);
});

test("rechecks expiry and rejects unrelated object keys", async () => {
  for (const changed of [
    { ...record, expiresAt: { N: String(Math.floor(Date.now() / 1000) + 3600) } },
    { ...record, s3Key: { S: "private/other.txt" } },
  ]) {
    const { handler, calls } = setup({ record: changed });
    await handler();
    assert.ok(!calls.some(command => command instanceof s3.DeleteObjectCommand));
  }
});

test("version pagination deletes only exact-key versions and markers", async () => {
  const { handler, calls } = setup({ versioned: true, versions: [
    { Versions: [{ Key: key, VersionId: "v1" }, { Key: key + ".other", VersionId: "ignore" }], IsTruncated: true, NextKeyMarker: key, NextVersionIdMarker: "v1" },
    { DeleteMarkers: [{ Key: key, VersionId: "marker" }] },
  ] });
  assert.equal((await handler()).deleted, 1);
  assert.deepEqual(calls.filter(command => command instanceof s3.DeleteObjectCommand).map(command => command.input.VersionId), ["v1", "marker"]);
});

test("scan errors fail the invocation", async () => {
  await assert.rejects(setup({ scanFailure: true }).handler(), /could not finish/);
});
