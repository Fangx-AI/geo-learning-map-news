CREATE TABLE IF NOT EXISTS geo_public_source_status (
  source_id text PRIMARY KEY,
  source_name text NOT NULL,
  source_url text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'never',
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  fetched_count integer NOT NULL DEFAULT 0,
  matched_count integer NOT NULL DEFAULT 0,
  error text,
  cursor jsonb NOT NULL DEFAULT '{}'
);
