export { default, loader, headers, clientLoader, shouldRevalidate } from "../../../../modules/geo-directory/web/stream.tsx";
import { pageMeta } from "../lib/seo";
import { publicFeedAddress } from "../../../../modules/geo-directory/web/meta.ts";
export const handle = { tab: "featured", name: "全部动态" };
export const meta = ({ location }: { location: { search: string } }) => pageMeta({ title: "全部 GEO 动态", description: "从全球公开来源采集的 GEO 原文，按语言、来源与关键词筛选。", ...publicFeedAddress("/all", location.search) });
