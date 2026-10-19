CREATE TABLE IF NOT EXISTS geo_translation_corrections (
  id bigserial PRIMARY KEY,
  item_id text NOT NULL REFERENCES geo_public_items(id) ON DELETE CASCADE,
  title_original text NOT NULL,
  summary_original text,
  language_original text NOT NULL,
  title_zh text NOT NULL,
  summary_zh text,
  note text,
  source_hash text NOT NULL,
  fingerprint text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','rejected','superseded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by text,
  review_note text,
  UNIQUE (source_hash,fingerprint)
);
