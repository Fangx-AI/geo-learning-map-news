import { useStaticSnapshot } from "@aihot/web/lib/static-snapshot";
import { ContentLanguageToggle } from "@aihot/web/components/translation";
import { Form, Link, useLoaderData, useSearchParams } from "react-router";
import { pageMeta } from "@aihot/web/lib/seo";
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import { libraryLoader } from "./overview-pages.server.ts";
import { chooseReading, itemTasks, READING_TASKS } from "./reading-guide.ts";
import { ReadingCard } from "./reading-card.tsx";
import { ItemList } from "./components.tsx";
export { headers } from "./overview-pages.server.ts";
export const loader = libraryLoader;
export const handle = { tab: "library", name: "研究与解读" };
export const meta = () =>
  pageMeta({ title: "GEO 研究与解读", description: "近 30 天的 GEO 研究、一手数据和论文，以及重点研究的中文解读。", path: "/library" });
export default function Library() {
  const staticSnapshot = useStaticSnapshot();
  const { digest, research } = useLoaderData<typeof loader>();
  const [params] = useSearchParams();
  const task = params.get("task") ?? "",
    q = (params.get("q") ?? "").slice(0, 200).trim();
  const items = chooseReading(digest.research).filter(
    (i) =>
      (!task || itemTasks(i).some((t) => t.id === task)) &&
      q
        .toLowerCase()
        .split(/\s+/)
        .every((w) =>
          [
            i.title,
            i.translation?.title,
            i.brief?.conclusion,
            ...(i.brief?.findings ?? []),
            ...(i.brief?.geoValue ?? []),
          ]
            .join(" ")
            .toLowerCase()
            .includes(w),
        ),
  );
  const count = Math.max(12, Math.min(2000, Number(params.get("limit")) || 12));
  const readings = chooseReading(digest.research);
  const hasReadings = readings.length > 0;
  const readingIds = new Set(readings.map((item) => item.id));
  const abstracts = research.filter((item) => !readingIds.has(item.id) && !item.readingReady);
  return (
    <div className="mx-auto max-w-4xl pb-12">
      <PhoneBar title="研究与解读" />
      <div className="mb-3 flex justify-end">
        <ContentLanguageToggle />
      </div>
      <h1 data-page-title="" className="text-[30px] font-semibold text-ink">
        研究与解读
      </h1>
      <p className="mt-3 text-sm leading-7 text-ink-3">
        近 30 天的研究、一手数据和论文；重点研究另有中文解读：结论、关键数据、对 GEO 的启示。
      </p>
      {hasReadings && <>
      <h2 className="mt-6 text-[18px] font-semibold text-ink">中文解读</h2>
      {staticSnapshot ? <p className="mt-3 rounded-control bg-bg-sunk px-3 py-2 text-[13px] leading-6 text-ink-3">快照不能搜索或按问题筛选。下面是已有解读；摘要墙不再重复这些篇。</p> : <Form method="get" action="/library" className="mt-5 space-y-3">
        <label className="block text-sm text-ink-2">
          工作问题
          <select
            name="task"
            defaultValue={task}
            key={task}
            className="mt-2 block min-h-11 w-full rounded-control border border-line bg-surface px-3"
          >
            <option value="">全部问题</option>
            {READING_TASKS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <input
            name="q"
            type="search"
            maxLength={200}
            key={q}
            defaultValue={q}
            aria-label="搜索中文解读"
            placeholder="搜索平台、问题或结论"
            className="min-h-11 min-w-0 flex-1 rounded-control border border-line bg-surface px-3"
          />
          <button className="rounded-control bg-accent px-5 text-white">
            查找
          </button>
        </div>
      </Form>}
      <p role="status" className="my-4 text-xs text-ink-3">
        找到 {items.length} 篇解读
      </p>
      <div className="divide-y divide-line">
        {items.slice(0, count).map((i) => (
          <ReadingCard key={i.id} item={i} />
        ))}
      </div>
      {!items.length && (
        <p className="py-6 text-sm text-ink-2">
          暂未找到匹配解读。
          <Link to="/library" className="text-accent">
            清除筛选
          </Link>
        </p>
      )}
      {items.length > count && (
        <Link
          to={`?${new URLSearchParams({ task, q, limit: String(count + 12) })}`}
          preventScrollReset
          className="block min-h-11 rounded-control border border-line p-3 text-center text-accent"
        >
          再看 12 篇
        </Link>
      )}
      {!staticSnapshot && <Link
        to="/following"
        className="mt-6 inline-flex min-h-11 items-center text-sm text-accent"
      >
        关注这些问题，接着读 →
      </Link>}
      </>}
      <section aria-labelledby="library-research" className="mt-8">
        <h2 id="library-research" className="mb-1 text-[18px] font-semibold text-ink">近 30 天研究与数据<span className="ml-2 text-[12px] font-normal text-ink-3">{abstracts.length} 条</span></h2>
        <p className="mb-3 text-[12px] leading-6 text-ink-3">{hasReadings ? "已有解读的在上面，这里只留还没有解读的来源摘要。" : "还没有中文解读时，先看来源摘要和原文。"}有译文的卡片标「仅摘译」。</p>
        {abstracts.length > 0 ? <ItemList items={abstracts} /> : <p className="rounded-card border border-dashed border-line p-8 text-center text-[13px] text-ink-3">{hasReadings ? "近 30 天的研究都已有解读，不再重复摘要。" : "近 30 天暂无研究或一手数据。"}<Link to="/all" className="ml-3 text-accent">查看全部资讯 →</Link></p>}
      </section>
    </div>
  );
}

import { pageReuse } from "@aihot/web/lib/page-reuse";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();
