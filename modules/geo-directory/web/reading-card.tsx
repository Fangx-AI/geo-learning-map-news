import { Link, useLocation } from "react-router";
import { useState } from "react";
import { useTranslatedContent } from "@aihot/web/components/translation";
import { useContentLanguage } from "@aihot/web/lib/local-state";
import { cardImageUrl, dateLabel } from "./components.tsx";
import { readingNote } from "./reading-guide.ts";
import { geoReaderHref } from "./reader-links.ts";
import type { GeoDailyItem } from "../types.ts";
export function ReadingCard({ item }: { item: GeoDailyItem }) {
  const language = useContentLanguage();
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const image = cardImageUrl(item.imageUrl);
  const content = useTranslatedContent(item),
    location = useLocation(),
    note = readingNote(item),
    from = location.pathname + location.search;
  return (
    <article data-digest-item={item.id} className="py-5">
      <p className="text-xs leading-6 text-ink-3">
        <Link
          to={`/all?source=${encodeURIComponent(item.sourceId)}`}
          className="text-accent"
        >
          {item.sourceName}
        </Link>{" "}
        ·{" "}
        <time dateTime={item.publishedAt ?? undefined}>
          {dateLabel(item.publishedAt)}
        </time>
      </p>
      <div className="mt-2 flex items-start gap-4"><h3 className="min-w-0 flex-1 text-xl font-semibold leading-relaxed text-ink">
        <Link
          to={geoReaderHref(item.id, from)}
          state={{ geoReaderFrom: from }}
          className="hover:text-accent"
        >
          {content.title}
        </Link>
      </h3>{image && image !== failedImage && <img src={image} alt="" width={112} height={75} loading="lazy" onError={() => setFailedImage(image)} className="aspect-[3/2] w-20 shrink-0 rounded-control object-cover lg:w-28" />}</div>
      <p
        data-digest-conclusion=""
        className="mt-3 text-[15px] leading-7 text-ink-2"
      >
        {language === "zh" ? item.brief?.conclusion : content.summary}
      </p>
      {note.curated && <p className="mt-3 text-sm leading-7 text-ink-3">
        <span className="font-medium text-accent">为什么值得读：</span>
        {note.why}
      </p>}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <span className="text-ink-3">
          {note.task?.audience ?? "GEO 从业者"}
        </span>
        <Link
          to={geoReaderHref(item.id, from)}
          state={{ geoReaderFrom: from }}
          className="inline-flex min-h-11 items-center font-medium text-accent"
        >
          读解读 →
        </Link>
      </div>
    </article>
  );
}
