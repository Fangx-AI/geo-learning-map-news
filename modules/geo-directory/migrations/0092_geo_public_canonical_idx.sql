CREATE INDEX CONCURRENTLY IF NOT EXISTS geo_public_items_canonical_idx ON geo_public_items (canonical_id, collected_at, id DESC);
