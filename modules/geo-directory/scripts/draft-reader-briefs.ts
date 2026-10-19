import { closeDb } from "@aihot/backend/db";
import { draftPublicReaderBriefs } from "../backend/reader-brief-worker.ts";

export async function main(args = process.argv.slice(2)): Promise<void> {
  let limit = 1, itemId: string | undefined;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--help") { console.log("PUBLIC_READER_BRIEFS_ENABLED=true node --env-file=.env modules/geo-directory/scripts/draft-reader-briefs.ts --once [--limit 1..20] [--item 64位ID]\n默认只生成私有草稿。PUBLIC_READER_BRIEF_PUBLISH_ENABLED=true 时，逐项自动复核通过后发布短概要；失败保留私有草稿。逐条处理，间隔 5 秒。"); return; }
    if (args[index] === "--once") continue;
    if (args[index] === "--limit") { limit = Number(args[++index]); if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new Error("--limit 须为 1–20 的整数"); }
    else if (args[index] === "--item") { itemId = args[++index]; if (!itemId || !/^[a-f0-9]{64}$/.test(itemId)) throw new Error("--item 须为有效条目 ID"); }
    else throw new Error("未知参数；使用 --help 查看用法");
  }
  if (process.env.PUBLIC_READER_BRIEFS_ENABLED !== "true") { console.log("站内概要草稿任务已关闭。设 PUBLIC_READER_BRIEFS_ENABLED=true 后可运行。"); return; }
  const stop = new AbortController();
  const onStop = () => stop.abort();
  process.once("SIGINT", onStop); process.once("SIGTERM", onStop);
  try { console.log(JSON.stringify(await draftPublicReaderBriefs({ limit, itemId, signal: stop.signal, onItem: (id, outcome) => console.log(`${id}: ${outcome}`) }))); }
  finally { stop.abort(); process.removeListener("SIGINT", onStop); process.removeListener("SIGTERM", onStop); }
}
if (import.meta.main) {
  try { await main(); } catch (error) { console.error(error instanceof Error ? error.message : "站内概要草稿生成失败"); process.exitCode = 1; }
  finally { await closeDb(); }
}
