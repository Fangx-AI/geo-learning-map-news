// Source-health evidence for the daily follow-ups and weekly report. A successful HTTP request is
// not proof of output; discovery channels and editorial publishers are counted separately.
import { sql } from "../db.ts";
import { budgetMessage } from "../providers/receipts.ts";

/** How far back a source's own output is read to learn how often it produces something. */
export const RHYTHM_WINDOW_DAYS = 90;
/** Dated days a source needs before its median gap means anything (three gaps). */
export const RHYTHM_MIN_DAYS = 4;
/** How many times its own median gap a source may stay quiet before it looks broken rather than slow. */
export const RHYTHM_MULTIPLE = 4;

export interface SourceHealthRow {
  id: string;
  name: string;
  participation_mode: string;
  created_at: Date;
  health: string;
  fail_count: number;
  last_ok_at: Date | null;
  last_error: string | null;
  runs: number;
  failed: number;
  discoveries: number;
  items: number;
  undated: number;
  repeated: number;
  detail_failures: number;
  /** Days inside the rhythm window this source's own output is dated to; 0 when nothing comparable is in it. */
  evidence_days: number;
  /** Median days between those days; null while there is no rhythm to measure. */
  median_gap_days: number | null;
  /** Whole days since the newest of them; null when nothing comparable is in the window. */
  quiet_days: number | null;
  /** Whether this source ever produced an article at all, in or out of the window. */
  ever_output: boolean;
}

export const SOURCE_USE_NAMES: Record<string, string> = { editorial: "编辑内容", hot_signal: "热度信号" };

/** Matches a saved error that is a spent provider budget. */
const spentBudget = sql`LIKE ${budgetMessage("%", "%")}`;

/**
 * How many times its own median gap a source has been quiet, or null while its own history is too thin
 * to say: a source with three discoveries in one afternoon has no rhythm, and a daily one has one after
 * a week. A source that never produced anything is null too, and is reported rather than called healthy.
 */
export function rhythmMultiple(s: SourceHealthRow): number | null {
  if (s.evidence_days < RHYTHM_MIN_DAYS || !s.median_gap_days || s.quiet_days === null) return null;
  return s.quiet_days / s.median_gap_days;
}

/** Quiet longer than its own rhythm allows: what the follow-ups mean by a source that may be broken. */
export const isBeyondRhythm = (s: SourceHealthRow) => {
  const times = rhythmMultiple(s);
  return times !== null && times > RHYTHM_MULTIPLE;
};

/** One quiet source in the follow-ups: its own numbers, so a reader can see why it is listed. Three
 * cases read differently: output that is only outside the window, output too thin to time, and a source
 * that never gave us anything — the last one is a collection problem, not a slow publisher. */
export function rhythmText(s: SourceHealthRow): string {
  const times = rhythmMultiple(s);
  if (times === null) {
    const run = `近 7 天 ${s.runs} 次抓取、0 条新内容`;
    if (!s.ever_output) return `${run}；从未收到过内容`;
    return s.evidence_days > 0
      ? `${run}；窗口内可比较的历史只有 ${s.evidence_days} 天`
      : `${run}；近 ${RHYTHM_WINDOW_DAYS} 天窗口内没有可比较的产出`;
  }
  return `近 ${s.quiet_days} 天没有新内容，平时约 ${s.median_gap_days} 天一条（${Number(times.toFixed(1))} 倍）`;
}

/** Seven days of outcomes, including intermittent failures that a later success clears on sources.
 * Provider budget waits and process shutdowns are excluded even when a saved detail run counted
 * them as failures. A request timeout remains a failure. */
export async function sourceHealth(now = Date.now()) {
  const since = new Date(now - 7 * 86400_000);
  const rhythmSince = new Date(now - RHYTHM_WINDOW_DAYS * 86400_000);
  const rows = await sql<SourceHealthRow[]>`
    WITH runs AS (
      SELECT source_id, count(*) FILTER (WHERE status IN ('ok','failed') AND coalesce(error, '') NOT ${spentBudget})::int AS runs,
        count(*) FILTER (WHERE status = 'failed' AND coalesce(error, '') NOT ${spentBudget})::int AS failed,
        coalesce(sum((detail->>'detailFailures')::int - (
          SELECT count(*) FROM jsonb_array_elements(detail->'detailErrors') e
          WHERE e->>'error' ${spentBudget}
            OR e->>'error' = 'This operation was aborted'
        )), 0)::int AS detail_failures
      FROM fetch_runs WHERE started_at >= ${since} GROUP BY source_id
    ), seen AS (
      SELECT article_id, source_id FROM article_discoveries WHERE discovered_at >= ${since}
      UNION SELECT id, source_id FROM articles WHERE discovered_at >= ${since}
    ), discoveries AS (
      SELECT source_id, count(*)::int AS n FROM seen GROUP BY source_id
    ), items AS (
      SELECT source_id, count(*)::int AS n, count(*) FILTER (WHERE published_at IS NULL)::int AS undated
      FROM articles WHERE discovered_at >= ${since} GROUP BY source_id
    ), revisions AS (
      SELECT article_id FROM article_revisions WHERE created_at >= ${since} AND revision > 1
      GROUP BY article_id HAVING count(*) >= 5
    ), repeated AS (
      SELECT a.source_id, count(*)::int AS n FROM revisions r JOIN articles a ON a.id = r.article_id GROUP BY a.source_id
    ), rhythm AS (
      -- The days inside the window this source's own output is dated to: its publication time when the
      -- page carried one, else the day we found it. A first import is one delivery, so it counts as the
      -- day it arrived however far its publication dates reach back — otherwise one import reads as a
      -- burst of output days (a source that never produced anything looks punctual), and a first import
      -- spread over months would widen the median enough to hide a source that has since gone quiet.
      -- Days outside the window are dropped rather than trusted: older history says nothing about how
      -- often the source produces something now, and publication and discovery are not ordered, so a row
      -- is read when either of its timestamps falls in the window and its day is then bound to it.
      SELECT source_id, day FROM (
        SELECT source_id,
          date_trunc('day', CASE WHEN backfill_reason = 'first-import' THEN discovered_at
            ELSE coalesce(published_at, discovered_at) END)::date AS day
        FROM articles WHERE discovered_at >= ${rhythmSince} OR published_at >= ${rhythmSince}
        UNION ALL
        SELECT d.source_id, date_trunc('day', d.discovered_at)::date
        FROM article_discoveries d JOIN articles a ON a.id = d.article_id
        WHERE d.discovered_at >= ${rhythmSince} AND a.source_id <> d.source_id
      ) dated
      WHERE day BETWEEN ${rhythmSince}::date AND ${new Date(now)}::date
    ), rhythm_days AS (
      SELECT DISTINCT source_id, day FROM rhythm
    ), rhythm_gaps AS (
      SELECT source_id, day, day - lag(day) OVER (PARTITION BY source_id ORDER BY day) AS gap FROM rhythm_days
    ), rhythm_stats AS (
      SELECT source_id, count(*)::int AS evidence_days,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY gap) FILTER (WHERE gap IS NOT NULL) AS median_gap_days,
        max(day) AS last_day
      FROM rhythm_gaps GROUP BY source_id
    )
    SELECT s.id,s.name,s.participation_mode,s.created_at,s.health,s.fail_count,s.last_ok_at,left(s.last_error,200) AS last_error,
      coalesce(r.runs,0) AS runs, coalesce(r.failed,0) AS failed, coalesce(r.detail_failures,0) AS detail_failures,
      coalesce(d.n,0) AS discoveries, coalesce(a.n,0) AS items, coalesce(a.undated,0) AS undated, coalesce(e.n,0) AS repeated,
      coalesce(g.evidence_days,0) AS evidence_days, g.median_gap_days,
      (${new Date(now)}::date - g.last_day)::int AS quiet_days, (EXISTS (SELECT 1 FROM articles history WHERE history.source_id = s.id)
        OR EXISTS (SELECT 1 FROM article_discoveries history WHERE history.source_id = s.id)) AS ever_output
    FROM sources s LEFT JOIN runs r ON r.source_id = s.id LEFT JOIN discoveries d ON d.source_id = s.id
      LEFT JOIN items a ON a.source_id = s.id LEFT JOIN repeated e ON e.source_id = s.id
      LEFT JOIN rhythm_stats g ON g.source_id = s.id
    WHERE s.enabled AND s.kind NOT IN ('external','mp_account') AND s.participation_mode IN ('editorial','hot_signal')
    ORDER BY s.name,s.id`;
  return Object.entries(SOURCE_USE_NAMES).map(([mode, name]) => {
    const sources = rows.filter(s => s.participation_mode === mode);
    // Quiet is the old seven-day signal, kept as the trigger. Whether it is late is now read from the
    // source itself: a monthly blog is quiet for a month between posts without being broken, and a
    // source whose history is too thin to judge stays visible instead of being called fine.
    const quiet = sources.filter(s => s.created_at < since && s.discoveries === 0);
    const overdue = quiet.flatMap(s => { const times = rhythmMultiple(s); return times !== null && times > RHYTHM_MULTIPLE ? [{ s, times }] : []; })
      .sort((a, b) => b.times - a.times).map(x => x.s);
    const unknown = quiet.filter(s => rhythmMultiple(s) === null);
    return {
      mode, name, sources,
      failing: sources.filter(s => s.health === "failing"),
      unstable: sources.filter(s => s.failed >= 5 && s.failed / s.runs >= 0.1),
      /** Every quiet source still worth a look, in list order: beyond its rhythm, or not judgeable. */
      silent: quiet.filter(s => isBeyondRhythm(s) || rhythmMultiple(s) === null),
      /** The quiet ones past their own rhythm, most overdue first. */
      overdue,
      /** The quiet ones without enough history to judge, including sources that never produced anything. */
      unknown,
      quality: mode === "editorial" ? sources.filter(s => s.undated > 0 || s.repeated > 0) : [],
      detailFailures: sources.filter(s => s.detail_failures > 0),
    };
  });
}

/** Bounded display, with the full count explicit; the underlying assessment never drops the tail. */
export function sourceHealthList(rows: SourceHealthRow[], describe: (row: SourceHealthRow) => string, limit = 10): string {
  const list = rows.slice(0, limit).map(s => `${s.name}（${s.id}）：${describe(s)}`).join("；");
  return list + (rows.length > limit ? `；另有 ${rows.length - limit} 个，见后台信源列表` : "");
}
