CREATE TABLE IF NOT EXISTS geo_public_translation_runtime (
  provider text PRIMARY KEY,
  retry_after timestamptz NOT NULL,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
