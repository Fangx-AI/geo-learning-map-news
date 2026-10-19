import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider, useLoaderData, Outlet, ScrollRestoration } from "react-router";
import type { TimelineResponse, SiteItemDetail } from "@aihot/contracts/site";
import { Timeline } from "../../app/features/feed/Timeline";
import { useHydratedFlag } from "../../app/lib/hydration";
import { openSearch, SearchOverlay } from "../../app/features/search/SearchOverlay";

function Layout() { useHydratedFlag(); return <><main className="mx-auto max-w-3xl px-5"><button type="button" aria-label="搜索" onClick={event => openSearch("", event.currentTarget)}>搜索</button><Outlet /><ScrollRestoration /></main><SearchOverlay /></>; }
function List() {
  const initial = useLoaderData() as TimelineResponse;
  return <Timeline initial={initial} filters={initial.filters} />;
}
function Detail() {
  const item = useLoaderData() as SiteItemDetail;
  return <article><h1>{item.title}</h1><p>固定正文</p></article>;
}
const router = createBrowserRouter([{ element: <Layout />, children: [
  { path: "/", loader: ({ request }) => fetch(`/api/site/timeline${new URL(request.url).search}`).then(r => r.json()), element: <List /> },
  { path: "/items/:id", loader: ({ params }) => fetch(`/api/site/items/${params.id}`).then(r => r.json()), element: <Detail /> },
] }]);
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
