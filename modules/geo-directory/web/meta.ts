/** Public filters change page content; keep their canonical address but avoid indexing every combination. */
export function publicFeedAddress(path: "/all" | "/stream", search = "") {
  const input = new URLSearchParams(search);
  const filters = new URLSearchParams();
  for (const key of ["q", "source", "language", "platform", "kind", "period", "quality", "sort", "group", "groupKey", "cursor"]) {
    const value = input.get(key)?.trim();
    if (value) filters.set(key, value);
  }
  return { path: filters.size ? `${path}?${filters}` : path, noindex: filters.size > 0 };
}

export function dailyAddress(location: { pathname: string; search?: string }) {
  const params = new URLSearchParams(location.search);
  if (location.pathname === "/daily" && !params.has("day") && params.get("view") === "library") {
    return { path: "/daily?view=library", title: "中文解读：GEO 研究、实测与平台变化", noindex: true };
  }
  const key = /^\/daily\/(\d{4}-\d{2}-\d{2})$/.exec(location.pathname)?.[1] ?? new URLSearchParams(location.search).get("day");
  const valid = key && /^\d{4}-\d{2}-\d{2}$/.test(key) && Number.isFinite(Date.parse(key)) && new Date(key).toISOString().slice(0, 10) === key;
  return valid ? { path: `/daily/${key}`, title: `${key} GEO 日报：每日公开资料汇编` }
    : { path: location.pathname, title: location.pathname === "/daily/archive" ? "GEO 日报归档" : "GEO 日报：24 小时重点与研究解读" };
}
