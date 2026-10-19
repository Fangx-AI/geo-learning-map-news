import { createHash } from "node:crypto";
import { createServer, createConnection } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { unlink } from "node:fs/promises";

export function watchProcessScope(root: string, databaseUrl: string): string {
  const url = new URL(databaseUrl);
  // A scope contains no database password, username or query parameters.
  return `watch:${path.resolve(root).toLowerCase()}:${url.hostname}:${url.port}:${url.pathname}`;
}

function endpoint(scope: string): string {
  const id = createHash("sha256").update(scope).digest("hex").slice(0, 24);
  return process.platform === "win32" ? `\\\\.\\pipe\\geo-local-${id}` : path.join(tmpdir(), `geo-local-${id}.sock`);
}

export async function localProcessRunning(scope: string): Promise<boolean> {
  return new Promise(resolve => {
    const socket = createConnection(endpoint(scope));
    const finish = (running: boolean) => { socket.destroy(); resolve(running); };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(500, () => finish(false));
  });
}

/** OS-owned endpoint: Windows removes the lock even after an abrupt process exit. */
export async function acquireLocalProcessLock(scope: string): Promise<null | (() => Promise<void>)> {
  const address = endpoint(scope);
  const server = createServer(socket => { socket.on("error", () => {}); socket.end(); });
  const listen = () => new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => { server.off("listening", onListen); reject(error); };
    const onListen = () => { server.off("error", onError); resolve(); };
    server.once("error", onError); server.once("listening", onListen); server.listen(address);
  });
  try { await listen(); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") throw error;
    if (process.platform === "win32" || await localProcessRunning(scope)) return null;
    // Unix can leave this exact generated socket path after a crash; never remove a directory.
    await unlink(address).catch(() => {});
    try { await listen(); } catch (retry) { if ((retry as NodeJS.ErrnoException).code === "EADDRINUSE") return null; throw retry; }
  }
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  };
}
