-- Add metadata columns to AgentExecution for cost tracking by agent, model and channel

ALTER TABLE "AgentExecution"
  ADD COLUMN IF NOT EXISTS "agenteId" TEXT,
  ADD COLUMN IF NOT EXISTS "modelo"   TEXT NOT NULL DEFAULT 'gpt-4.1-mini',
  ADD COLUMN IF NOT EXISTS "canal"    TEXT NOT NULL DEFAULT 'manychat';

CREATE INDEX IF NOT EXISTS "AgentExecution_agenteId_idx" ON "AgentExecution" ("agenteId");
CREATE INDEX IF NOT EXISTS "AgentExecution_modelo_idx"   ON "AgentExecution" ("modelo");
CREATE INDEX IF NOT EXISTS "AgentExecution_canal_idx"    ON "AgentExecution" ("canal");
