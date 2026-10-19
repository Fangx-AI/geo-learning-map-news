import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanupTestDatabases, exitAfterCleanup, redactTestOutput, testArguments, testEnvironment, type TestCleanupClient } from "../scripts/test-local.ts";

test("local test environment keeps only the .env database and system paths, with test-only valves", () => {
  const inherited = { PATH: "tools", SystemRoot: "system", MODEL_CALLS_ENABLED: "false", COLLECT_ENABLED: "false", PUBLIC_FEED_COLLECT_ENABLED: "true", LLM_API_KEY: "real-key", DEEPSEEK_API_KEY: "real-key", EGRESS_PROXY_URL: "private-proxy", HTTPS_PROXY: "private-proxy", NODE_OPTIONS: "--env-file=.env", DATABASE_URL: "postgres://wrong@remote/prod", SESSION_SECRET: "real-secret", FEISHU_APP_SECRET: "real-secret" };
  const dotenv = "DATABASE_URL=postgres://local:only-db-password@127.0.0.1:55432/geo_dev\nMODEL_CALLS_ENABLED=false\nLLM_API_KEY=real-key\n";
  const env = testEnvironment(dotenv, inherited);
  const url = new URL(env.DATABASE_URL!);
  assert.match(url.pathname, /^\/geo_[a-z0-9]+_[a-f0-9]{12}_test$/);
  assert.equal(url.password, "only-db-password"); assert.equal(url.port, "55432");
  assert.equal(env.PATH, "tools"); assert.equal(env.SystemRoot, "system");
  for (const key of ["LLM_API_KEY", "DEEPSEEK_API_KEY", "EGRESS_PROXY_URL", "HTTPS_PROXY", "NODE_OPTIONS", "FEISHU_APP_SECRET"]) assert.equal(env[key], undefined, key);
  assert.equal(env.MODEL_CALLS_ENABLED, "true"); assert.equal(env.COLLECT_ENABLED, "true");
  for (const key of ["PUBLIC_FEED_COLLECT_ENABLED", "FEISHU_CONTENT_PUSH_ENABLED", "FEISHU_INTERNAL_ENABLED", "INDEXNOW_SUBMIT_ENABLED"]) assert.equal(env[key], "false", key);
  assert.equal(env.AIHOT_CREDENTIALS_DIR, "/nonexistent-test-credentials");
  assert.equal(inherited.MODEL_CALLS_ENABLED, "false"); assert.equal(inherited.SESSION_SECRET, "real-secret");
  assert.notEqual(env.DATABASE_URL, testEnvironment(dotenv, inherited).DATABASE_URL, "same-process runs cannot reuse a template");
  assert.throws(() => testEnvironment("DATABASE_URL=postgres://remote/prod", {}), /本机/);
  assert.throws(() => testEnvironment("LLM_API_KEY=secret", {}), /DATABASE_URL/);
});

test("local test arguments allow bounded test selection without injecting Node options", () => {
  assert.ok(testArguments([]).nodeArgs.includes("tests/*.test.ts"));
  const selected = testArguments(["--concurrency=1", "tests/analyze-shutdown.test.ts"]);
  assert.ok(selected.nodeArgs.includes("--test-concurrency=1")); assert.equal(selected.nodeArgs.at(-1), "tests/analyze-shutdown.test.ts");
  assert.equal(testArguments(["--standalone"]).standalone, true);
  assert.throws(() => testArguments(["--env-file=.env"]));
  assert.throws(() => testArguments(["--concurrency=0"]));
  assert.throws(() => testArguments(["../other.test.ts"]));
  assert.throws(() => testArguments(["--standalone", "tests/analyze.test.ts"]));
  const standalone = testEnvironment("", { DATABASE_URL: "postgres://secret@remote/prod" }, true);
  assert.equal(standalone.DATABASE_URL, "postgres://unreachable@127.0.0.1:1/standalone_test");
});

test("test diagnostics redact the database URL and both encoded and decoded passwords", () => {
  const url = "postgres://user:db%23password@127.0.0.1/geo_test";
  assert.equal(redactTestOutput(`command ${url} db%23password db#password`, url), "command [redacted] [redacted] [redacted]");
});

const template = "geo_m1234567_0123456789ab_test";
const testUrl = `postgres://local:fake-password@127.0.0.1:55432/${template}`;
const copy = (pid: number) => `${template}_f${pid}_a1b2c3d4_test`;

test("local cleanup only drops exact current-run names, with the template last", async () => {
  const calls: string[] = [];
  const client: TestCleanupClient = {
    listDatabases: async (name, pattern) => {
      assert.equal(name, template);
      assert.ok(new RegExp(pattern).test(copy(12)));
      return [template, copy(12), copy(11), copy(12), "geo_learning_map", "other_test", `${template}_backup_test`, `${copy(12)}_restore_test`, `${template}_f12_test`, `${copy(12)}_extra`, `old_${copy(12)}`];
    },
    hasConnections: async name => { calls.push(`check:${name}`); return false; },
    dropDatabase: async name => { calls.push(`drop:${name}`); },
    close: async () => { calls.push("close"); },
  };
  const result = await cleanupTestDatabases(testUrl, template, () => client);
  assert.deepEqual(result, { dropped: [copy(11), copy(12), template], retained: [] });
  assert.deepEqual(calls, [`check:${copy(11)}`, `drop:${copy(11)}`, `check:${copy(12)}`, `drop:${copy(12)}`, `check:${template}`, `drop:${template}`, "close"]);
});

test("cleanup refuses other hosts, arbitrary names and connection override parameters before connecting", async () => {
  let connections = 0;
  const connect = (): TestCleanupClient => { connections++; throw new Error("must not connect"); };
  for (const [url, expected] of [
    [testUrl.replace("127.0.0.1", "example.org"), template],
    [testUrl.replace(template, "geo_learning_map"), "geo_learning_map"],
    [testUrl.replace(template, "arbitrary_test"), "arbitrary_test"],
    [testUrl, "geo_m1234567_aaaaaaaaaaaa_test"],
    [testUrl + "?host=example.org", template],
    [testUrl + "#other", template],
    [testUrl.replace("postgres:", "https:"), template],
    [testUrl.replace(template, `%67${template.slice(1)}`), template],
  ]) await assert.rejects(cleanupTestDatabases(url!, expected!, connect), /拒绝清理/);
  assert.equal(connections, 0);
});

test("active or newly connected databases are retained while other owned copies still clean up", async () => {
  const drops: string[] = [];
  let closed = false;
  const result = await cleanupTestDatabases(testUrl, template, () => ({
    listDatabases: async () => [template, copy(1), copy(2), copy(3)],
    hasConnections: async name => name === copy(1),
    dropDatabase: async name => {
      drops.push(name);
      if (name === copy(2)) throw Object.assign(new Error("sensitive database details"), { code: "55006" });
    },
    close: async () => { closed = true; },
  }));
  assert.deepEqual(drops, [copy(2), copy(3)]);
  assert.deepEqual(result.dropped, [copy(3)]);
  assert.deepEqual(result.retained.map(item => item.name), [copy(1), copy(2), template]);
  assert.match(result.retained[0]!.reason, /仍有数据库连接/);
  assert.match(result.retained[1]!.reason, /55006/);
  assert.doesNotMatch(JSON.stringify(result), /sensitive/);
  assert.equal(closed, true);
});

test("listing failures close the cleanup client and cannot erase the original test result", async () => {
  let closed = false;
  const result = await cleanupTestDatabases(testUrl, template, () => ({
    listDatabases: async () => { throw Object.assign(new Error("fake-password and a raw URL"), { code: "ECONNREFUSED" }); },
    hasConnections: async () => { assert.fail("no database was listed"); },
    dropDatabase: async () => { assert.fail("must not drop anything"); },
    close: async () => { closed = true; },
  }));
  assert.equal(closed, true);
  assert.deepEqual(result.dropped, []);
  assert.deepEqual(result.retained, []);
  assert.match(result.error!, /ECONNREFUSED/);
  assert.doesNotMatch(JSON.stringify(result), /fake-password|raw URL/);
  assert.equal(exitAfterCleanup(2, result), 2);
  assert.equal(exitAfterCleanup(0, result), 1);
  assert.equal(exitAfterCleanup(0, { dropped: [template], retained: [] }), 0);
  assert.equal(exitAfterCleanup(0, { dropped: [], retained: [{ name: template, reason: "active" }] }), 1);
});
