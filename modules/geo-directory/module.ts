import { defineModule } from "@aihot/contracts/modules";

export default defineModule({
  name: "geo-directory",
  apiPaths: [/^\/api\/geo\/(?:editions(?:\/[^/]+)?|public-items(?:\/[^/]+)?|collection-status|overview|translation-status|translations|translation-corrections)$/],
  pages: [{ path: "atlas", file: "web/sources.tsx" }, { path: "stream", file: "web/stream.tsx" }, { path: "read/:id", file: "web/reader.tsx" }, { path: "daily/editions", file: "web/editions.tsx" }, { path: "daily/editions/:id", file: "web/edition.tsx" }],
  adminPages: [{ path: "admin/geo-corrections", file: "web/admin-corrections.tsx" }],
});
