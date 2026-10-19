CREATE TABLE IF NOT EXISTS geo_public_reader_briefs (
  item_id text PRIMARY KEY REFERENCES geo_public_items(id) ON DELETE CASCADE,
  input_hash text NOT NULL CHECK (input_hash ~ '^[a-f0-9]{64}$'),
  body_hash text CHECK (body_hash ~ '^[a-f0-9]{64}$'),
  brief jsonb NOT NULL CHECK (jsonb_typeof(brief) = 'object'),
  evidence jsonb,
  provenance text NOT NULL CHECK (provenance IN ('reviewed', 'local-model')),
  model text,
  prompt_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
