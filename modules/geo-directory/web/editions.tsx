export const handle = { home: "featured" };
import { Link, useLoaderData } from "react-router";
import { loadOr404 } from "@aihot/web/lib/api.server";
import { pageMeta } from "@aihot/web/lib/seo";
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
export interface EditionCard { id: string; day: string; issue: number; title: string; importedAt: string }
export async function loader({ request }: { request: Request }) { return loadOr404<{ editions: EditionCard[] }>("/api/geo/editions", { signal: request.signal }); }
export function meta() { return pageMeta({ title: "整期日报", path: "/daily/editions" }); }
export default function Editions() {
  const { editions } = useLoaderData<typeof loader>();
  return <div className="mx-auto max-w-3xl pb-12">
    <PhoneBar title="整期日报" leading={<Link to="/" className="text-accent">← 今日重点</Link>} />
    <Link to="/" className="hidden min-h-11 items-center text-sm text-accent lg:inline-flex">← 返回今日重点</Link>
    <h1 className="mt-4 text-[32px] font-semibold tracking-tight text-ink">整期日报</h1>
    <p className="mt-3 text-sm leading-7 text-ink-2">完整阅读每日全球 GEO 情报，保留原始引用。</p>
    <div className="mt-8 divide-y divide-line">{editions.map(e => <article key={e.id} className="py-6"><time className="text-xs text-ink-3" dateTime={e.day}>{e.day}</time><h2 className="mt-2 text-xl font-semibold leading-relaxed"><Link className="text-ink hover:text-accent" to={`/daily/editions/${e.id}`}>{e.title}</Link></h2><Link className="mt-3 inline-flex min-h-11 items-center text-sm text-accent" to={`/daily/editions/${e.id}`}>阅读整期 →</Link></article>)}</div>
    {!editions.length && <p className="mt-8 text-ink-3">完整日报尚未同步。</p>}
  </div>;
}
