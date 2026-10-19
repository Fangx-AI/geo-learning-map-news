CREATE TABLE IF NOT EXISTS geo_public_items (
  id text PRIMARY KEY,
  title text NOT NULL,
  url text NOT NULL,
  summary text,
  source_id text NOT NULL,
  source_name text NOT NULL,
  source_url text NOT NULL,
  language text NOT NULL DEFAULT 'und',
  published_at timestamptz,
  collected_at timestamptz NOT NULL DEFAULT now(),
  matched_terms text[] NOT NULL DEFAULT '{}'
);
