-- OGCE v8.0 PostgreSQL schema (apply with psql to a dedicated database)
CREATE TABLE IF NOT EXISTS ogce_worlds (
  world_id TEXT PRIMARY KEY, revision BIGINT NOT NULL DEFAULT 0,
  state JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ogce_world_events (
  event_id BIGSERIAL PRIMARY KEY, world_id TEXT NOT NULL REFERENCES ogce_worlds(world_id),
  revision BIGINT NOT NULL, event JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(world_id, revision)
);
CREATE TABLE IF NOT EXISTS ogce_agent_memory (
  agent_id TEXT NOT NULL, memory_key TEXT NOT NULL, memory JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(agent_id, memory_key)
);
CREATE TABLE IF NOT EXISTS ogce_mulux_receipts (
  receipt_id BIGSERIAL PRIMARY KEY, world_id TEXT NOT NULL, receipt JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
