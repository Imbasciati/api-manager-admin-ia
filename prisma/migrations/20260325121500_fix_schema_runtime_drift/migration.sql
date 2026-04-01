-- Fix runtime schema drift between Prisma schema and database
-- Safe to apply in existing environments

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'EventoLog' AND e.enumlabel = 'ACAO'
  ) THEN
    ALTER TYPE "EventoLog" ADD VALUE 'ACAO';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'Severidade' AND e.enumlabel = 'INFO'
  ) THEN
    ALTER TYPE "Severidade" ADD VALUE 'INFO';
  END IF;
END $$;

ALTER TABLE "LogAtividade"
  ADD COLUMN IF NOT EXISTS "acao" TEXT,
  ADD COLUMN IF NOT EXISTS "descricao" TEXT,
  ADD COLUMN IF NOT EXISTS "entidade" TEXT,
  ADD COLUMN IF NOT EXISTS "entidadeId" TEXT,
  ADD COLUMN IF NOT EXISTS "metadados" JSONB;

ALTER TABLE "ErroSistema"
  ADD COLUMN IF NOT EXISTS "resolvido" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "LogAtividade_usuarioId_criadoEm_idx"
  ON "LogAtividade" ("usuarioId", "criadoEm");

CREATE INDEX IF NOT EXISTS "LogAtividade_evento_criadoEm_idx"
  ON "LogAtividade" ("evento", "criadoEm");
