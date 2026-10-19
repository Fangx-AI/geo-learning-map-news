CREATE INDEX CONCURRENTLY IF NOT EXISTS geo_public_translation_hash_idx ON geo_public_translations(content_hash) WHERE status = 'done';
