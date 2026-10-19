export { default, meta, handle } from "../../../../modules/geo-directory/web/topic.tsx";
export { topicLoader as loader, headers } from "../../../../modules/geo-directory/web/overview-pages.server.ts";
import { pageReuse } from "../lib/page-reuse";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof import("../../../../modules/geo-directory/web/overview-pages.server.ts").topicLoader>();
