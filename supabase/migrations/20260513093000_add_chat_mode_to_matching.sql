ALTER TABLE waiting_pool
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'chat'
  CHECK (mode IN ('chat', 'video'));

ALTER TABLE active_chats
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'chat'
  CHECK (mode IN ('chat', 'video'));

CREATE INDEX IF NOT EXISTS idx_waiting_pool_mode_created
  ON waiting_pool(mode, created_at);
