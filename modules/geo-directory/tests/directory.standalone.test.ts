import assert from "node:assert/strict";
import test from "node:test";
import { sources, filterSources, sourcesOpml, collectionLabel, type GeoSource } from "../data.ts";
import publicSources from "../../../industry/sources.json" with { type: "json" };
import socialSources from "../../../industry/public-social.json" with { type: "json" };
import { assertSupportedConfig } from "@aihot/backend/sources/config-keys";
import type { SourceRow } from "@aihot/backend/sources/types";

test("directory entries have unique identities, public URLs and source attribution", () => {
  const ids = new Set<string>();
  const configuredIds = new Set([...publicSources.sources, ...socialSources.sources].map(source => source.id));
  assert.ok(sources.length >= 35);
  for (const source of sources) {
    assert.ok(!ids.has(source.id), `duplicate source: ${source.id}`);
    ids.add(source.id);
    for (const url of [source.url, source.feedUrl].filter(Boolean)) {
      const parsed = new URL(url!);
      assert.equal(parsed.protocol, "https:", source.id);
      assert.equal(parsed.username + parsed.password, "", source.id);
    }
    assert.ok(source.name && source.description && source.evidence && source.language && source.region, source.id);
    assert.ok(source.topics.length > 0, source.id);
    if (source.sourceId && source.collectionStatus !== "requires_api") assert.ok(configuredIds.has(source.sourceId), `missing collector: ${source.sourceId}`);
    assert.match(source.checkedAt, /^\d{4}-\d{2}-\d{2}$/);
  }
  for (const source of publicSources.sources) assertSupportedConfig(source.kind as SourceRow["kind"], source.config);
});

test("filters combine keyword, language, region and source type", () => {
  const sample = sources[0];
  const params = new URLSearchParams({ q: sample.name.toUpperCase(), language: sample.language, region: sample.region, type: sample.type });
  assert.ok(filterSources(sources, params).some((entry) => entry.id === sample.id));
  params.set("q", "no-source-with-this-long-unique-name-12345");
  assert.equal(filterSources(sources, params).length, 0);
  assert.equal(filterSources(sources, new URLSearchParams()).length, sources.length);
});

test("RSS filter and export do not pretend website-only sources are feeds", () => {
  const result = filterSources(sources, new URLSearchParams("access=rss"));
  assert.ok(result.length > 0);
  assert.ok(result.every((entry) => entry.feedUrl));
  assert.equal((sourcesOpml(result).match(/<outline /g) ?? []).length, new Set(result.map((entry) => entry.feedUrl)).size);
});

test("OPML escapes untrusted text and URLs and deduplicates feeds", () => {
  const sample: GeoSource = { ...sources[0], name: 'A & B <C> "quoted"', feedUrl: "https://example.com/feed?q=a&lang=en" };
  const opml = sourcesOpml([sample, sample]);
  assert.match(opml, /A &amp; B &lt;C&gt; &quot;quoted&quot;/);
  assert.match(opml, /q=a&amp;lang=en/);
  assert.equal((opml.match(/<outline /g) ?? []).length, 1);
});

test("configured connectors requiring credentials are not shown as ready subscriptions", () => {
  const pending: GeoSource = { ...sources[0], sourceId: "x-geo", collectionStatus: "requires_api" };
  assert.equal(filterSources([pending], new URLSearchParams("access=configured")).length, 0);
  assert.equal(collectionLabel(pending), "需配置 API");
});
