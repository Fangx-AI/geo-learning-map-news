// The static export (modules/geo-directory/scripts/export-static.ts) sends this header.
// Pages then render a read-only snapshot: controls that need a server or page script are omitted.
import { useRouteLoaderData } from "react-router";

export const STATIC_SNAPSHOT_HEADER = "x-geo-static";

export function isStaticSnapshotRequest(request: Request): boolean {
  return request.headers.get(STATIC_SNAPSHOT_HEADER) === "1";
}

/** A deployed origin readers can call. Localhost is a dev server, not a public API. */
export function isPublicSiteUrl(value: string | undefined | null): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1" || host.endsWith(".local")) return false;
    return true;
  } catch {
    return false;
  }
}

type RootFlags = { staticSnapshot?: boolean; showAgentNav?: boolean };

export function useStaticSnapshot(): boolean {
  const data = useRouteLoaderData("root") as RootFlags | undefined;
  return data?.staticSnapshot === true;
}

/** Agent stays out of the reader sidebar unless this deployment has a public API origin. */
export function useShowAgentNav(): boolean {
  const data = useRouteLoaderData("root") as RootFlags | undefined;
  return data?.showAgentNav === true;
}
