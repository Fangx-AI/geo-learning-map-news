import { ContentLanguageToggle } from "@aihot/web/components/translation";
import { Link, useLoaderData } from "react-router";
import { pageMeta } from "@aihot/web/lib/seo";
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import { ReadingCard } from "./reading-card.tsx";
import { chooseReading, READING_TASKS } from "./reading-guide.ts";
import type { featuredLoader as loader } from "./overview-pages.server.ts";
export const handle = { tab: "featured", name: "今日重点" };
export const meta = () =>
  pageMeta({
    title: "GEO 今日重点",
    description: "读懂全球 AI 搜索变化，判断下一步该做什么。",
    path: "/",
  });
export default function FeaturedPage() {
  const { digest } = useLoaderData<typeof loader>();
  const all = chooseReading(digest.research);
  const fresh = all.filter(
    (i) =>
      i.publishedAt &&
      Date.parse(i.publishedAt) >= Date.parse(digest.since) &&
      Date.parse(i.publishedAt) <= Date.parse(digest.generatedAt),
  );
  const added = all.filter(
    (i) => !fresh.some((v) => v.id === i.id) && i.briefAddedAt,
  );
  const reference = all
    .filter(
      (i) =>
        !fresh.some((v) => v.id === i.id) && !added.some((v) => v.id === i.id),
    )
    .slice(0, 3);
  return (
    <div className="mx-auto max-w-4xl pb-12">
      <PhoneBar title="今日重点" />
      <div className="mb-3 flex justify-end">
        <ContentLanguageToggle />
      </div>
      <header className="border-b border-line pb-6">
        <p className="text-xs text-ink-3">{digest.day} · 北京时间</p>
        <h1
          data-page-title=""
          className="mt-3 text-[32px] font-semibold tracking-tight text-ink"
        >
          今天，GEO 值得关注什么
        </h1>
        <p className="mt-3 text-[15px] leading-7 text-ink-2">
          先读结论与证据，再决定是否行动。
        </p>
        <div className="mt-4 flex flex-wrap gap-4 text-sm text-accent">
          <Link to="/library" className="min-h-11 py-3 lg:hidden">
            按工作问题找解读 →
          </Link>
          <Link to="/following" className="min-h-11 py-3 lg:hidden">
            我的关注与阅读记录 →
          </Link>
          {digest.latestEdition && <Link to={`/daily/editions/${digest.latestEdition.id}`} className="min-h-11 py-3 font-medium">读整期日报 · {digest.latestEdition.day} →</Link>}
        </div>
      </header>
      {!fresh.length && !added.length && (
        <p className="my-6 rounded-control bg-bg-sunk p-4 text-sm leading-7 text-ink-2">
          今天尚无新增的完整解读。下面是已核读的参考内容，原文日期保留，供你继续阅读。
        </p>
      )}
      {[
        {
          name: "近 24 小时的变化",
          items: fresh.slice(0, 4),
          note: "按原文发布时间筛选",
        },
        {
          name: "今天新读懂的内容",
          items: added.slice(0, 4),
          note: "今天补齐解读，原文可能较早",
        },
        {
          name: "值得先读的参考",
          items: reference,
          note: "已有资料，不计作今日新闻",
        },
      ]
        .filter((s) => s.items.length)
        .map((s) => (
          <section key={s.name} className="mt-7">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-xl font-semibold text-ink">{s.name}</h2>
              <span className="text-xs text-ink-3">{s.note}</span>
            </div>
            <div className="divide-y divide-line rounded-card border border-line bg-surface px-5">
              {s.items.map((i) => (
                <ReadingCard key={i.id} item={i} />
              ))}
            </div>
          </section>
        ))}
      <section className="mt-8">
        <h2 className="text-lg font-semibold text-ink">你正在解决什么问题？</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {READING_TASKS.map((t) => (
            <Link
              key={t.id}
              to={`/library?task=${t.id}`}
              className="rounded-control border border-line px-4 py-4 text-sm text-accent hover:bg-accent-soft"
            >
              {t.name} →
            </Link>
          ))}
        </div>
      </section>
      <footer className="mt-7 flex flex-wrap gap-5 border-t border-line pt-4 text-sm text-accent">
        <Link className="min-h-11 py-3" to="/daily/editions">
          往期报告 →
        </Link>
        <Link className="min-h-11 py-3 text-ink-3" to="/all">
          更多来源动态 →
        </Link>
      </footer>
    </div>
  );
}
