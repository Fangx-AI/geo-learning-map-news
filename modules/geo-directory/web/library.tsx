import { ContentLanguageToggle } from "@aihot/web/components/translation";
import { Form, Link, useLoaderData, useSearchParams } from "react-router";
import { pageMeta } from "@aihot/web/lib/seo";
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import { libraryLoader } from "./overview-pages.server.ts";
import { chooseReading, itemTasks, READING_TASKS } from "./reading-guide.ts";
import { ReadingCard } from "./reading-card.tsx";
export { headers } from "./overview-pages.server.ts";
export const loader = libraryLoader;
export const handle = { tab: "library", name: "深度解读" };
export const meta = () =>
  pageMeta({ title: "GEO 深度解读", path: "/library" });
export default function Library() {
  const { digest } = useLoaderData<typeof loader>();
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
  return (
    <div className="mx-auto max-w-4xl pb-12">
      <PhoneBar title="深度解读" />
      <div className="mb-3 flex justify-end">
        <ContentLanguageToggle />
      </div>
      <h1 data-page-title="" className="text-[30px] font-semibold text-ink">
        深度解读
      </h1>
      <p className="mt-3 text-sm leading-7 text-ink-3">
        重要研究和实测的中文解读：结论、关键数据、对 GEO 的启示。
      </p>
      <Form method="get" action="/library" className="mt-5 space-y-3">
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
      </Form>
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
      <Link
        to="/following"
        className="mt-6 inline-flex min-h-11 items-center text-sm text-accent"
      >
        关注这些问题，接着读 →
      </Link>
    </div>
  );
}

import { pageReuse } from "@aihot/web/lib/page-reuse";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();
