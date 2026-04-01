-- Fix Agente schema drift (fields used by runtime but missing in DB)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'CanalIntegracao'
  ) THEN
    CREATE TYPE "CanalIntegracao" AS ENUM ('NENHUM', 'UNNICHAT', 'MANYCHAT', 'AMBOS');
  END IF;
END $$;

ALTER TABLE "Agente"
  ADD COLUMN IF NOT EXISTS "canalIntegracao" "CanalIntegracao" NOT NULL DEFAULT 'NENHUM',
  ADD COLUMN IF NOT EXISTS "unnichatApiKey" TEXT,
  ADD COLUMN IF NOT EXISTS "unnichatAtivo" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "unnichatConexaoNome" TEXT,
  ADD COLUMN IF NOT EXISTS "produto" TEXT,
  ADD COLUMN IF NOT EXISTS "atuacao" TEXT;
