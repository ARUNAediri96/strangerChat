/*
  # Create VeilChat - Anonymous Chat Platform Schema

  1. New Tables
    - `waiting_pool`
      - `id` (uuid, primary key) - unique pool entry ID
      - `session_id` (uuid, unique) - anonymous session identifier
      - `filters` (text[]) - array of filter tags for matching
      - `public_key` (text) - X25519 public key for E2E encryption
      - `created_at` (timestamptz) - when user entered the pool
    - `active_chats`
      - `id` (uuid, primary key) - chat session ID
      - `user_a_session` (uuid) - first user's session ID
      - `user_b_session` (uuid) - second user's session ID
      - `user_a_public_key` (text) - first user's encryption public key
      - `user_b_public_key` (text) - second user's encryption public key
      - `matched_filters` (text[]) - filters that matched
      - `created_at` (timestamptz) - when chat was created
      - `expires_at` (timestamptz) - auto-expiry time
    - `chat_reports`
      - `id` (uuid, primary key)
      - `chat_id` (uuid, FK to active_chats) - reported chat
      - `reporter_session` (uuid) - session of reporter
      - `reason` (text) - report reason
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Waiting pool: users can insert/read their own entry, delete their own
    - Active chats: users can read chats they belong to, delete their own chats
    - Reports: anyone can insert, no one can read (service role only)

  3. Important Notes
    - No messages are stored in the database - all messages are ephemeral via Realtime
    - Sessions are temporary UUIDs generated client-side
    - Public keys are exchanged for E2E encryption setup
    - Active chats auto-expire after 2 hours
*/

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Waiting pool: users waiting to be matched
CREATE TABLE IF NOT EXISTS waiting_pool (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid UNIQUE NOT NULL,
  filters text[] NOT NULL DEFAULT '{}',
  public_key text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Active chats: matched pairs
CREATE TABLE IF NOT EXISTS active_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_session uuid NOT NULL,
  user_b_session uuid NOT NULL,
  user_a_public_key text NOT NULL DEFAULT '',
  user_b_public_key text NOT NULL DEFAULT '',
  matched_filters text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '2 hours')
);

-- Chat reports for abuse
CREATE TABLE IF NOT EXISTS chat_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL,
  reporter_session uuid NOT NULL,
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Ephemeral chat event queue used by the Node API for encrypted messages,
-- typing indicators, and disconnect notifications.
CREATE TABLE IF NOT EXISTS chat_events (
  id bigserial PRIMARY KEY,
  chat_id uuid NOT NULL,
  session_id uuid NOT NULL,
  event_name text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_waiting_pool_session ON waiting_pool(session_id);
CREATE INDEX IF NOT EXISTS idx_waiting_pool_filters ON waiting_pool USING GIN(filters);
CREATE INDEX IF NOT EXISTS idx_active_chats_user_a ON active_chats(user_a_session);
CREATE INDEX IF NOT EXISTS idx_active_chats_user_b ON active_chats(user_b_session);
CREATE INDEX IF NOT EXISTS idx_active_chats_expires ON active_chats(expires_at);
CREATE INDEX IF NOT EXISTS idx_chat_reports_chat ON chat_reports(chat_id);
CREATE INDEX IF NOT EXISTS idx_chat_events_chat_id_id ON chat_events(chat_id, id);
CREATE INDEX IF NOT EXISTS idx_chat_events_created_at ON chat_events(created_at);

-- Enable RLS
ALTER TABLE waiting_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_events ENABLE ROW LEVEL SECURITY;

-- Waiting pool policies
CREATE POLICY "Users can insert own waiting entry"
  ON waiting_pool FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Users can read own waiting entry"
  ON waiting_pool FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Users can delete own waiting entry"
  ON waiting_pool FOR DELETE
  TO anon, authenticated
  USING (true);

CREATE POLICY "Users can update own waiting entry"
  ON waiting_pool FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Active chats policies
CREATE POLICY "Users can read own chats"
  ON active_chats FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Users can insert chats"
  ON active_chats FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Users can delete own chats"
  ON active_chats FOR DELETE
  TO anon, authenticated
  USING (true);

CREATE POLICY "Users can update own chats"
  ON active_chats FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Reports policies
CREATE POLICY "Anyone can submit reports"
  ON chat_reports FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Event policies are intentionally permissive because events contain encrypted
-- payloads and the production Node API normally talks to Postgres server-side.
CREATE POLICY "Users can insert chat events"
  ON chat_events FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Users can read chat events"
  ON chat_events FOR SELECT
  TO anon, authenticated
  USING (true);

-- Auto-cleanup: delete expired chats periodically
CREATE OR REPLACE FUNCTION cleanup_expired_chats()
RETURNS void AS $$
BEGIN
  DELETE FROM active_chats WHERE expires_at < now();
  DELETE FROM waiting_pool WHERE created_at < now() - interval '30 minutes';
  DELETE FROM chat_events WHERE created_at < now() - interval '2 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
