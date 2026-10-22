import { createHash } from "node:crypto";
import { z } from "zod";
import { sql } from "@aihot/backend/db";

const reference = z.object({ matched_text: z.string().optional(), alt: z.string().optional(), safe_urls: z.array(z.string()).optional() }).passthrough();
const messageSchema = z.object({
  id: z.string().uuid(), author: z.object({ role: z.literal("assistant") }),
  status: z.literal("finished_successfully"),
  content: z.object({ parts: z.array(z.string()).min(1) }),
  metadata: z.object({ content_references: z.array(reference).optional() }).optional(),
});
export function publicUrl(value: string): string | null {
  try { const u = new URL(value); return /^https?:$/.test(u.protocol) && !u.username && !u.password ? u.href : null; } catch { return null; }
}

/** Only completed assistant reports are publishable; prompts and partial tool responses are not. */
export function parseEdition(input: unknown, sourceUrl: string) {
  const m = messageSchema.parse(input);
  if (!publicUrl(sourceUrl)) throw new Error("Invalid report source URL");
  let markdown = m.content.parts.join("\n").trim();
  if (markdown.length < 800 || markdown.length > 200_000 || /\[truncated\]|内容已截断|output truncated/i.test(markdown)) throw new Error("Incomplete or oversized report");
  if (!/^# (?:🌍 )?全球 GEO (?:全景情报|日报)/u.test(markdown)) throw new Error("Not a GEO daily edition");
  const date = markdown.slice(0, 500).match(/(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/u);
  const issue = markdown.slice(0, 500).match(/第\s*(\d+)\s*期/u);
  if (!date || !issue) throw new Error("Missing edition date or issue");
  const day = `${date[1]}-${date[2]!.padStart(2, "0")}-${date[3]!.padStart(2, "0")}`;
  if (new Date(day + "T00:00:00Z").toISOString().slice(0, 10) !== day) throw new Error("Invalid edition date");
  for (const ref of m.metadata?.content_references ?? []) {
    if (!ref.matched_text || !markdown.includes(ref.matched_text)) continue;
    if (!ref.matched_text.startsWith("\uE200")) continue;
    const urls = [...new Set((ref.safe_urls ?? []).map(publicUrl).filter((u): u is string => !!u))];
    let replacement = urls.map(u => `[${new URL(u).hostname}](${u.replace(/\(/g, "%28").replace(/\)/g, "%29")})`).join("、");
    const direct = ref.matched_text.match(/^\uE200url\uE202([^\uE202]+)\uE202(https?:\/\/[^\uE201]+)\uE201$/u);
    if (direct && publicUrl(direct[2]!)) replacement = `[${direct[1]!.replace(/[\[\]]/g, "")}](${direct[2]!.replace(/\(/g, "%28").replace(/\)/g, "%29")})`;
    if (replacement) markdown = markdown.split(ref.matched_text).join(replacement);
  }
  if (/[\uE200-\uE203]|:chatgpt-content-reference/.test(markdown)) throw new Error("Unresolved source references; do not publish a report without its links");
  const links = [...new Set([...markdown.matchAll(/\]\((https?:\/\/[^\s)]+)\)/g)].map(m => publicUrl(m[1]!)).filter((u): u is string => !!u))];
  if (!links.length) throw new Error("Report has no source links");
  return { id: day, messageId: m.id, day, issue: Number(issue[1]), title: `全球 GEO 全景情报 · 第 ${Number(issue[1])} 期`, markdown, links, sourceUrl, hash: createHash("sha256").update(markdown).digest("hex") };
}

/** Assemble the actual message boundaries returned by read_thread; a missing final part is never published. */
export function mergeEditionThreads(inputs: unknown[], expectedThreadId = process.env.GEO_DAILY_SOURCE_THREAD_ID) {
  const schema = z.object({ thread: z.object({ id: z.string() }), turns: z.array(z.object({ status: z.string(), items: z.array(z.object({ type: z.string(), id: z.string(), text: z.string().optional(), truncated: z.boolean().optional() }).passthrough()) })) });
  const items = new Map<string, z.infer<typeof schema>["turns"][number]["items"][number]>();
  for (const input of inputs) {
    const data = schema.parse(input);
    if (!expectedThreadId || data.thread.id !== expectedThreadId) throw new Error("Unexpected daily report conversation");
    for (const turn of data.turns) {
      if (turn.status !== "completed") continue;
      for (const item of turn.items) {
        if (item.type !== "agentMessage" || !item.text) continue;
        const prior = items.get(item.id);
        if (prior && prior.text !== item.text) {
          if (prior.truncated && !item.truncated && item.text.startsWith(prior.text!)) { items.set(item.id, item); continue; }
          if (item.truncated && prior.text!.startsWith(item.text)) continue;
          throw new Error(`Source message changed: ${item.id}; existing snapshots preserved`);
        }
        if (!prior || prior.truncated && !item.truncated) items.set(item.id, item);
      }
    }
  }
  return { thread: { id: expectedThreadId }, turns: [{ status: "completed", items: [...items.values()] }] };
}

export function editionsFromThread(input: unknown, sourceUrl: string, expectedThreadId = process.env.GEO_DAILY_SOURCE_THREAD_ID) {
  const thread = z.object({ thread: z.object({ id: z.string() }), turns: z.array(z.object({ status: z.string(), items: z.array(z.object({ type: z.string(), id: z.string(), text: z.string().optional() }).passthrough()) })) }).parse(input);
  if (!expectedThreadId || thread.thread.id !== expectedThreadId) throw new Error("Unexpected daily report conversation");
  const groups = new Map<string, { id: string; text: string; part: number; total: number; issue: number }[]>();
  const unframed: string[] = [];
  for (const turn of thread.turns) {
    if (turn.status !== "completed") continue;
    for (const item of turn.items) {
      if (item.type !== "agentMessage" || !item.text) continue;
      const match = item.text.match(/^<!-- GEO-EDITION date=(\d{4}-\d{2}-\d{2}) issue=(\d+) part=(\d+) total=(\d+) -->\s*\n/);
      if (!match) { if (/^# (?:🌍 )?全球 GEO (?:全景情报|日报)/u.test(item.text)) unframed.push(item.id); continue; }
      const group = groups.get(match[1]!) ?? [];
      if (item.truncated === true) continue;
      group.push({ id: item.id, text: item.text, issue: Number(match[2]), part: Number(match[3]), total: Number(match[4]) }); groups.set(match[1]!, group);
    }
  }
  const editions: ReturnType<typeof parseEdition>[] = [];
  const pending: string[] = [];
  const gaps: { day: string; received: number[]; missing: number[]; total: number; reason: string }[] = [];
  for (const [day, group] of groups) {
    // A complete single-message replacement may repair a previously incomplete multipart edition.
    // Multiple different complete replacements remain a conflict, never silently last-write-wins.
    const completeSingles = group.filter(p => p.part === 1 && p.total === 1 && p.text.length <= 15000 && /<!-- GEO-PART-END -->\s*<!-- GEO-EDITION-END -->\s*$/.test(p.text));
    if (new Set(completeSingles.map(p => p.text)).size > 1) throw new Error(`Conflicting complete editions: ${day}`);
    const selected = completeSingles.length ? [completeSingles[0]!] : group;
    const parts = [...new Map(selected.map(p => [p.id, p])).values()].sort((a, b) => a.part - b.part);
    const first = parts[0]!;
    if (first.total < 1 || first.total > 30 || parts.length !== first.total || parts.some((p, i) => p.part !== i + 1 || p.total !== first.total || p.issue !== first.issue || p.text.length > 15000 || !/<!-- GEO-PART-END -->\s*(?:<!-- GEO-EDITION-END -->)?\s*$/.test(p.text)) || !parts.at(-1)!.text.trimEnd().endsWith("<!-- GEO-EDITION-END -->")) {
      pending.push(day);
      gaps.push({ day, received: parts.map(p => p.part), missing: Array.from({ length: Math.min(30, Math.max(0, first.total)) }, (_, i) => i + 1).filter(n => !parts.some(p => p.part === n)), total: first.total, reason: "missing-parts-or-invalid-boundaries" });
      continue;
    }
    const text = parts.map(p => p.text.replace(/^<!-- GEO-EDITION[^\n]+-->\s*\n/, "").replace(/<!-- GEO-(?:PART|EDITION)-END -->/g, "").trim()).join("\n\n");
    const edition = parseEdition({ id: first.id, author: { role: "assistant" }, status: "finished_successfully", content: { parts: [text] } }, sourceUrl);
    if (edition.day !== day || edition.issue !== first.issue) throw new Error("Report header disagrees with message markers");
    editions.push(edition);
  }
  return { editions, pending, unframed, gaps };
}

export async function saveEdition(edition: ReturnType<typeof parseEdition>) {
  const rows = await sql`INSERT INTO geo_daily_editions(id,source_message_id,day,issue,title,markdown,content_hash,source_url,source_links)
    VALUES (${edition.id},${edition.messageId},${edition.day},${edition.issue},${edition.title},${edition.markdown},${edition.hash},${edition.sourceUrl},${sql.json(edition.links)})
    ON CONFLICT DO NOTHING RETURNING id`;
  if (rows.length) return "created";
  const [existing] = await sql`SELECT content_hash FROM geo_daily_editions WHERE source_message_id=${edition.messageId} AND id=${edition.id}`;
  if (existing?.content_hash !== edition.hash) throw new Error("Edition conflict: existing report preserved; review changes before replacing");
  return "unchanged";
}
