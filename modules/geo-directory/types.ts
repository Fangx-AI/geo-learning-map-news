import type { GeoPublicItem } from "@aihot/backend/publication/geo-public";

export interface GeoDailyItem extends GeoPublicItem { briefAddedAt: string | null }
export interface GeoDailyDigest {
  latestEdition?: { id: string; day: string; title: string } | null;
  view?: "daily" | "library";
  generatedAt: string; day: string; since: string;
  recent: GeoDailyItem[]; research: GeoDailyItem[];
  recentTotal: number; researchTotal: number; candidatesTruncated: boolean;
}

export interface GeoOverviewItem extends GeoPublicItem {
  categoryKeys: string[]; topicSlugs: string[]; selectionReasons: string[]; dateBasis: "published" | "collected";
}
export interface GeoOverviewTopic { slug: string; name: string; group: string; description: string; count: number; items: GeoOverviewItem[] }
export interface GeoOverviewResponse {
  generatedAt: string; lastCollectedAt: string | null;
  stats: { total: number; analyzedItems: number; sourceCount: number; topicCount: number; undatedCount: number; truncated: boolean };
  window: { kind: "48h" | "7d" | "recent"; label: string; from: string | null; to: string; basis: "collectedAt" | "publishedAt"; itemCount: number };
  rules: { classification: string; highlights: string; hotClusters: string; daily: string };
  highlights: GeoOverviewItem[];
  collections: Array<{ key: string; name: string; count: number; items: GeoOverviewItem[] }>;
  topics: GeoOverviewTopic[];
  selectedTopic: GeoOverviewTopic | null;
  hotClusters: Array<{ id: string; title: string; topicSlug: string; itemCount: number; sourceCount: number; sourceDomains: string[]; items: GeoOverviewItem[] }>;
  days: Array<{ day: string; count: number; publishedCount: number; collectedOnlyCount: number }>;
  selectedDay: string | null; dailyTotal: number; dailyItems: GeoOverviewItem[];
}
