ALTER TABLE meeting_rooms
  ADD COLUMN IF NOT EXISTS owner_session_id uuid;

ALTER TABLE meeting_rooms
  ADD COLUMN IF NOT EXISTS duration_days int NOT NULL DEFAULT 1;

ALTER TABLE meeting_rooms
  DROP CONSTRAINT IF EXISTS meeting_rooms_duration_days_check;

ALTER TABLE meeting_rooms
  ADD CONSTRAINT meeting_rooms_duration_days_check
  CHECK (duration_days BETWEEN 1 AND 3);

UPDATE meeting_rooms
SET duration_days = LEAST(3, GREATEST(1, CEIL(EXTRACT(EPOCH FROM (expires_at - created_at)) / 86400.0)::int))
WHERE duration_days IS NULL OR duration_days < 1 OR duration_days > 3;

DELETE FROM meeting_rooms WHERE expires_at < now();
