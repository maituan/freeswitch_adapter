import psycopg2

# Thông tin kết nối Postgres
conn = psycopg2.connect(
    host="localhost",
    port=5432,
    database="callbot",
    user="callbot",
    password="callbot"
)

sql = """
CREATE TABLE IF NOT EXISTS call_history (
  call_id       TEXT PRIMARY KEY,
  scenario      TEXT NOT NULL,
  phone         TEXT NOT NULL,
  lead_id       TEXT,
  gender        TEXT,
  name          TEXT,
  plate         TEXT,
  start_time    TIMESTAMPTZ NOT NULL,
  end_time      TIMESTAMPTZ NOT NULL,
  duration_sec  INT GENERATED ALWAYS AS (EXTRACT(EPOCH FROM (end_time - start_time))) STORED,
  status        TEXT DEFAULT 'ended',
  history       JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_history_phone_time
ON call_history (phone, start_time DESC);

CREATE INDEX IF NOT EXISTS idx_call_history_scenario_time
ON call_history (scenario, start_time DESC);
"""

try:
    cur = conn.cursor()
    cur.execute(sql)
    conn.commit()
    print("Table and indexes created successfully")
finally:
    cur.close()
    conn.close()
