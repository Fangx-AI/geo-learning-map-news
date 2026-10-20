import { useState } from "react";
import { Link, useLoaderData } from "react-router";
import { pageMeta } from "@aihot/web/lib/seo";
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import { featuredLoader } from "./overview-pages.server.ts";
import { chooseReading, itemTasks, READING_TASKS } from "./reading-guide.ts";
import {
  useReadingState,
  toggleFollow,
  clearReading,
} from "./reading-state.ts";
import { ReadingCard } from "./reading-card.tsx";
export { headers } from "./overview-pages.server.ts";
export const loader = featuredLoader;
export const handle = { tab: "following", name: "我的关注" };
export const meta = () =>
  pageMeta({ title: "我的 GEO 关注", path: "/following", noindex: true });
export default function Following() {
  const { digest } = useLoaderData<typeof loader>();
  const state = useReadingState();
  const [error, setError] = useState("");
  const all = chooseReading(digest.research);
  const matches = all.filter((i) =>
    itemTasks(i).some((t) => state.follows.includes(t.id)),
  );
  const unread = matches.filter(
    (i) =>
      !state.visits.some(
        (v) => v.id === i.id && v.done && v.updatedAt === i.brief?.updatedAt,
      ),
  );
  const visits = state.visits.filter((v) => all.some((i) => i.id === v.id));
  return (
    <div className="mx-auto max-w-4xl pb-12">
      <PhoneBar title="我的关注" />
      <h1 data-page-title="" className="text-[30px] font-semibold text-ink">
        围绕你的问题，持续阅读
      </h1>
      <p className="mt-3 text-sm leading-7 text-ink-3">
        关注与阅读记录只保存在当前浏览器；打开页面时显示最新可读内容。
      </p>
      <div className="my-5 grid gap-2 sm:grid-cols-2">
        {READING_TASKS.map((t) => (
          <button
            key={t.id}
            aria-pressed={state.follows.includes(t.id)}
            onClick={() =>
              setError(
                toggleFollow(t.id) ? "" : "浏览器未能保存，请检查存储权限。",
              )
            }
            className={`min-h-12 rounded-control border px-4 py-3 text-left text-sm ${state.follows.includes(t.id) ? "border-accent bg-accent-soft text-accent" : "border-line text-ink-2"}`}
          >
            {state.follows.includes(t.id) ? "✓ " : "＋ "}
            {t.name}
          </button>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
      <h2 className="mt-7 text-xl font-semibold text-ink">
        关注中的未读解读{" "}
        <span className="text-sm text-ink-3">{unread.length}</span>
      </h2>
      {!state.follows.length ? (
        <p className="py-5 text-sm text-ink-3">先选择一个工作问题。</p>
      ) : !unread.length ? (
        <p className="py-5 text-sm text-ink-3">暂时没有新的未读解读。</p>
      ) : (
        <div className="divide-y divide-line">
          {unread.slice(0, 12).map((i) => (
            <ReadingCard key={i.id} item={i} />
          ))}
        </div>
      )}
      {unread.length > 12 && (
        <Link to="/library" className="text-sm text-accent">
          到解读库查看其余内容 →
        </Link>
      )}
      <section className="mt-8 border-t border-line pt-5">
        <h2 className="text-xl font-semibold text-ink">最近阅读</h2>
        {visits.slice(0, 10).map((v) => (
          <div key={v.id} className="border-b border-line py-4">
            <Link
              to={`/read/${v.id}?from=%2Ffollowing&resume=1`}
              className="text-sm leading-7 text-accent"
            >
              {v.title} →
            </Link>
            <p className="text-xs text-ink-3">
              {v.updatedAt !== all.find((i) => i.id === v.id)?.brief?.updatedAt
                ? "解读已更新"
                : v.done
                  ? "已读完"
                  : "继续阅读"}
            </p>
          </div>
        ))}
        {!visits.length && (
          <p className="py-4 text-sm text-ink-3">
            打开完整解读后，可以从这里继续。
          </p>
        )}
        <button
          onClick={() => setError(clearReading() ? "" : "浏览器未能清除记录。")}
          className="mt-4 min-h-11 text-xs text-ink-3"
        >
          清除关注和阅读记录
        </button>
      </section>
    </div>
  );
}

import { pageReuse } from "@aihot/web/lib/page-reuse";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();
