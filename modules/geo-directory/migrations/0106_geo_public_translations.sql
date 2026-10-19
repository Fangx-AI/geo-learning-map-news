CREATE TABLE IF NOT EXISTS geo_public_translations (
  item_id text PRIMARY KEY REFERENCES geo_public_items(id) ON DELETE CASCADE,
  content_hash text NOT NULL,
  title_original text NOT NULL,
  summary_original text,
  language_original text NOT NULL,
  title_zh text,
  summary_zh text,
  status text NOT NULL CHECK (status IN ('done', 'error')),
  provider text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
