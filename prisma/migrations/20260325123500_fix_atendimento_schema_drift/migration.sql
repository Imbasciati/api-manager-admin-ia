-- Fix Atendimento schema drift (fields used by runtime but missing in DB)

ALTER TABLE "Atendimento"
  ADD COLUMN IF NOT EXISTS "agenteId" TEXT,
  ADD COLUMN IF NOT EXISTS "nomeAgente" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Atendimento_agenteId_fkey'
  ) THEN
    ALTER TABLE "Atendimento"
      ADD CONSTRAINT "Atendimento_agenteId_fkey"
      FOREIGN KEY ("agenteId") REFERENCES "Agente"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Atendimento_status_atualizadoEm_idx"
  ON "Atendimento" ("status", "atualizadoEm");

CREATE INDEX IF NOT EXISTS "Atendimento_telefone_canal_idx"
  ON "Atendimento" ("telefone", "canal");
