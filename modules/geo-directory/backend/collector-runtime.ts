import { sql } from "@aihot/backend/db";
import { config } from "@aihot/backend/config";
import postgres from "postgres";

export function collectorWaitMs(state: string, nextRunAt: Date | null, now = Date.now()): number {
  if (!['waiting','retrying','stopped'].includes(state) || !nextRunAt || !Number.isFinite(nextRunAt.getTime())) return 0;
  return Math.max(0, nextRunAt.getTime() - now);
}

/** Restarting a watcher must not turn a scheduled wait into another request burst. */
export async function loadCollectorResumeDelay(): Promise<number> {
  const [row] = await sql<{ state: string; next_run_at: Date | null }[]>`SELECT state,next_run_at FROM geo_public_collector_runtime WHERE id='watch'`;
  return row ? collectorWaitMs(row.state,row.next_run_at) : 0;
}

/** A session lock prevents overlapping cycles and duplicate watch processes across terminals. */
export async function acquireCollectorLock(name: "cycle" | "watch" | "translation" | "reader-brief", onLost?: () => void): Promise<() => Promise<void>> {
  let held = false, releasing = false;
  // Keep leases out of the application pool, including when DATABASE_POOL_MAX=1.
  const connection = postgres(config.databaseUrl, { max: 1, idle_timeout: 0, max_lifetime: 0, connect_timeout: 10,
    onnotice: () => {}, onclose: () => { if (held && !releasing) { held = false; onLost?.(); } },
  });
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  try {
    const [row] = await connection<{ locked: boolean }[]>`SELECT pg_try_advisory_lock(hashtext('geo-public-collector'), hashtext(${name})) AS locked`;
    if (!row.locked) throw new Error(name === "watch" ? "已有公开采集守护进程运行" : "已有公开采集轮次运行，本轮稍后重试");
    held = true;
    // A failed lease connection must never silently reconnect and advertise a healthy watcher.
    heartbeat = setInterval(() => { void connection`SELECT 1`.catch(() => { if (held && !releasing) { held = false; onLost?.(); } }); }, 30_000);
    heartbeat.unref();
    return async () => {
      releasing = true;
      if (heartbeat) clearInterval(heartbeat);
      try { if (held) await connection`SELECT pg_advisory_unlock(hashtext('geo-public-collector'), hashtext(${name}))`; }
      finally { held = false; await connection.end({ timeout: 2 }); }
    };
  } catch (error) { releasing = true; if (heartbeat) clearInterval(heartbeat); await connection.end({ timeout: 2 }); throw error; }
}

export async function recordCollectorState(state: "running" | "waiting" | "retrying" | "stopped", options: { nextRunAt?: Date; error?: string; intervalMinutes?: number } = {}): Promise<void> {
  await sql`INSERT INTO geo_public_collector_runtime (id, state, heartbeat_at, last_started_at, last_completed_at, next_run_at, interval_minutes, error)
    VALUES ('watch', ${state}, now(), CASE WHEN ${state} = 'running' THEN now() END, CASE WHEN ${state} = 'waiting' THEN now() END, ${options.nextRunAt ?? null}, ${options.intervalMinutes ?? 30}, ${options.error ?? null})
    ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state, heartbeat_at = now(),
      last_started_at = CASE WHEN EXCLUDED.state = 'running' THEN now() ELSE geo_public_collector_runtime.last_started_at END,
      last_completed_at = CASE WHEN EXCLUDED.state = 'waiting' THEN now() ELSE geo_public_collector_runtime.last_completed_at END,
      next_run_at = CASE
        WHEN EXCLUDED.state = 'stopped' AND geo_public_collector_runtime.state IN ('waiting','retrying','stopped')
          AND geo_public_collector_runtime.next_run_at > now() THEN geo_public_collector_runtime.next_run_at
        ELSE EXCLUDED.next_run_at END,
      interval_minutes = EXCLUDED.interval_minutes, error = EXCLUDED.error`;
}

export async function heartbeatCollector(): Promise<void> {
  await sql`UPDATE geo_public_collector_runtime SET heartbeat_at = now() WHERE id = 'watch'`;
}
