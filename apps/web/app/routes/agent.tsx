import { useEffect, useState } from "react";
import { IntentLink } from "../components/ui/IntentLink";
import { useLoaderData, useNavigate, useSearchParams } from "react-router";
import type { Route } from "./+types/agent";
import { PUBLIC_INTERFACE_VERSION } from "@aihot/contracts/http-policy";
import { SITE } from "@aihot/site";
import { apiGet, cachedPage } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { isStaticSnapshotRequest } from "../lib/static-snapshot";
import { listPath, pageMeta, siteUrl } from "../lib/seo";
import { IconArrowUpRight, IconChevronRight, IconCode, IconPlug, IconRss } from "../components/icons";
import { Kicker } from "../components/ui/Kicker";
import { AsideCard, ReadingLayout } from "../components/ui/Page";
import { AGENT_PARTS, GUIDE_CLIENTS, TAG } from "../features/agent/module-parts";
import { ApiPanel, McpPanel, mcpToolCount, RssPanel } from "../features/agent/panels";
import type { AgentTrack } from "../modules";
import { PhoneBar } from "../components/shell/PhoneBar";
import type { Screen } from "../components/shell/screens";

export const handle: Screen = { tab: "me", name: "Agent 接入" };

export { pageHeaders as headers } from "../lib/api.server";

const V = PUBLIC_INTERFACE_VERSION;

/** The ways in, the modules' first. The chooser's cards are the tabs: `?tab=` (the first is the default and not written). */
const TRACKS: AgentTrack[] = [
  ...AGENT_PARTS.flatMap((p) => p.tracks ?? []),
  { key: "mcp", name: "MCP", short: "MCP", pitch: `填一个地址，多出 ${mcpToolCount()} 个工具`, fit: "Claude 桌面版、Cursor 等远程 MCP 客户端", icon: IconPlug, Panel: McpPanel },
  { key: "rss", name: "RSS", short: "RSS", pitch: "复制地址，用阅读器订阅", fit: "Reeder、Folo、Inoreader、n8n", icon: IconRss, Panel: RssPanel },
  { key: "api", name: "REST API", short: "API", pitch: "匿名 GET，自己写程序取数", fit: "脚本、机器人、小程序、看板", icon: IconCode, Panel: ApiPanel, anchors: ["agent-api-recovery"] },
];
const FIRST = TRACKS[0]!.key;
const tabKey = (key: string | null) => key && TRACKS.some(t => t.key === key) ? key : FIRST;
const hrefOf = (key: string) => (key === FIRST ? "/agent" : `/agent?tab=${key}`);
/** How many ways, as the copy counts them ("四种方式"). */
const WAYS = ["零", "一", "两", "三", "四", "五", "六"][TRACKS.length];

/** The modules' sections at the end of a panel. */
const BLOCKS = AGENT_PARTS.flatMap((p) => p.blocks ?? []);
/** Which tab each section that can be linked to is on: the tracks' own, then the modules'. */
const ANCHORS = new Map([
  ...TRACKS.flatMap((t) => (t.anchors ?? []).map((id) => [id, t.key] as const)),
  ...BLOCKS.map((b) => [b.anchor, b.track] as const),
]);
const anchorHref = (id: string) => `${hrefOf(ANCHORS.get(id)!)}#${id}`;

/** Machine-readable entry points, with what each one is for. */
const RESOURCES: Array<[label: string, href: string, note: string]> = [
  ["llms.txt", "/llms.txt", "给大模型读的站点说明"],
  ["原引擎 Agent 使用说明", "/api/v1/agent", `原引擎发布内容的读取约定${GUIDE_CLIENTS ? `，供 ${GUIDE_CLIENTS} 使用` : ""}`],
  ["原引擎 OpenAPI 3.1", "/openapi-v1.json", `/api/v1 的定义 · ${V}，不含 /api/geo`],
  ["GEO 公开资料", "/api/geo/public-items?limit=20", "当前网页使用的原文条目与摘要"],
  ["GEO 概览", "/api/geo/overview", "当前精选、主题、热点与每日汇编"],
  ...AGENT_PARTS.flatMap((p) => p.resources ?? []),
];

const BANNERS = AGENT_PARTS.flatMap((p) => (p.Banner ? [p.Banner] : []));
/** The tag's value: a hook, called on every render. */
const useTag = TAG?.useValue ?? (() => null);

const localHost = (base: string) => {
  try {
    const host = new URL(base).hostname.replace(/^\[|\]$/g, "").toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1";
  } catch { return true; }
};

export async function loader({ request }: Route.LoaderArgs) {
  const base = siteUrl();
  const staticSnapshot = isStaticSnapshotRequest(request);
  // A Pages snapshot must not record "the API is healthy" just because export ran against localhost.
  const healthy = staticSnapshot ? false : await apiGet("/api/health", { signal: AbortSignal.any([request.signal, AbortSignal.timeout(3000)]) }).then(() => true, () => false);
  return cachedPage(300, {
    healthy,
    staticSnapshot,
    // The examples show the configured public address, the same on the server and in the browser; what
    // depends on the time reads the server's.
    base,
    now: Date.now(),
  });
}

/** The tabs read one result, kept under the address without `tab`. */
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>((url) => {
  const params = new URLSearchParams(url.search);
  params.delete("tab");
  return url.pathname + (params.size ? `?${params}` : "");
});

export function meta({ location }: Route.MetaArgs) {
  const tab = tabKey(new URLSearchParams(location.search).get('tab'));
  const path = listPath("/agent", { tab: tab !== FIRST ? tab : null });
  return pageMeta({
    title: "Agent 接入",
    description: `把 ${SITE.name} 接进你的 Agent：${TRACKS.map((t) => t.name).join("、")} ${WAYS}种方式，匿名只读，无需 API Key，一分钟接好。`,
    path,
    image: "/og/pages/agent.png",
  });
}

export default function AgentPage() {
  const { healthy, staticSnapshot, base, now } = useLoaderData<typeof loader>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const tag = useTag();
  const tab = tabKey(params.get('tab'));
  // A section to scroll to once its panel is on the page.
  const [target, setTarget] = useState<string | null>(null);

  // Opened at a section's anchor: show its tab and scroll there.
  useEffect(() => {
    const hash = location.hash.slice(1);
    const key = ANCHORS.get(hash);
    if (key) {
      if (key !== tab) navigate(`${hrefOf(key)}#${hash}`, { replace: true, preventScrollReset: true });
      setTarget(hash);
    }
  }, []);
  useEffect(() => {
    if (!target || tab !== ANCHORS.get(target)) return;
    document.getElementById(target)?.scrollIntoView({ block: "start" });
    setTarget(null);
  }, [target, tab]);

  const select = (key: string) => {
    if (key === tab) return;
    navigate(hrefOf(key), { replace: true, preventScrollReset: true });
  };
  const open = (id: string) => {
    navigate(anchorHref(id), { replace: true, preventScrollReset: true });
    setTarget(id);
  };
  const track = TRACKS.find((t) => t.key === tab);
  const local = localHost(base);

  const chip = "inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 text-[12px] text-ink-3";
  if (staticSnapshot) {
    return <>
      <PhoneBar back={{ to: "/more", label: "我的" }} title="Agent 接入" />
      <ReadingLayout aside={<AsideCard title="能用的"><p className="text-[13px] leading-7 text-ink-3">快照里有已经导出的网页，以及 <a href="/llms.txt" className="text-accent hover:underline">llms.txt</a> 和 <a href="/feed.xml" className="text-accent hover:underline">RSS</a>。MCP 和 REST 不在这个页面上。</p><IntentLink viewTransition to="/" className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:underline">回今日资讯 <IconChevronRight size={14} /></IntentLink></AsideCard>}>
        <header className="lg:pt-5">
          <Kicker>AGENT 接入</Kicker>
          <h1 data-page-title="" className="mt-4 text-[28px] font-semibold leading-[1.3] text-ink sm:text-[32px]">此快照不提供 Agent 接口</h1>
          <p className="mt-3 max-w-[40em] text-[15px] leading-[1.8] text-ink-3">GitHub Pages 只托管导出那一刻的网页。这里没有 MCP，公开 API 也会 404。不要把本机地址当成已经连上的服务，本页也不报告接口健康，也不承诺可以免密钥调用。</p>
          <p className="mt-3 max-w-[40em] text-[15px] leading-[1.8] text-ink-3">要接入 Agent，请在真正跑着接口的站点上打开这一页。阅读今天的资讯，从首页进入即可。</p>
        </header>
      </ReadingLayout>
    </>;
  }
  const aside = (
    <>
      <AsideCard title="接入方式" className="hidden lg:block">
        <nav aria-label="接入方式" className="-mx-2 -mb-1 space-y-0.5">
          {TRACKS.map((t) => {
            const on = t.key === tab;
            return (
              <a
                key={t.key}
                href={hrefOf(t.key)}
                onClick={(e) => {
                  e.preventDefault();
                  select(t.key);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                aria-current={on ? "true" : undefined}
                className={`flex items-center gap-2.5 rounded-control px-2 py-2 text-[13.5px] transition-colors ${on ? "bg-accent-soft font-medium text-accent" : "text-ink-2 hover:bg-bg-sunk hover:text-ink"}`}
              >
                <t.icon size={16} />
                <span className="min-w-0 flex-1">{t.name}</span>
                {on && <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />}
              </a>
            );
          })}
        </nav>
      </AsideCard>
      <AsideCard title="接入资源">
        <nav aria-label="接入资源" className="-mx-2 -mb-1">
          {RESOURCES.map(([l, h, note]) => (
            <a key={h} href={h} target={h.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" className="group flex items-start gap-2 rounded-control px-2 py-2 transition-colors hover:bg-bg-sunk">
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] text-ink-2 group-hover:text-ink">{l}</span>
                <span className="mt-0.5 block text-[12px] text-ink-4">{note}</span>
              </span>
              <IconArrowUpRight size={13} className="mt-1 shrink-0 text-ink-4" />
            </a>
          ))}
        </nav>
      </AsideCard>
      <AsideCard title="没接上？">
        <p className="text-[13px] leading-[1.75] text-ink-3">把平台、版本和报错写在反馈页，别发 token 或本地文件。</p>
        <IntentLink viewTransition to="/feedback" className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:underline">
          去反馈 <IconChevronRight size={14} />
        </IntentLink>
      </AsideCard>
    </>
  );

  return (
    <>
    <PhoneBar back={{ to: "/more", label: "我的" }} title="Agent 接入" />
    <ReadingLayout aside={aside}>
      <header className="lg:pt-5">
        <Kicker>AGENT 接入</Kicker>
        <h1 data-page-title="" className="mt-4 text-[28px] font-semibold leading-[1.3] text-ink sm:text-[32px]">{`把 ${SITE.name} 接进你的 Agent`}</h1>
        <p className="mt-3 max-w-[40em] text-[15px] leading-[1.8] text-ink-3">当前网页的 GEO 原始资料、精选和每日汇编使用 /api/geo，无需登录、密钥或模型调用。下方 REST API 页签列出这些接口；MCP、RSS 与 /api/v1 保留为原引擎的可选入口，发布数据可能为空，不与当前公开资讯流混用。</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className={`${chip} ${local ? "text-ink-2" : healthy ? "text-ok" : "text-hot"}`}>
            <span className={`size-1.5 rounded-full ${local ? "bg-ink-3" : healthy ? "bg-ok" : "bg-hot"}`} aria-hidden="true" />
            {local ? "仅本机接口" : healthy ? "服务正常" : "服务异常"}
          </span>
          <span className={chip}>版本 <span className="mono text-ink-2">{V}</span></span>
          {!local && <span className={chip}>匿名只读 · 无需 Key</span>}
        </div>
        {local && <p className="mt-3 max-w-[40em] text-[13px] leading-6 text-ink-3">下面的地址只指向这台机器。公开网页快照里没有这些接口，不能把本机显示成对外服务正常。</p>}
      </header>

      {BANNERS.map((Banner, i) => <Banner key={i} base={base} tag={tag} now={now} href={anchorHref} open={open} />)}

      <div role="tablist" aria-label="接入方式" className="mt-8 grid grid-cols-2 gap-2.5 sm:gap-3 2xl:grid-cols-4">
        {TRACKS.map((t) => {
          const on = t.key === tab;
          return (
            <a
              key={t.key}
              href={hrefOf(t.key)}
              role="tab"
              id={`agent-tab-${t.key}`}
              aria-selected={on}
              aria-controls="agent-panel"
              onClick={(e) => {
                e.preventDefault();
                select(t.key);
              }}
              className={`group flex flex-col rounded-card border p-3.5 transition-[border-color,background-color,box-shadow] duration-200 sm:p-4 ${on ? "border-accent/50 bg-accent-softer shadow-[inset_0_0_0_1px_var(--accent)]" : "border-line bg-surface shadow-[var(--shadow-card)] hover:border-line-strong hover:shadow-[var(--shadow-card-hover)]"}`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className={`grid size-9 place-items-center rounded-control transition-colors ${on ? "bg-accent text-accent-contrast" : "bg-bg-sunk text-ink-3 group-hover:text-ink"}`}>
                  <t.icon size={18} />
                </span>
                {t.badge && <span className="inline-flex h-[18px] items-center rounded-full bg-accent-soft px-2 text-[11px] font-medium text-accent">{t.badge}</span>}
              </span>
              <span className="mt-3 text-[15.5px] font-semibold text-ink">{t.name}</span>
              <span className="mt-1 text-[13px] leading-snug text-ink-2">{t.pitch}</span>
              <span className="mt-2 hidden text-[12px] leading-snug text-ink-4 sm:block">{t.fit}</span>
            </a>
          );
        })}
      </div>
      {TAG && <TAG.Note />}

      <section id="agent-panel" role="tabpanel" aria-labelledby={`agent-tab-${tab}`} className="mt-9">
        {track && <track.Panel key={track.key} base={base} tag={tag} now={now} />}
        {BLOCKS.filter((b) => b.track === tab).map((b) => <b.Block key={b.anchor} base={base} tag={tag} now={now} />)}
      </section>
    </ReadingLayout>
    </>
  );
}
