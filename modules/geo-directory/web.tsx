import {IconDoc,IconHeart} from "@aihot/web/components/icons";
import { defineWebModule } from "@aihot/web/modules";
import { geoReaderHref } from "./web/reader-links.ts";

export function GlobeIcon({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18M5 6.5h14M5 17.5h14" /></svg>;
}

export default defineWebModule({
  name: "geo-directory",
  sidebar: { section: "内容", items: [{ to: "/library", label: "解读库", icon: IconDoc }, { to: "/following", label: "我的关注", icon: IconHeart }] },
  tabs: [{ key: "library", to: "/library", label: "解读库", icon: IconDoc }, { key: "following", to: "/following", label: "关注", icon: IconHeart }],
  tools: [{ to: "/topics", label: "主题", icon: <GlobeIcon /> }, { to: "/hot", label: "热点榜", icon: <GlobeIcon /> }, { to: "/daily/editions", label: "往期日报", icon: <GlobeIcon /> }, { to: "/atlas", label: "全球 GEO 信源目录", icon: <GlobeIcon /> }],
  starredItemActions: () => import("./web/starred-actions.tsx"),
  starredItemHref: (item, from) => item.url && /^[a-f0-9]{64}$/i.test(item.id) ? geoReaderHref(item.id, from) : null,
  admin: { content: [{ to: "/admin/geo-corrections", label: "译文纠错", count: "geoCorrections" }] },
});
