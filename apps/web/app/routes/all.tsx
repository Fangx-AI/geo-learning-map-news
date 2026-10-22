export { default, loader, headers, clientLoader, shouldRevalidate } from "../../../../modules/geo-directory/web/stream.tsx";
import { pageMeta } from "../lib/seo";
import { publicFeedAddress } from "../../../../modules/geo-directory/web/meta.ts";
export const handle = { tab: "all", name: "最新" };
export const meta = ({ location }: { location: { search: string } }) => pageMeta({ title: "最新 GEO 资讯", description: "全球 GEO 与 AI 搜索资讯，按时间排列，可按平台、来源、语言和关键词筛选。", ...publicFeedAddress("/all", location.search) });
