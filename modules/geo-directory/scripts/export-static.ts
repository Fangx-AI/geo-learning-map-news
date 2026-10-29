// Read-only snapshot of a running site for static hosting such as GitHub Pages. Pages are crawled
// from the sitemap and their links, scripts are removed so links are plain page loads, and
// same-origin URLs are rewritten under --prefix. Search, feedback, starred and admin need the server.
//   node modules/geo-directory/scripts/export-static.ts --out .data/static \
//     --prefix /geo-learning-map-news/ --site https://fangx-ai.github.io/geo-learning-map-news/ [--push]
// --push replaces the gh-pages branch of this checkout's origin with the snapshot, as one commit.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import * as cheerio from "cheerio";

const arg = (name: string, fallback: string) => {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 ? process.argv[at + 1]! : fallback;
};
const base = new URL(arg("base", "http://localhost:3000"));
const out = path.resolve(arg("out", ".data/static"));
const prefix = arg("prefix", "/").replace(/\/?$/, "/");
const site = arg("site", "").replace(/\/?$/, "/");
const maxPages = Number(arg("max", "5000"));

// Paths that only work with the server behind them.
const SKIP = [/^\/admin(\/|$)/, /^\/api\/(?!img-proxy$)/, /^\/mcp(\/|$)/, /^\/items\/[^/]+\/original$/, /^\/feedback$/, /^\/starred$/];
// Query parameters that only change the back link, not the page.
const DROP_PARAMS = ["from"];
const SEEDS = ["/", "/all", "/library", "/hot", "/topics", "/daily", "/daily/archive", "/daily/editions", "/weekly", "/monthly", "/about", "/agent", "/changelog", "/terms", "/privacy", "/more", "/robots.txt", "/sitemap.xml", "/feed.xml", "/feed/all.xml", "/llms.txt", "/manifest.webmanifest"];

function normalize(raw: string, from: URL): URL | null {
  let url: URL;
  try { url = new URL(raw, from); } catch { return null; }
  if (url.origin !== base.origin || SKIP.some(pattern => pattern.test(url.pathname))) return null;
  for (const name of DROP_PARAMS) url.searchParams.delete(name);
  url.searchParams.sort();
  url.hash = "";
  return url;
}

// Proxied images are saved as img/<hash> with the original image's extension, so Pages serves an image type.
const isImage = (url: URL) => url.pathname === "/api/img-proxy";
const isFile = (url: URL) => isImage(url) || /\.[a-z0-9]+$/i.test(url.pathname);
const hashed = (text: string) => createHash("sha1").update(text).digest("hex");
function localPath(url: URL): string {
  if (isImage(url)) {
    const extension = /\.(jpe?g|png|webp|gif|avif|svg)$/i.exec(new URL(url.searchParams.get("u") ?? "", base).pathname)?.[0] ?? ".jpg";
    return `img/${hashed(url.search).slice(0, 16)}${extension.toLowerCase()}`;
  }
  if (isFile(url)) return url.pathname.slice(1);
  // Pages become <path>/index.html; a query string becomes a hashed subdirectory of its page.
  const dir = url.pathname.replace(/^\/|\/$/g, "");
  const query = url.search ? `_q/${hashed(url.search).slice(0, 12)}` : "";
  return [dir, query, "index.html"].filter(Boolean).join("/");
}
const publicPath = (url: URL) => prefix + localPath(url).replace(/index\.html$/, "");

const seen = new Set<string>();
const queue: URL[] = [];
let pages = 0;
const overLimit = new Set<string>();
function visit(url: URL) {
  if (seen.has(url.href)) return;
  if (!isFile(url) && pages >= maxPages) { overLimit.add(url.href); return; }
  seen.add(url.href);
  if (!isFile(url)) pages++;
  queue.push(url);
}

// Rewrites one same-origin URL to its snapshot location and queues it; other URLs are left alone.
function rewrite(raw: string, from: URL): string {
  const url = normalize(raw, from);
  if (!url) return raw.startsWith(base.origin) ? raw.replace(base.origin, site ? site.replace(/\/$/, "") : "") : raw;
  const hash = new URL(raw, from).hash;
  visit(url);
  return publicPath(url) + hash;
}

function snapshotHtml(html: string, from: URL): string {
  const $ = cheerio.load(html);
  $("script").filter((_, element) => {
    const script = $(element);
    return Boolean(script.attr("src")) || script.attr("type") === "module" || /reactRouter|history\./.test(script.text());
  }).remove();
  $('link[rel="modulepreload"]').remove();
  $("form, [role=\"radiogroup\"]").remove();
  // Buttons need the page script; drop them and any group they leave empty.
  $('button[type="button"]').each((_, element) => {
    const parent = $(element).parent();
    $(element).remove();
    if (!parent.children().length && !parent.text().trim()) parent.remove();
  });
  $("a[href]").filter((_, element) => {
    try { const url = new URL($(element).attr("href")!, from); return url.origin === base.origin && SKIP.some(pattern => pattern.test(url.pathname)); }
    catch { return false; }
  }).remove();
  $("[href]").each((_, element) => { const node = $(element); node.attr("href", rewrite(node.attr("href")!, from)); });
  $("[src]").each((_, element) => { const node = $(element); node.attr("src", rewrite(node.attr("src")!, from)); });
  $("[srcset]").each((_, element) => {
    const node = $(element);
    node.attr("srcset", node.attr("srcset")!.split(",").map(part => {
      const [src, ...size] = part.trim().split(/\s+/);
      return [rewrite(src!, from), ...size].join(" ");
    }).join(", "));
  });
  $('meta[content^="http"]').each((_, element) => { const node = $(element); node.attr("content", rewrite(node.attr("content")!, from)); });
  return $.html();
}

const snapshotCss = (css: string, from: URL) =>
  css.replace(/url\((['"]?)([^'")]+)\1\)/g, (match, quote: string, src: string) => src.startsWith("data:") ? match : `url(${quote}${rewrite(src, from)}${quote})`);

const failures: string[] = [];
// An image whose source is gone shows as missing, as it does on the live site; it does not stop the export.
const imageFailures: string[] = [];
async function save(url: URL) {
  let response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(60_000) });
  // The image proxy answers 503 while its preparation budget is full.
  for (let attempt = 1; response.status === 503 && attempt <= 3; attempt++) {
    await delay(attempt * 5_000);
    response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(60_000) });
  }
  const target = path.join(out, localPath(url));
  if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
    const location = rewrite(response.headers.get("location")!, url);
    if (isFile(url)) return;
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=${location}"><link rel="canonical" href="${location}">`);
    return;
  }
  if (!response.ok) { (isImage(url) ? imageFailures : failures).push(`${response.status} ${url.pathname}${url.search}`); return; }
  const type = response.headers.get("content-type") ?? "";
  let body: string | Uint8Array;
  if (type.includes("text/html")) body = snapshotHtml(await response.text(), url);
  else if (type.includes("text/css")) body = snapshotCss(await response.text(), url);
  else if (/xml|text\/plain|json/.test(type)) body = (await response.text()).replaceAll(base.origin + "/", site || prefix);
  else body = new Uint8Array(await response.arrayBuffer());
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, body);
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
const sitemap = await (await fetch(new URL("/sitemap.xml", base))).text();
for (const loc of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) { const url = normalize(loc[1]!, base); if (url) visit(url); }
for (const seed of SEEDS) { const url = normalize(seed, base); if (url) visit(url); }

// Each round saves what the previous round found.
while (queue.length) {
  const round = queue.splice(0);
  await Promise.all(Array.from({ length: 6 }, async () => {
    for (let url = round.shift(); url; url = round.shift()) {
      try { await save(url); } catch (error) { failures.push(`${(error as Error).message} ${url.pathname}${url.search}`); }
    }
  }));
}

const missing = await fetch(new URL("/__static-export-missing__", base));
await writeFile(path.join(out, "404.html"), snapshotHtml(await missing.text(), base));
await writeFile(path.join(out, ".nojekyll"), "");
// Links to pages past --max would 404, so an export that hit the limit is not published.
if (overLimit.size) failures.push(`${overLimit.size} pages over --max ${maxPages}`);
console.log(JSON.stringify({ pages, files: seen.size - pages, failures: failures.length, imageFailures: imageFailures.length, out }));
for (const failure of imageFailures.slice(0, 5)) console.error(`image ${failure}`);
for (const failure of failures.slice(0, 20)) console.error(failure);
if (failures.length) process.exitCode = 1;
else if (process.argv.includes("--push")) {
  const remote = execFileSync("git", ["remote", "get-url", "origin"], { encoding: "utf8" }).trim();
  const git = (...args: string[]) => execFileSync("git", args, { cwd: out, stdio: "inherit" });
  git("init", "-q", "-b", "gh-pages");
  git("add", "-A");
  git("-c", "user.name=static-export", "-c", "user.email=static-export@localhost", "commit", "-q", "-m", `Snapshot ${new Date().toISOString()}`);
  git("push", "-q", "--force", remote, "gh-pages");
}
