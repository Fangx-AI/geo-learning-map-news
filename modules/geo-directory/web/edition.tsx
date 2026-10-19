import { Link, useLoaderData } from "react-router";
import { loadOr404 } from "@aihot/web/lib/api.server";
import { pageMeta } from "@aihot/web/lib/seo";
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import "./edition.css";
interface Edition { id: string; day: string; title: string; html: string; outline: { id: string; title: string }[]; verified: { id: string; title: string }[] }
export async function loader({ request, params }: { request: Request; params: { id?: string } }) {
  if (!params.id || !/^\d{4}-\d{2}-\d{2}$/.test(params.id)) throw new Response("日报不存在", { status: 404 });
  return loadOr404<{ edition: Edition }>(`/api/geo/editions/${params.id}`, { signal: request.signal });
}
export function meta({ loaderData }: { loaderData?: { edition: Edition } }) { return pageMeta({ title: loaderData?.edition.title ?? "整期日报", path: `/daily/editions/${loaderData?.edition.id ?? ""}` }); }
export default function EditionPage() {
  const { edition: e } = useLoaderData<typeof loader>();
  return <div className="mx-auto max-w-5xl pb-16">
    <PhoneBar title="整期日报" leading={<Link to="/daily/editions" className="text-accent">← 往期</Link>} />
    <Link to="/daily/editions" className="hidden min-h-11 items-center text-sm text-accent lg:inline-flex">← 全部整期日报</Link>
    <header className="mt-4 max-w-3xl border-b border-line pb-7"><p className="text-xs font-medium text-accent">全球视野 · 每日情报</p><h1 className="mt-3 text-[28px] font-semibold leading-relaxed tracking-tight text-ink lg:text-[34px]">{e.title}</h1><p className="mt-3 text-xs leading-6 text-ink-3"><time dateTime={e.day}>{e.day}</time> · 完整报告 · 报告观点与已核验解读分别保留</p></header>
    <details className="edition-mobile-toc mt-5 border-b border-line pb-3"><summary className="cursor-pointer py-2 text-sm font-semibold text-ink">本期目录 · {e.outline.length} 个章节</summary><nav aria-label="本期目录" className="mt-2">{e.outline.map(h => <a key={h.id} href={`#${h.id}`} className="block py-2 text-sm leading-6 text-accent">{h.title}</a>)}</nav></details>
    <div className="edition-layout mt-7">
      <aside className="edition-toc"><details open><summary className="cursor-pointer py-2 text-sm font-semibold text-ink">本期目录</summary><nav aria-label="本期目录" className="mt-2 space-y-1">{e.outline.map(h => <a key={h.id} href={`#${h.id}`} className="block py-2 text-[13px] leading-6 text-ink-2 hover:text-accent">{h.title}</a>)}</nav></details></aside>
      <div className="min-w-0">
        {e.verified.length > 0 && <details className="mb-7 rounded-control border border-line px-4 py-3"><summary className="cursor-pointer text-sm font-medium text-accent">已核对原文的重点解读 · {e.verified.length} 篇</summary><ul className="mt-3 space-y-3 text-sm leading-7">{e.verified.map(v => <li key={v.id}><Link to={`/read/${v.id}?from=${encodeURIComponent(`/daily/editions/${e.id}`)}`} className="text-accent hover:underline">{v.title} →</Link></li>)}</ul></details>}
        <article className="edition-body" dangerouslySetInnerHTML={{ __html: e.html }} />
        <footer className="mt-12 border-t border-line pt-5"><Link to="/daily/editions" className="inline-flex min-h-11 items-center text-sm text-accent">← 阅读其他日报</Link></footer>
      </div>
    </div>
  </div>;
}
