import { createHash } from "node:crypto";
import { z } from "zod";
import { decodeHTML } from "entities";
import { sql } from "@aihot/backend/db";
import { config } from "@aihot/backend/config";
import { feedbackSourceHash } from "@aihot/backend/operations/feedback";
import { serverModules } from "@aihot/backend/modules";
import { audit } from "@aihot/backend/audit";
import { geoTranslationIssues } from "../../../industry/translation.ts";
import { translationPercentages } from "./translate-public.ts";

export const REVIEWED_TRANSLATION_PROVIDER = "geo-reviewed-v1";
const originalSchema = z.object({title:z.string().min(1).max(5000),summary:z.string().max(10000).nullable(),language:z.string().min(1).max(35)}).strict();
const proposedSchema = z.object({title:z.string().trim().min(1).max(2000),summary:z.string().trim().max(6000).transform(value=>value||null).nullable()}).strict();
export const correctionSchema = z.object({
  itemId:z.string().regex(/^[a-f0-9]{64}$/),original:originalSchema,proposed:proposedSchema,note:z.string().trim().max(500).optional(),
}).strict();
export type CorrectionInput = z.infer<typeof correctionSchema>;
export class CorrectionRejected extends Error {
  readonly status:number;
  readonly code:string;
  readonly retryAfter?:number;
  constructor(status:number,code:string,message:string,retryAfter?:number){super(message);this.status=status;this.code=code;this.retryAfter=retryAfter;}
}

/** The web proxy preserves Origin. Only the configured site's browser form may write. */
export function validCorrectionOrigin(origin:string|undefined,fetchSite:string|undefined):boolean {
  if (!origin || fetchSite === "cross-site") return false;
  try { return new URL(origin).origin === origin && origin === new URL(config.siteUrl).origin; } catch { return false; }
}

function validateText(input:CorrectionInput) {
  if (/^zh(?:-|$)/i.test(input.original.language)) throw new CorrectionRejected(422,"invalid_translation","中文原文无需提交译文纠错。");
  if (Boolean(input.original.summary?.trim()) !== Boolean(input.proposed.summary?.trim())) throw new CorrectionRejected(422,"invalid_translation","请保留原摘要的中文译文；原文无摘要时不要新增内容。");
  if (!/[\p{Script=Han}]/u.test(input.proposed.title+(input.proposed.summary??""))) throw new CorrectionRejected(422,"invalid_translation","请填写中文修订建议。");
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(input.proposed.title+(input.proposed.summary??"")+(input.note??""))) throw new CorrectionRejected(422,"invalid_translation","修订内容包含无效字符。");
}

/** Pending suggestions stay private; publishing requires the local review command below. */
export async function submitTranslationCorrection(raw:unknown,client:{ip:string;userAgent:string}) {
  const parsed=correctionSchema.safeParse(raw);
  if(!parsed.success) throw new CorrectionRejected(422,"invalid_request","请检查标题、摘要和说明的长度及格式。");
  const input=parsed.data;
  validateText(input);
  const source=feedbackSourceHash(client.ip,client.userAgent);
  const keys=[source,...serverModules().flatMap(module=>module.feedbackKeys?.(client.ip)??[])];
  const fingerprint=createHash("sha256").update(JSON.stringify([input.itemId,input.original,input.proposed])).digest("hex");
  return sql.begin(async tx=>{
    await tx`SELECT pg_advisory_xact_lock(hashtext('geo-translation-correction'),hashtext(${source}))`;
    if ((await tx`SELECT 1 FROM feedback_bans WHERE source_hash IN ${tx(keys)}`).length) throw new CorrectionRejected(403,"forbidden","暂时无法提交纠错。");
    const [item]=await tx`SELECT i.title,i.summary,i.language FROM geo_public_items i
      JOIN geo_public_source_status s ON s.source_id=i.source_id AND s.enabled WHERE i.id=${input.itemId} FOR UPDATE OF i`;
    if (!item) throw new CorrectionRejected(404,"not_found","这条内容已不可用。");
    if (item.title!==input.original.title || item.summary!==input.original.summary || item.language!==input.original.language) throw new CorrectionRejected(409,"source_changed","原文已更新，请刷新后重新提交。");
    const [duplicate]=await tx`SELECT id,status FROM geo_translation_corrections WHERE source_hash=${source} AND fingerprint=${fingerprint}`;
    if (duplicate) {
      if(duplicate.status==='pending') return {id:Number(duplicate.id),status:"pending" as const,duplicate:true};
      throw new CorrectionRejected(409,"already_reviewed","这条修订建议已处理，请修改后再提交。");
    }
    const [current]=await tx`SELECT title_zh,summary_zh FROM (
      SELECT title_zh,summary_zh,0 AS priority FROM geo_translation_corrections WHERE item_id=${input.itemId} AND status='applied'
        AND (title_original,summary_original,language_original) IS NOT DISTINCT FROM (${item.title},${item.summary},${item.language})
      UNION ALL SELECT title_zh,summary_zh,1 AS priority FROM geo_public_translations WHERE item_id=${input.itemId} AND status='done'
        AND (title_original,summary_original,language_original) IS NOT DISTINCT FROM (${item.title},${item.summary},${item.language})
    ) available ORDER BY priority LIMIT 1`;
    if(current?.title_zh===input.proposed.title && current?.summary_zh===input.proposed.summary) throw new CorrectionRejected(422,"unchanged","请修改至少一处译文后再提交。");
    const [rate]=await tx`SELECT count(*) FILTER(WHERE created_at>now()-interval '1 minute')::int AS minute,
      count(*) FILTER(WHERE created_at>now()-interval '1 day')::int AS day FROM geo_translation_corrections WHERE source_hash=${source}`;
    if(rate.minute>=5 || rate.day>=30) throw new CorrectionRejected(429,"rate_limited","提交较频繁，请稍后再试。",rate.minute>=5?60:3600);
    if((await tx`SELECT 1 FROM geo_translation_corrections WHERE item_id=${input.itemId} AND status='pending' LIMIT 20`).length>=20) throw new CorrectionRejected(429,"pending_limit","这条内容的建议正在处理中，请稍后再试。",3600);
    const [row]=await tx`INSERT INTO geo_translation_corrections
      (item_id,title_original,summary_original,language_original,title_zh,summary_zh,note,source_hash,fingerprint)
      VALUES (${input.itemId},${item.title},${item.summary},${item.language},${input.proposed.title},${input.proposed.summary},${input.note||null},${source},${fingerprint}) RETURNING id`;
    return {id:Number(row.id),status:"pending" as const,duplicate:false};
  });
}

/** Administrative local reads, never mounted on a public route. */
const adminColumns=sql`c.id,c.item_id,c.status,c.title_original,c.summary_original,c.language_original,c.title_zh,c.summary_zh,c.note,
  c.created_at,c.reviewed_at,c.reviewed_by,c.review_note,i.url,i.title AS current_title,i.summary AS current_summary,i.language AS current_language,
  s.enabled,(c.title_original,c.summary_original,c.language_original) IS DISTINCT FROM (i.title,i.summary,i.language) AS stale,
  machine.title_zh AS machine_title_zh,machine.summary_zh AS machine_summary_zh`;
const adminJoins=sql`JOIN geo_public_items i ON i.id=c.item_id JOIN geo_public_source_status s ON s.source_id=i.source_id
  LEFT JOIN geo_public_translations machine ON machine.item_id=i.id AND machine.status='done'
  AND (machine.title_original,machine.summary_original,machine.language_original) IS NOT DISTINCT FROM (i.title,i.summary,i.language)`;
export async function listTranslationCorrections(status="pending") {
  if(!["pending","applied","rejected","superseded","all"].includes(status)) throw new Error("Invalid correction status");
  return sql`SELECT ${adminColumns} FROM geo_translation_corrections c ${adminJoins}
    WHERE (${status}='all' OR c.status=${status}) ORDER BY ${status==='pending'?sql`c.id ASC`:sql`c.id DESC`} LIMIT 100`;
}
export async function readTranslationCorrection(id:number) {
  const [row]=await sql`SELECT ${adminColumns} FROM geo_translation_corrections c ${adminJoins} WHERE c.id=${id}`;
  return row??null;
}
export async function pendingTranslationCorrectionCount():Promise<number> {
  const [row]=await sql`SELECT count(*)::int AS n FROM geo_translation_corrections WHERE status='pending'`;
  return row.n;
}

/** An overlay, not the worker's cache: even an already in-flight machine response cannot replace it. */
export async function reviewTranslationCorrection(id:number,action:"apply"|"reject",options:{write?:boolean;reviewer:string;note?:string;actor?:string;requestId?:string}) {
  if(!Number.isSafeInteger(id)||id<1) throw new Error("Invalid correction ID");
  if(!options.reviewer.trim()||options.reviewer.length>100||options.note && options.note.length>500) throw new Error("Invalid reviewer or note");
  if(action==='reject'&&!options.note?.trim()) throw new CorrectionRejected(422,"invalid_request","请填写拒绝原因。");
  return sql.begin(async tx=>{
    // Lock the source first: two reviews serialize, and collection cannot change the original mid-apply.
    const [item]=await tx`SELECT i.id FROM geo_public_items i WHERE i.id=(SELECT item_id FROM geo_translation_corrections WHERE id=${id}) FOR UPDATE`;
    if(!item) throw new CorrectionRejected(404,"not_found","找不到纠错建议。");
    const [row]=await tx`SELECT c.*,i.title,i.summary,i.language,i.url,s.enabled FROM geo_translation_corrections c
      JOIN geo_public_items i ON i.id=c.item_id JOIN geo_public_source_status s ON s.source_id=i.source_id WHERE c.id=${id} FOR UPDATE OF c`;
    if(row.status!=="pending") throw new CorrectionRejected(409,"already_reviewed","这条建议已处理。");
    const stale=row.title_original!==row.title||row.summary_original!==row.summary||row.language_original!==row.language;
    if(action==='apply') {
      if(stale||!row.enabled) throw new CorrectionRejected(409,"source_changed","原文已变化或来源已停用，不能应用旧建议。");
      const original={title:row.title_original,summary:row.summary_original};
      const translated={title:row.title_zh,summary:row.summary_zh};
      if(geoTranslationIssues(original,translated).length) throw new CorrectionRejected(422,"invalid_translation","修订仍有已知漏译或年份问题，请重新提交。");
      for(const field of ["title","summary"] as const) {
        if(JSON.stringify(translationPercentages(decodeHTML(original[field]??"")))!==JSON.stringify(translationPercentages(translated[field]??""))) throw new CorrectionRejected(422,"invalid_translation","修订中的百分比与原文不一致，不能应用。");
      }
    }
    if(options.write) {
      if(action==='apply') await tx`UPDATE geo_translation_corrections SET status='superseded' WHERE item_id=${row.item_id} AND status='applied'
        AND (title_original,summary_original,language_original) IS NOT DISTINCT FROM (${row.title_original},${row.summary_original},${row.language_original})`;
      await tx`UPDATE geo_translation_corrections SET status=${action==='apply'?'applied':'rejected'},reviewed_at=now(),reviewed_by=${options.reviewer.trim()},review_note=${options.note?.trim()||null} WHERE id=${id}`;
      await audit(options.actor??options.reviewer,`geo.translation.${action}`,`geo-correction:${id}`,options.note?.trim()||null,
        {status:row.status,itemId:row.item_id},{status:action==='apply'?'applied':'rejected',title:row.title_zh,summary:row.summary_zh},
        {db:tx,requestId:options.requestId});
    }
    return {id,status:options.write?(action==='apply'?'applied':'rejected'):'pending',action,write:Boolean(options.write),stale,
      original:{title:row.title_original,summary:row.summary_original,language:row.language_original},proposed:{title:row.title_zh,summary:row.summary_zh},url:row.url};
  });
}
