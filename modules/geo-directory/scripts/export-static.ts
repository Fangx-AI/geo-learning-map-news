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
const SKIP = [/^\/admin(\/|$)/, /^\/api\//, /^\/mcp(\/|$)/, /^\/items\/[^/]+\/original$/, /^\/feedback$/, /^\/starred$/];
// Query parameters that only change the back link, not the page.
const DROP_PARAMS = ["from"];
const SEEDS = ["/", "/all", "/library", "/hot", "/topics", "/daily", "/daily/archive", "/daily/editions", "/weekly", "/monthly", "/about", "/agent", "/changelog", "/terms", "/privacy", "/more", "/robots.txt", "/feed.xml", "/feed/all.xml", "/llms.txt", "/manifest.webmanifest"];

function normalize(raw: string, from: URL): URL | null {
  let url: URL;
  try { url = new URL(raw, from); } catch { return null; }
  if (url.origin !== base.origin || SKIP.some(pattern => pattern.test(url.pathname))) return null;
  for (const name of DROP_PARAMS) url.searchParams.delete(name);
  url.searchParams.sort();
  url.hash = "";
  return url;
}

const isFile = (url: URL) => /\.[a-z0-9]+$/i.test(url.pathname);
// Pages become <path>/index.html; a query string becomes a hashed subdirectory of its page.
function localPath(url: URL): string {
  if (isFile(url)) return url.pathname.slice(1);
  const dir = url.pathname.replace(/^\/|\/$/g, "");
  const query = url.search ? `_q/${createHash("sha1").update(url.search).digest("hex").slice(0, 12)}` : "";
  return [dir, query, "index.html"].filter(Boolean).join("/");
}
const publicPath = (url: URL) => prefix + localPath(url).replace(/index\.html$/, "");

const seen = new Set<string>();
const queue: URL[] = [];
let pages = 0;
function visit(url: URL) {
  if (seen.has(url.href) || (!isFile(url) && pages >= maxPages)) return;
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
async function save(url: URL) {
  const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(60_000) });
  const target = path.join(out, localPath(url));
  if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
    const location = rewrite(response.headers.get("location")!, url);
    if (isFile(url)) return;
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=${location}"><link rel="canonical" href="${location}">`);
    return;
  }
  if (!response.ok) { failures.push(`${response.status} ${url.pathname}${url.search}`); return; }
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
console.log(JSON.stringify({ pages, files: seen.size - pages, failures: failures.length, out }));
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
