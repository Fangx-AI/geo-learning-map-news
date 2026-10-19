import test, { after } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { closeDb, sql } from "@aihot/backend/db";
import { acquireCollectorLock, recordCollectorState, loadCollectorResumeDelay } from "../backend/collector-runtime.ts";
after(closeDb);

test("separate collector sessions cannot overlap and release makes the next cycle possible", async () => {
  const release = await acquireCollectorLock("cycle");
  try { await assert.rejects(acquireCollectorLock("cycle"), /已有公开采集轮次/); }
  finally { await release(); }
  const next = await acquireCollectorLock("cycle");
  await next();
});

test("runtime transitions preserve pending deadlines through graceful stops without extending them", async () => {
  assert.equal(await loadCollectorResumeDelay(), 0, "a fresh runtime starts immediately");
  await recordCollectorState("running");
  await recordCollectorState("waiting", { nextRunAt: new Date(Date.now() + 1800_000) });
  const [before] = await sql`SELECT * FROM geo_public_collector_runtime WHERE id = 'watch'`;
  await recordCollectorState("stopped");
  const [waitingStop] = await sql`SELECT * FROM geo_public_collector_runtime WHERE id = 'watch'`;
  assert.equal(waitingStop.state, "stopped");
  assert.equal(waitingStop.next_run_at.toISOString(), before.next_run_at.toISOString());
  assert.equal(waitingStop.last_completed_at.toISOString(), before.last_completed_at.toISOString());
  assert.ok(await loadCollectorResumeDelay() > 0, "stopped waiting cycle retains its schedule");
  await recordCollectorState("retrying", { error: "请求超时，本轮未完成", nextRunAt: new Date(Date.now() + 300_000) });
  const [retry] = await sql`SELECT * FROM geo_public_collector_runtime WHERE id = 'watch'`;
  assert.equal(retry.last_completed_at.toISOString(), before.last_completed_at.toISOString());
  assert.equal(retry.state, "retrying");
  await recordCollectorState("stopped");
  const [stopped] = await sql`SELECT * FROM geo_public_collector_runtime WHERE id = 'watch'`;
  assert.equal(stopped.next_run_at.toISOString(), retry.next_run_at.toISOString());
  assert.equal(stopped.error, null);
  assert.ok(await loadCollectorResumeDelay() > 0, "stopped retry retains its backoff");
  await recordCollectorState("stopped");
  const [repeatedStop] = await sql`SELECT * FROM geo_public_collector_runtime WHERE id = 'watch'`;
  assert.equal(repeatedStop.next_run_at.toISOString(), retry.next_run_at.toISOString(), "repeated stops must not postpone the deadline");
  await recordCollectorState("running");
  await recordCollectorState("stopped");
  const [noPlan] = await sql`SELECT * FROM geo_public_collector_runtime WHERE id = 'watch'`;
  assert.equal(noPlan.next_run_at, null);
  assert.equal(await loadCollectorResumeDelay(), 0, "stopping a running cycle invents no deadline");
  await recordCollectorState("waiting", { nextRunAt: new Date(Date.now() - 60_000) });
  await recordCollectorState("stopped");
  const [expired] = await sql`SELECT * FROM geo_public_collector_runtime WHERE id = 'watch'`;
  assert.equal(expired.next_run_at, null);
  assert.equal(await loadCollectorResumeDelay(), 0, "expired deadlines are cleared on stop");
});

test("losing the dedicated lock session notifies its owner and permits a replacement without blocking the application pool", async () => {
  // Termination is restricted to this file's isolated test database and the exact advisory key.
  const [{ name }] = await sql<{ name: string }[]>`SELECT current_database() AS name`;
  assert.match(name, /_test$|_ci$/);
  let losses = 0;
  const release = await acquireCollectorLock("watch", () => { losses++; });
  try {
    await sql`SELECT 1`;
    const locks = await sql<{ pid: number }[]>`SELECT l.pid FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid
      WHERE l.locktype = 'advisory' AND l.granted AND a.datname = current_database()
        AND l.classid = hashtext('geo-public-collector')::oid AND l.objid = hashtext('watch')::oid AND l.objsubid = 2`;
    assert.equal(locks.length, 1);
    await sql`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid = ${locks[0].pid} AND datname = current_database()`;
    for (let i = 0; i < 50 && losses === 0; i++) await delay(20);
    assert.equal(losses, 1, "session loss must reach the owner before it can keep collecting without a lease");
    const replacement = await acquireCollectorLock("watch");
    await replacement();
    assert.equal(losses, 1, "an intentional release does not notify lock loss");
  } finally { await release(); }
});
