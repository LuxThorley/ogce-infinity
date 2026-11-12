-- PostgreSQL migration foundation. Runtime v8.2 adapter currently uses SQLite.
CREATE TABLE IF NOT EXISTS ogce_worlds_v82 (
  world_id VARCHAR(64) PRIMARY KEY,
  revision BIGINT NOT NULL DEFAULT 0,
  record JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ogce_worlds_v82_updated_idx ON ogce_worlds_v82(updated_at);
