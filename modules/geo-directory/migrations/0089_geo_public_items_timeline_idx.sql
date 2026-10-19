CREATE INDEX CONCURRENTLY IF NOT EXISTS geo_public_items_timeline_idx ON geo_public_items ((coalesce(published_at, collected_at)) DESC, id DESC);
