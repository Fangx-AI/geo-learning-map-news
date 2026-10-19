import { readFile } from "node:fs/promises";
import { closeDb, sql } from "@aihot/backend/db";
import { editionsFromThread, parseEdition, saveEdition } from "../modules/geo-directory/backend/editions.ts";

// Input is a private export of complete assistant messages, never a truncated thread preview.
const [file, sourceUrl] = process.argv.slice(2);
if (!file || !sourceUrl) throw new Error("Usage: node --env-file=.env scripts/import-geo-editions.ts messages.json source-url");
try {
  const messages: unknown = JSON.parse(await readFile(file, "utf8"));
  if (Array.isArray(messages) && messages.length > 366) throw new Error("Too many reports");
  const result = Array.isArray(messages) ? { editions: messages.map(m => parseEdition(m, sourceUrl)), pending: [], unframed: [] } : editionsFromThread(messages, sourceUrl);
  const { editions } = result;
  for (const edition of editions) console.log(JSON.stringify({ id: edition.id, chars: edition.markdown.length, links: edition.links.length, status: await saveEdition(edition) }));
  const known = result.unframed.length ? await sql`SELECT source_message_id FROM geo_daily_editions WHERE source_message_id IN ${sql(result.unframed)}` : [];
  const unframed = result.unframed.filter(id => !known.some(r => r.source_message_id === id));
  console.log(JSON.stringify({ complete: editions.length, pending: result.pending, unframed }));
} finally { await closeDb(); }
