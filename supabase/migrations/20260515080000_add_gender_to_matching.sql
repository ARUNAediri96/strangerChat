ALTER TABLE waiting_pool
  ADD COLUMN IF NOT EXISTS gender text NOT NULL DEFAULT 'male'
  CHECK (gender IN ('male', 'female'));

CREATE INDEX IF NOT EXISTS idx_waiting_pool_mode_gender_created
  ON waiting_pool(mode, gender, created_at);
