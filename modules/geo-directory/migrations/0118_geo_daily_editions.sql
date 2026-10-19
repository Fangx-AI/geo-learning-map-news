CREATE TABLE IF NOT EXISTS geo_daily_editions (
  id text PRIMARY KEY,
  source_message_id text NOT NULL UNIQUE,
  day date NOT NULL,
  issue integer NOT NULL CHECK (issue > 0),
  title text NOT NULL,
  markdown text NOT NULL,
  content_hash text NOT NULL,
  source_url text NOT NULL,
  source_links jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(day, issue)
);
