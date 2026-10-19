CREATE TABLE IF NOT EXISTS geo_public_social_articles (
  source_id text NOT NULL,
  discovery_url text NOT NULL,
  url text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  error text,
  PRIMARY KEY (source_id, discovery_url, url)
);
