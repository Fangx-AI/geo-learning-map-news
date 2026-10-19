CREATE TABLE IF NOT EXISTS geo_public_collector_runtime (
  id text PRIMARY KEY,
  state text NOT NULL,
  heartbeat_at timestamptz NOT NULL DEFAULT now(),
  last_started_at timestamptz,
  last_completed_at timestamptz,
  next_run_at timestamptz,
  interval_minutes integer NOT NULL DEFAULT 30,
  error text
);
