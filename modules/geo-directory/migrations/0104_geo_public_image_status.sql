ALTER TABLE geo_public_items ADD COLUMN IF NOT EXISTS image_status text NOT NULL DEFAULT 'pending';
