import { ContentLanguageToggle, useTranslatedContent } from "@aihot/web/components/translation";
import { Link, useLoaderData, useLocation } from "react-router";
import { pageMeta } from "@aihot/web/lib/seo";
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import { useState } from "react";
import { withoutTitleCredit } from "@aihot/industry/translation";
import { cardImageUrl, indexedHeadline, ItemCard, ValueBadge, newsTime, type CardItem } from "./components.tsx";
import { CHANNELS, itemChannels } from "./channels.ts";
import { geoReaderHref } from "./reader-links.ts";
import type { featuredLoader as loader } from "./overview-pages.server.ts";
import type { GeoDailyItem } from "../types.ts";
export const handle = { tab: "featured", name: "首页" };
export const meta = () =>
  pageMeta({
    title: "GEO 学习地图：全球 GEO 与 AI 搜索资讯",
    description: "每天汇总 Google、ChatGPT、Perplexity、豆包、DeepSeek 等 AI 搜索平台的官方变化、研究数据与实测，中文速读，保留原文链接。",
    path: "/",
  });

const beijingDay = (value: string) => new Date(Date.parse(value) + 8 * 3600_000).toISOString().slice(0, 10);
const dayHeading = (day: string, today: string, yesterday: string) => day === today ? "今天" : day === yesterday ? "昨天" : `${Number(day.slice(5, 7))}月${Number(day.slice(8))}日`;

function TopStory({ item, lead }: { item: CardItem; lead: boolean }) {
  const content = useTranslatedContent(item);
  const location = useLocation();
  const from = location.pathname + location.search;
  const channels = itemChannels(item.title, item.translation?.title);
  const aggregated = item.contentKind === "aggregated";
  const outlet = item.publisherName ?? indexedHeadline(item.title, aggregated).outlet;
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const imageUrl = lead ? cardImageUrl(item.imageUrl) : null;
  return <article data-top-story={item.id} className={lead ? "border-b border-line pb-5" : "border-b border-line py-4 last:border-b-0 sm:[&:nth-last-child(2)]:border-b-0"}>
    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
      <ValueBadge badge={item.readingPriority?.badge} />
      {channels.map(channel => <Link key={channel.slug} to={`/topics/${channel.slug}`} className="px-1 py-0.5 text-[11px] font-semibold text-accent hover:underline">{channel.name}</Link>)}
    </div>
    {imageUrl && imageUrl !== failedImageUrl && <Link to={geoReaderHref(item.id, from)} state={{ geoReaderFrom: from }} tabIndex={-1} aria-hidden="true" className="mb-3 block"><img src={imageUrl} alt="" loading="eager" decoding="async" referrerPolicy="no-referrer" ref={image => { if (image?.complete && !image.naturalWidth) setFailedImageUrl(imageUrl); }} onError={() => setFailedImageUrl(imageUrl)} className="aspect-[2/1] w-full rounded-control object-cover" /></Link>}
    <h3 lang={content.language} className={`font-semibold leading-snug text-ink ${lead ? "text-[22px]" : "text-[16px]"}`}><Link to={geoReaderHref(item.id, from)} state={{ geoReaderFrom: from }} className="hover:text-accent hover:underline">{withoutTitleCredit(indexedHeadline(content.title, aggregated).title)}</Link></h3>
    {lead && content.summary && <p lang={content.language} className="mt-2 line-clamp-3 text-[15px] leading-7 text-ink-2">{content.summary}</p>}
    <p className="mt-2 text-[12px] text-ink-3">{outlet ? `${outlet} · ` : ""}{item.sourceName} · <time dateTime={item.publishedAt ?? undefined} suppressHydrationWarning>{newsTime(item.publishedAt)}</time>{item.nearDuplicates && item.nearDuplicates.count > 1 && ` · ${item.nearDuplicates.count} 个来源报道`}</p>
  </article>;
}

function ReadingLink({ item }: { item: GeoDailyItem }) {
  const content = useTranslatedContent(item);
  const location = useLocation();
  const from = location.pathname + location.search;
  return <li data-reading-link={item.id}><Link to={geoReaderHref(item.id, from)} state={{ geoReaderFrom: from }} className="block py-2.5 hover:text-accent"><span className="block text-[14px] font-semibold leading-6 text-ink">{content.title}</span><span className="mt-0.5 block text-[12px] text-ink-3">{item.sourceName}</span></Link></li>;
}

export default function FeaturedPage() {
  const data = useLoaderData<typeof loader>();
  const now = Date.parse(data.generatedAt);
  const today = beijingDay(data.generatedAt), yesterday = beijingDay(new Date(now - 86_400_000).toISOString());
  const days = new Map<string, CardItem[]>();
  for (const item of data.latest) {
    const day = beijingDay(item.publishedAt ?? item.collectedAt);
    days.set(day, [...(days.get(day) ?? []), item]);
  }
  const [lead, ...rest] = data.highlights;
  // A quiet day still leads with the newest important items, but does not call older news today's headline.
  const leadFresh = !!lead?.publishedAt && now - Date.parse(lead.publishedAt) <= 86_400_000;
  const weekday = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "long", day: "numeric", weekday: "long" }).format(new Date(now));
  return (
    <div className="mx-auto max-w-6xl pb-12">
      <PhoneBar title="GEO 资讯" />
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
        <div>
          <p className="text-[13px] text-ink-3">{weekday}</p>
          <h1 data-page-title="" className="mt-1 text-[28px] font-semibold tracking-tight text-ink">今日 GEO 资讯</h1>
          <p className="mt-1 text-[14px] text-ink-3">{data.sourceCount} 个全球信源 · {data.window.kind === "48h" ? "近 48 小时" : data.window.kind === "7d" ? "近 7 天" : "最近"} {data.window.itemCount} 条</p>
        </div>
        <ContentLanguageToggle />
      </header>
      <nav aria-label="按平台看" className="flex gap-2 overflow-x-auto py-3 [mask-image:linear-gradient(to_right,#000_85%,transparent)] [scrollbar-width:none] lg:flex-wrap lg:overflow-visible lg:[mask-image:none] [&::-webkit-scrollbar]:hidden">
        {CHANNELS.map(channel => <Link key={channel.slug} to={`/topics/${channel.slug}`} className="inline-flex min-h-9 shrink-0 items-center rounded-full bg-bg-sunk px-3 text-[13px] text-ink-2 hover:bg-accent-soft hover:text-accent">{channel.name}</Link>)}
      </nav>
      <div className="mt-2 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-6">
          {lead && <section aria-labelledby="top-stories" className="rounded-card border border-line bg-surface px-5 py-5 lg:px-6">
            <h2 id="top-stories" className="mb-4 text-[19px] font-semibold text-ink">{leadFresh ? "头条" : data.window.kind === "48h" ? "近两日要闻" : "近期要闻"}</h2>
            <TopStory item={lead} lead />
            {rest.length > 0 && <div className="grid gap-x-6 sm:grid-cols-2">{rest.map(item => <TopStory key={item.id} item={item} lead={false} />)}</div>}
          </section>}
          <section aria-labelledby="latest">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="latest" className="text-[19px] font-semibold text-ink">最新资讯</h2>
              <Link to="/all" className="text-[13px] text-accent hover:underline">全部资讯 →</Link>
            </div>
            {data.latest.length === 0 && !lead && <p className="rounded-card border border-dashed border-line p-8 text-center text-[14px] text-ink-3">还没有收录资讯。采集运行后，这里会按时间显示。</p>}
            {[...days].map(([day, items]) => <div key={day} className="mb-4">
              <h3 className="mb-2 text-[13px] font-semibold text-ink-3">{dayHeading(day, today, yesterday)}</h3>
              <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">{items.map(item => <ItemCard key={item.id} item={item} />)}</ul>
            </div>)}
            <div className="flex flex-wrap items-center justify-between gap-3 text-[13px]">
              <div className="space-y-1 text-ink-3">
                {data.papersMoved > 0 && <p>另有 {data.papersMoved} 篇论文放在<Link to="/library#library-research" className="text-accent hover:underline">研究与解读</Link>。</p>}
                {data.hiddenTotal > 0 && <p>已折叠 {data.hiddenTotal} 条服务商软文、排行榜和转载。<Link to="/all?quality=all" className="text-accent hover:underline">也看看</Link></p>}
              </div>
              <Link to="/all" className="inline-flex min-h-11 items-center rounded-control border border-line bg-surface px-4 font-semibold text-accent hover:bg-accent-soft">查看更多资讯 →</Link>
            </div>
          </section>
        </div>
        <aside className="space-y-4">
          {data.hot.length > 0 && <section aria-labelledby="hot" className="rounded-card border border-line bg-surface px-5 py-4">
            <h2 id="hot" className="text-[16px] font-semibold text-ink">近期热门平台</h2>
            <ol className="mt-2">{data.hot.map((cluster, index) => <li key={cluster.id}><Link to={`/topics/${cluster.topicSlug}`} className="flex min-h-11 items-center gap-3 border-b border-line-soft py-2 text-[14px] text-ink last:border-b-0 hover:text-accent"><span className="w-4 font-semibold text-accent">{index + 1}</span><span className="min-w-0 flex-1 truncate">{cluster.title}</span><span className="shrink-0 text-[12px] text-ink-3">{cluster.sourceCount} 个来源</span></Link></li>)}</ol>
          </section>}
          {data.readings.length > 0 && <section aria-labelledby="readings" className="rounded-card border border-line bg-surface px-5 py-4">
            <div className="flex items-baseline justify-between gap-2"><h2 id="readings" className="text-[16px] font-semibold text-ink">中文解读</h2><Link to="/library" className="text-[12px] text-accent hover:underline">全部 →</Link></div>
            <ul className="mt-1 divide-y divide-line-soft">{data.readings.map(item => <ReadingLink key={item.id} item={item} />)}</ul>
          </section>}
          <section aria-labelledby="daily" className="rounded-card bg-ink px-5 py-4 text-bg">
            <h2 id="daily" className="text-[16px] font-semibold">GEO 日报</h2>
            <p className="mt-1 text-[13px] leading-6 opacity-80">把一天里重要的变化放在一页里读完。</p>
            <div className="mt-3 flex flex-wrap gap-2 text-[13px]">
              {data.latestEdition && <Link to={`/daily/editions/${data.latestEdition.id}`} className="inline-flex min-h-9 items-center rounded-control bg-bg px-3 font-semibold text-ink">读 {data.latestEdition.day} 日报</Link>}
              <Link to="/daily/archive" className="inline-flex min-h-9 items-center rounded-control border border-current px-3 opacity-90">按日期看</Link>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
