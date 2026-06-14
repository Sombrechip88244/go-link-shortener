CREATE TABLE IF NOT EXISTS links (
  code TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  clicks INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_created_at ON links(created_at DESC);

CREATE TABLE IF NOT EXISTS rate_limits (
  ip TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_ip ON rate_limits(ip, created_at);
