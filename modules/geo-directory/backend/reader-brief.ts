import { createHash } from "node:crypto";
import { z } from "zod";
import { sql } from "@aihot/backend/db";

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const text = (min: number, max: number) => z.string().trim().min(min).max(max)
  .refine(value => /\p{Script=Han}/u.test(value), "Reader briefs must be written in Chinese")
  .refine(value => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value), "Invalid control character")
  .refine(value => !/(?:<\/?[a-z][^>]*>|<!--|&lt;\/?[a-z]|javascript:|data:text\/html)/i.test(value), "Use plain text, not HTML")
  .refine(value => !/^(?:暂无(?:摘要|数据|内容)|详见原文|请查看原文|值得关注)[。！!\s]*$/.test(value), "Empty brief placeholder");

/** A short original synthesis, never the extracted article body or private supporting quotes. */
export const readerBriefSchema = z.object({
  conclusion: text(12, 240),
  findings: z.array(text(12, 300)).min(1).max(5),
  geoValue: z.array(text(12, 240)).min(1).max(3),
  caveats: z.array(text(8, 220)).max(3),
  coverage: z.enum(["full-article", "abstract"]),
}).strict().refine(value => [value.conclusion, ...value.findings, ...value.geoValue, ...value.caveats].join("").length <= 1800,
  "Reader brief exceeds the short-summary limit");
export type ReaderBrief = z.infer<typeof readerBriefSchema>;
export type PublishedReaderBrief = ReaderBrief & { updatedAt: string; automated?: boolean };

/** Exact source snapshot: no trimming; null and an empty summary are different versions. */
export function readerBriefInputHash(input: { url: string; title: string; summary: string | null }): string {
  return createHash("sha256").update(JSON.stringify([input.url, input.title, input.summary ?? null])).digest("hex");
}

export const readerBriefImportSchema = z.object({
  id: hashSchema,
  inputHash: hashSchema,
  sourceUrl: z.url().refine(value => /^https?:\/\//i.test(value), "Expected an HTTP source URL"),
  bodyHash: hashSchema.optional(),
  brief: readerBriefSchema,
  evidence: z.unknown().optional(),
}).strict();
export type ReaderBriefImport = z.infer<typeof readerBriefImportSchema>;
export type SaveReaderBriefInput = ReaderBriefImport & {
  provenance: "reviewed" | "local-model";
  model?: string;
  promptVersion?: string;
};
export type SaveReaderBriefResult = { saved: true } | { saved: false; reason: "not-found" | "source-changed" | "reviewed-protected" };

const saveSchema = readerBriefImportSchema.extend({
  provenance: z.enum(["reviewed", "local-model"]),
  model: z.string().trim().min(1).max(200).optional(),
  promptVersion: z.string().trim().min(1).max(100).optional(),
}).strict().refine(value => value.provenance !== "local-model" || Boolean(value.bodyHash && value.model && value.promptVersion),
  "Local model briefs require a body hash, model and prompt version");

/** No generation happens here. A background worker or reviewed local import supplies the brief. */
export async function saveReaderBrief(raw: SaveReaderBriefInput): Promise<SaveReaderBriefResult> {
  const input = saveSchema.parse(raw);
  const evidence = input.evidence === undefined ? null : JSON.stringify(input.evidence);
  if (evidence !== null && (!evidence || evidence.length > 100_000)) throw new Error("Invalid or oversized private brief evidence");
  return sql.begin(async tx => {
    // Lock the snapshot and enabled source until the compare-and-save completes.
    const [item] = await tx<{ url: string; title: string; summary: string | null }[]>`
      SELECT i.url,i.title,i.summary FROM geo_public_items i
      JOIN geo_public_source_status s ON s.source_id=i.source_id AND s.enabled
      WHERE i.id=${input.id} FOR UPDATE OF i FOR SHARE OF s`;
    if (!item) return { saved: false, reason: "not-found" } as const;
    if (item.url !== input.sourceUrl || readerBriefInputHash(item) !== input.inputHash) return { saved: false, reason: "source-changed" } as const;
    const [saved] = await tx`INSERT INTO geo_public_reader_briefs
      (item_id,input_hash,body_hash,brief,evidence,provenance,model,prompt_version)
      VALUES (${input.id},${input.inputHash},${input.bodyHash ?? null},${tx.json(input.brief)},${evidence === null ? null : tx.json(JSON.parse(evidence))},${input.provenance},${input.model ?? null},${input.promptVersion ?? null})
      ON CONFLICT (item_id) DO UPDATE SET input_hash=excluded.input_hash,body_hash=excluded.body_hash,
        brief=excluded.brief,evidence=excluded.evidence,provenance=excluded.provenance,model=excluded.model,
        prompt_version=excluded.prompt_version,updated_at=now()
      WHERE geo_public_reader_briefs.provenance<>'reviewed' OR excluded.provenance='reviewed'
      RETURNING item_id`;
    return saved ? { saved: true } as const : { saved: false, reason: "reviewed-protected" } as const;
  }) as Promise<SaveReaderBriefResult>;
}
