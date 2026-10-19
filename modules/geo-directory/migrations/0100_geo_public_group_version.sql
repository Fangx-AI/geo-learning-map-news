ALTER TABLE geo_public_items ADD COLUMN IF NOT EXISTS group_version integer NOT NULL DEFAULT 0;
