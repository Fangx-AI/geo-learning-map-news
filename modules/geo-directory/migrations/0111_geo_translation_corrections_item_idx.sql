CREATE INDEX CONCURRENTLY IF NOT EXISTS geo_translation_corrections_item_idx ON geo_translation_corrections (item_id,status,reviewed_at DESC);
