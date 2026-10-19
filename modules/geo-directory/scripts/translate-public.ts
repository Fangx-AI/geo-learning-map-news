import { closeDb } from "@aihot/backend/db";
import { acquireCollectorLock } from "../backend/collector-runtime.ts";
import { createPublicTranslator, translatePublicBatch } from "../backend/translate-public.ts";

/** One bounded recovery batch. The regular --watch collector drains the queue continuously. */
export async function main(args = process.argv.slice(2)): Promise<void> {
  if (args.includes("--help")) { console.log("node --env-file=.env modules/geo-directory/scripts/translate-public.ts [--limit 1..100]\nRequires PUBLIC_TRANSLATION_ENABLED=true. Uses PUBLIC_TRANSLATION_PROVIDER=local|bing; local needs installed models. The collector's --watch mode translates continuously."); return; }
  if (process.env.PUBLIC_TRANSLATION_ENABLED !== "true") throw new Error("PUBLIC_TRANSLATION_ENABLED must be true");
  const limit = args.length ? Number(args[1]) : 10;
  if (args.length && (args.length !== 2 || args[0] !== "--limit") || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Use --limit 1..100");
  const stop = new AbortController();
  const release = await acquireCollectorLock("translation", () => stop.abort());
  const provider = await createPublicTranslator(stop.signal);
  const onStop = () => stop.abort();
  process.once("SIGINT", onStop); process.once("SIGTERM", onStop);
  try { console.log(JSON.stringify(await translatePublicBatch({ translate: provider.translate, limit, signal: stop.signal }))); }
  finally { provider.dispose(); await release(); process.removeListener("SIGINT", onStop); process.removeListener("SIGTERM", onStop); }
}

if (import.meta.main) {
  try { await main(); } catch (error) { console.error(error instanceof Error ? error.message : "Public translation failed"); process.exitCode = 1; }
  finally { await closeDb(); }
}
