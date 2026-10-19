// The former model-selected Timeline remains a reusable component, but is no longer the GEO home.
// Exercise it in a real browser/data router without pretending the production route still uses it.
import { once } from "node:events";
import type { Server, IncomingMessage, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import type { WebServer } from "./web-server.ts";

export async function startTimelineHarness(api: Server): Promise<WebServer> {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const assets = new URL("../build/client/assets/", import.meta.url);
  const cssName = (await readdir(assets)).find(name => name.startsWith("root-") && name.endsWith(".css"));
  if (!cssName) throw new Error("Build the web app before running browser tests");
  const css = await readFile(new URL(cssName, assets));
  const bundled = await build({ configFile: false, root, logLevel: "error", define: { "process.env.NODE_ENV": '"production"' },
    resolve: { alias: { "@aihot/web": fileURLToPath(new URL("../app", import.meta.url)) } },
    build: { write: false, minify: false, lib: { entry: fileURLToPath(new URL("./fixtures/timeline-harness.tsx", import.meta.url)), name: "TimelineHarness", formats: ["iife"] } },
  });
  const output = (Array.isArray(bundled) ? bundled[0] : bundled) as { output: Array<{ type: string; code?: string }> };
  const code = output.output.find(chunk => chunk.type === "chunk")?.code;
  if (!code) throw new Error("Timeline test bundle was empty");
  const original = api.listeners("request") as Array<(req: IncomingMessage, res: ServerResponse) => void>;
  api.removeAllListeners("request");
  api.on("request", (req, res) => {
    const path = new URL(req.url!, "http://local").pathname;
    if (path.startsWith("/api/")) { for (const listener of original) listener(req, res); return; }
    if (path === "/__style.css") { res.setHeader("Content-Type", "text/css"); res.end(css); return; }
    if (path === "/" || /^\/items\/[^/]+$/.test(path)) {
      res.setHeader("Content-Type", "text/html");
      res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/__style.css"></head><body><div id="root"></div><script src="/__fixture.js"></script></body></html>');
      return;
    }
    if (path === "/__fixture.js") { res.setHeader("Content-Type", "text/javascript; charset=utf-8"); res.end(code); return; }
    res.statusCode = 404; res.end();
  });
  api.listen(0, "127.0.0.1");
  await once(api, "listening");
  const port = (api.address() as AddressInfo).port;
  return { port, origin: `http://127.0.0.1:${port}`, logs: () => "", stop: async () => {
    api.closeAllConnections(); await new Promise<void>(resolve => api.close(() => resolve()));
  } };
}
