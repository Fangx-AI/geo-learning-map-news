// arXiv's legacy APIs share a single-connection, one-request-per-three-seconds limit.
// https://info.arxiv.org/help/api/tou.html
import { addAbortListener } from "node:events";
import { setTimeout } from "node:timers/promises";

const INTERVAL_MS = 3_000;
type Release = () => void;
interface RequestClock {
  now(): number;
  wait(ms: number, signal: AbortSignal): Promise<void>;
}

export function createArxivRequestGate(clock: RequestClock = {
  now: () => performance.now(),
  wait: (ms: number, signal: AbortSignal) => setTimeout(ms, undefined, { signal }),
}) {
  let queue: Promise<void> = Promise.resolve();
  let nextStart = 0;
  return async (url: URL, signal: AbortSignal): Promise<Release> => {
    signal.throwIfAborted();
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (host !== "arxiv.org" && !host.endsWith(".arxiv.org")) return () => {};

    const previous = queue;
    let release!: Release;
    const completed = new Promise<void>((resolve) => { release = resolve; });
    // A cancelled waiter cannot let later requests overtake a still-active connection.
    queue = previous.then(() => completed);
    let subscription: ReturnType<typeof addAbortListener> | undefined;
    try {
      await Promise.race([previous, new Promise<never>((_resolve, reject) => {
        subscription = addAbortListener(signal, () => reject(signal.reason));
      })]);
      while (clock.now() < nextStart) await clock.wait(nextStart - clock.now(), signal);
      signal.throwIfAborted();
      nextStart = clock.now() + INTERVAL_MS;
      return release;
    } catch (error) {
      release();
      throw error;
    } finally {
      subscription?.[Symbol.dispose]();
    }
  };
}

export const acquireArxivRequest = createArxivRequestGate();
