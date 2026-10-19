import { setTimeout as delay } from "node:timers/promises";
import { closeDb } from "@aihot/backend/db";
import { collectPublic } from "../backend/collect-public.ts";
import { acquireCollectorLock, heartbeatCollector, recordCollectorState, loadCollectorResumeDelay } from "../backend/collector-runtime.ts";
import { publicCollectionError } from "../backend/public-source.ts";
import { watchPublicTranslations } from "../backend/translate-public.ts";
import { watchPublicReaderBriefs } from "../backend/reader-brief-worker.ts";

export async function main(args = process.argv.slice(2)): Promise<void> {
  let watch = false, sourceId: string | undefined, concurrency = 4;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--help") {
      console.log("PUBLIC_FEED_COLLECT_ENABLED=true node --env-file=.env modules/geo-directory/scripts/collect-public.ts [--watch] [--source source-id] [--concurrency 1..8]\n默认采集一次；--watch 每轮结束后等待 30 分钟。无付费服务；翻译与本地概要草稿按各自开关在后台运行。须先运行数据库迁移。");
      return;
    }
    if (args[i] === "--watch") watch = true;
    else if (args[i] === "--source") {
      sourceId = args[++i];
      if (!sourceId || !/^[a-z0-9-]{1,120}$/.test(sourceId)) throw new Error("--source 须为已配置的来源 ID");
    } else if (args[i] === "--concurrency") {
      const input = args[++i]; concurrency = Number(input);
      if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) throw new Error("--concurrency 须为 1–8 的整数");
    } else throw new Error("未知参数；使用 --help 查看用法");
  }
  const stop = new AbortController();
  const onLockLost = () => { console.error("采集锁连接中断，停止当前进程；守护入口会重新连接后恢复。"); process.exit(1); };
  const releaseWatch = watch ? await acquireCollectorLock("watch", onLockLost) : null;
  const heartbeat = watch ? setInterval(() => { void heartbeatCollector().catch(() => {}); }, 30_000) : null;
  heartbeat?.unref();
  const onStop = () => stop.abort();
  process.once("SIGINT", onStop); process.once("SIGTERM", onStop);
  const translations = watch ? watchPublicTranslations(stop.signal) : Promise.resolve();
  const briefs = watch ? watchPublicReaderBriefs(stop.signal) : Promise.resolve();
  try {
    const resumeDelay = watch ? await loadCollectorResumeDelay() : 0;
    if (resumeDelay > 0) {
      console.log(`保留已有采集计划，约 ${Math.ceil(resumeDelay/60_000)} 分钟后继续；中文翻译正常运行。`);
      try { await delay(resumeDelay, undefined, { signal: stop.signal }); }
      catch (error) { if (!stop.signal.aborted) throw error; }
      if (stop.signal.aborted) return;
    }
    do {
      let waitMinutes = 30;
      try {
      if (watch) await recordCollectorState("running");
      const result = await collectPublic({ sourceId, concurrency, respectIntervals: watch, onLockLost, onSource: row => console.log(`${row.id}: ${row.status}, 读取 ${row.fetched}, 相关 ${row.matched}${row.error ? `, ${row.error}` : ""}`) });
      console.log(`本轮完成：${result.sources} 个来源，成功 ${result.ok}，部分完成 ${result.partial}，失败 ${result.failed}，跳过 ${result.skipped}，读取 ${result.fetched} 条，相关 ${result.matched} 条。`);
      if (result.summaries?.updated) console.log(`摘要维护：检查并升级 ${result.summaries.updated} 条，文本更新 ${result.summaries.textChanged} 条。`);
      if (result.images) console.log(`封面补查：复用 ${result.images.reused}，检查 ${result.images.attempted}，找到 ${result.images.found}，未提供 ${result.images.noCover}，暂时失败 ${result.images.failed}。`);
      if (watch) await recordCollectorState("waiting", { nextRunAt: new Date(Date.now() + waitMinutes * 60_000) });
      } catch (error) {
        if (!watch) throw error;
        waitMinutes = 5;
        const message = publicCollectionError(error);
        console.error(`${message}；5 分钟后自动重试。`);
        await recordCollectorState("retrying", { nextRunAt: new Date(Date.now() + waitMinutes * 60_000), error: message }).catch(() => {});
      }
      if (!watch || stop.signal.aborted) break;
      console.log(`${waitMinutes} 分钟后继续。按 Ctrl+C 停止。`);
      try { await delay(waitMinutes * 60 * 1000, undefined, { signal: stop.signal }); } catch { if (!stop.signal.aborted) throw new Error("等待下一轮失败"); }
    } while (!stop.signal.aborted);
  } finally {
    stop.abort();
    await translations;
    await briefs;
    if (heartbeat) clearInterval(heartbeat);
    if (watch) await recordCollectorState("stopped").catch(() => {});
    await releaseWatch?.();
    process.removeListener("SIGINT", onStop); process.removeListener("SIGTERM", onStop);
  }
}

if (import.meta.main) {
  try { await main(); }
  catch (error) { console.error(error instanceof Error ? error.message : "公开采集失败"); process.exitCode = 1; }
  finally { await closeDb(); }
}
