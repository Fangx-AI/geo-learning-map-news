import { defineServerModule } from "@aihot/backend/modules";
import { loadGeoCollectionStatus, loadGeoPublicItem, loadGeoPublicItems, readGeoCursor, loadGeoDailyCandidates } from "@aihot/backend/publication/geo-public";
import { buildGeoDailyDigest } from "./backend/daily.ts";
import { loadGeoOverviewInput } from "@aihot/backend/publication/geo-overview";
import { loadGeoTranslationStatus, loadGeoTranslations } from "@aihot/backend/publication/geo-translations";
import { buildGeoOverview, validOverviewDay } from "./backend/overview.ts";
import { CorrectionRejected, submitTranslationCorrection, validCorrectionOrigin, listTranslationCorrections, reviewTranslationCorrection, pendingTranslationCorrectionCount } from "./backend/translation-corrections.ts";
import { adminHandler } from "@aihot/api/routes/admin-auth";
import { sendProblem } from "@aihot/api/http/respond";
import { actorOf } from "@aihot/backend/admin/auth";
import { z } from "zod";
import { listGeoEditions, loadGeoEdition } from "@aihot/backend/publication/geo-editions";

const querySchema = z.object({
  q: z.string().trim().max(200).optional(), language: z.string().max(35).regex(/^[a-zA-Z-]*$/).optional(),
  source: z.string().max(120).regex(/^[a-z0-9-]*$/).optional(),
  platform: z.enum(["web", "x", "reddit", "bluesky", "mastodon", "youtube", "zhihu", "xiaohongshu", "wechat"]).optional(),
  kind: z.enum(["direct", "social", "aggregated"]).optional(),
  period: z.enum(["24h", "7d", "30d"]).optional(),
  sort: z.enum(["recommended", "latest"]).optional(),
  group: z.enum(["title", "none"]).optional(), groupKey: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30), cursor: z.string().max(400).optional(),
}).strict();

export default defineServerModule({
  name: "geo-directory",
  admin:{counts:{geoCorrections:pendingTranslationCorrectionCount}},
  http(app) {
    app.get("/api/geo/editions", async (_req, reply) => {
      reply.header("Cache-Control", "public, max-age=60");
      return { editions: await listGeoEditions() };
    });
    app.get("/api/geo/editions/:id", async (req, reply) => {
      const parsed = z.object({ id: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).safeParse(req.params);
      if (!parsed.success) return reply.code(400).send({ error: "无效的期刊日期" });
      const edition = await loadGeoEdition(parsed.data.id);
      if (!edition) return reply.code(404).send({ error: "这期日报尚未发布" });
      reply.header("Cache-Control", "public, max-age=60");
      return { edition };
    });
    app.get("/api/admin/geo/translation-corrections",adminHandler(async req=>{
      const query=z.object({status:z.enum(["pending","applied","rejected","superseded","all"]).default("pending")}).strict().parse(req.query);
      return {rows:await listTranslationCorrections(query.status)};
    }));
    app.post("/api/admin/geo/translation-corrections/:id/review",{bodyLimit:4096},adminHandler(async(req,reply,admin)=>{
      const {id}=z.object({id:z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER)}).parse(req.params);
      const body=z.object({action:z.enum(["apply","reject"]),note:z.string().trim().max(500).optional()}).strict().parse(req.body);
      try {return await reviewTranslationCorrection(id,body.action,{write:true,note:body.note,reviewer:admin.name,actor:actorOf(admin),requestId:req.id});}
      catch(error) {
        if(error instanceof CorrectionRejected) return sendProblem(req,reply,{status:error.status,code:error.code,detail:error.message});
        throw error;
      }
    }));
    app.post("/api/geo/translation-corrections", { bodyLimit: 64 * 1024 }, async (req, reply) => {
      reply.header("Cache-Control", "no-store");
      if (!validCorrectionOrigin(req.headers.origin, String(req.headers["sec-fetch-site"] ?? ""))) return reply.code(403).send({ error: "请从本站页面提交纠错。", code: "origin_not_allowed" });
      try {
        const result=await submitTranslationCorrection(req.body,{ip:String(req.headers["x-real-ip"]??req.ip??""),userAgent:String(req.headers["user-agent"]??"")});
        return reply.code(result.duplicate?200:201).send({id:result.id,status:result.status});
      } catch(error) {
        if(error instanceof CorrectionRejected) {
          if(error.retryAfter) reply.header("Retry-After",error.retryAfter);
          return reply.code(error.status).send({error:error.message,code:error.code});
        }
        req.log.error({err:error},"GEO correction submission failed");
        return reply.code(503).header("Retry-After",30).send({error:"暂时无法提交，请稍后再试。",code:"temporarily_unavailable"});
      }
    });
    app.get("/api/geo/public-items", async (req, reply) => {
      const parsed = querySchema.safeParse(req.query);
      if (!parsed.success) return reply.code(400).send({ error: "无效的筛选条件；limit 为 1–50，搜索词最多 200 字符" });
      try { readGeoCursor(parsed.data.cursor, parsed.data); } catch { return reply.code(400).send({ error: "无效的分页游标，或游标与排序、筛选条件不一致；请回到第一页" }); }
      reply.header("Cache-Control", "public, max-age=30, s-maxage=30");
      return loadGeoPublicItems(parsed.data);
    });
    app.get("/api/geo/public-items/:id", async (req, reply) => {
      reply.header("Cache-Control", "no-store");
      const parsed = z.object({ id: z.string().regex(/^[a-f0-9]{64}$/i) }).safeParse(req.params);
      if (!parsed.success) return reply.code(400).send({ error: "无效的条目 ID" });
      const item = await loadGeoPublicItem(parsed.data.id);
      if (!item) return reply.code(404).send({ error: "内容不存在或已停止公开" });
      return { item };
    });
    app.get("/api/geo/collection-status", async (_req, reply) => {
      reply.header("Cache-Control", "public, max-age=30, s-maxage=30");
      return loadGeoCollectionStatus();
    });
    app.get("/api/geo/translation-status", async (_req, reply) => {
      reply.header("Cache-Control", "no-store");
      return loadGeoTranslationStatus();
    });
    app.get("/api/geo/translations", async (req, reply) => {
      const parsed=z.object({ids:z.string().max(6499).regex(/^[a-f0-9]{64}(?:,[a-f0-9]{64}){0,99}$/)}).strict().safeParse(req.query);
      if (!parsed.success) return reply.code(400).send({error:"须提供 1–100 个有效条目 ID"});
      reply.header("Cache-Control", "no-store");
      return {items:await loadGeoTranslations(parsed.data.ids.split(","))};
    });
    app.get("/api/geo/daily", async (req, reply) => {
      const query = z.object({ view: z.enum(["daily", "library"]).optional() }).strict().safeParse(req.query);
      if (!query.success) return reply.code(400).send({ error: "view 须为 daily 或 library" });
      reply.header("Cache-Control", "public, max-age=60, s-maxage=60");
      const now = Date.now();
      const library = query.data.view === "library";
      return { ...buildGeoDailyDigest(await loadGeoDailyCandidates(now, library), now, library), latestEdition: (await listGeoEditions())[0] ?? null };
    });
    app.get("/api/geo/overview", async (req, reply) => {
      const parsed = z.object({ day: z.string().refine(validOverviewDay).optional(), topic: z.string().max(100).regex(/^[a-z0-9-]+$/).optional() }).strict().safeParse(req.query);
      if (!parsed.success) return reply.code(400).send({ error: "day 须为真实日期 YYYY-MM-DD，topic 须为专题 slug" });
      reply.header("Cache-Control", "public, max-age=60, s-maxage=60");
      return buildGeoOverview(await loadGeoOverviewInput(parsed.data.day), Date.now(), parsed.data.topic);
    });
  },
  llms: () => ({ pages: ["/atlas — 全球 GEO 信源目录。", "/all 与 /stream — 公开原文资讯流，保留原始语言与出处。", "/read/:id — 站内阅读单条资料的原始短摘要与有效中文译文，保留配图及原文入口；打开页面不现场抓取或翻译。", "/ — 规则优选的近期阅读资料。", "/hot — 多来源主题覆盖排名。", "/daily — 近 24 小时重点与今日新补齐的研究概要；/daily/archive 保留原文日期归档。", "/topics — 按关键词匹配的 GEO 学习主题。"], api: ["GET /api/geo/daily — 近 24 小时重点与北京时间今日首次补齐的研究概要，跨栏去重；保留原文日期与有效中文概要，不返回私有证据。", "GET /api/geo/public-items — 公开原文条目，可按 q / language / source / platform / kind / period 筛选。sort=latest（API 默认）或 recommended；group=title 可折叠相似标题。limit 最大 50，用 nextCursor 在相同筛选与排序下继续读取；切换条件须清除游标。readingPriority 返回定性阅读线索、理由和局限，不是核验质量分。translation 为已缓存中文译文或已审核修订（未完成则为 null）；title/summary/url 保留原文。q 同时搜索原文和有效译文，language 按原文语言筛选。", "GET /api/geo/public-items/:id — 按 64 位十六进制条目 ID 读取单条公开资料，返回 {item}，含原文短摘要、当前有效中文译文、配图与原文链接；兼容历史 canonical ID。无摘要时保留 null，不采集全文或触发翻译。非法 ID 返回 400，缺失或来源停用返回 404。", "GET /api/geo/collection-status — 各公开来源最近采集状态。", "GET /api/geo/translation-status — 当前公开外文的中文补译进度及有效译文最近更新时间，不触发翻译。", "GET /api/geo/translations?ids=条目ID — 批量读取最多 100 条当前原文及有效中文译文；仅原文版本精确匹配时更新已有卡片或收藏。", "POST /api/geo/translation-corrections — 本站同源页面提交中文标题或摘要修订建议，带 itemId、original 精确原文版本、proposed 修订及可选 note；仅进入待审核，不自动发布。", "GET /api/geo/overview — 公开资料的精选、主题、榜单和每日汇编。可用 day=YYYY-MM-DD 或 topic=主题slug；统计规则和数据范围随响应返回。"], usage: ["公开资料仅按相关词收录，不代表人工事实核验或模型评分；摘要来自来源，具体事实请核对原文。榜单表示接入来源的主题覆盖，不代表平台真实热度。"] }),
});
