import { closeDb } from "@aihot/backend/db";
import { collectPublicImages } from "../backend/collect-images.ts";
import { acquireCollectorLock } from "../backend/collector-runtime.ts";

if (import.meta.main) {
  let release: (() => Promise<void>) | undefined;
  try {
    const args = process.argv.slice(2);
    if (args.length !== 2 || args[0] !== "--limit" || !/^\d+$/.test(args[1]) || Number(args[1]) < 1 || Number(args[1]) > 500) throw new Error("用法：node --env-file=.env modules/geo-directory/scripts/collect-images.ts --limit 1..500");
    if (process.env.PUBLIC_FEED_COLLECT_ENABLED !== "true") throw new Error("公开采集未开启");
    release = await acquireCollectorLock("cycle", () => process.exit(1));
    console.log(JSON.stringify(await collectPublicImages({ limit: Number(args[1]) })));
  } catch (error) { console.error(error instanceof Error ? error.message : "封面采集失败"); process.exitCode = 1; }
  finally { await release?.(); await closeDb(); }
}
