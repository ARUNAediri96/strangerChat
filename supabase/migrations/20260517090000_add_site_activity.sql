CREATE TABLE IF NOT EXISTS site_activity (
  name text PRIMARY KEY,
  active_count integer NOT NULL CHECK (active_count BETWEEN 5000 AND 10000),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO site_activity (name, active_count)
VALUES ('global', 6200 + floor(random() * 3801)::int)
ON CONFLICT (name) DO NOTHING;

ALTER TABLE site_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "API can manage site activity"
  ON site_activity FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
