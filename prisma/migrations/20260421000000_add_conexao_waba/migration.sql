-- CreateTable: ConexaoWABA
-- Armazena contas WhatsApp Business API conectadas via OAuth (Embedded Signup) ou manualmente
CREATE TABLE "ConexaoWABA" (
    "id"            TEXT NOT NULL,
    "nome"          TEXT NOT NULL,
    "wabaId"        TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "accessToken"   TEXT NOT NULL,
    "displayPhone"  TEXT,
    "qualidade"     TEXT,
    "ativo"         BOOLEAN NOT NULL DEFAULT true,
    "criadoEm"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConexaoWABA_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConexaoWABA_ativo_idx" ON "ConexaoWABA"("ativo");

-- AlterTable: Agente — adiciona FK para ConexaoWABA e flag wabaAtivo
ALTER TABLE "Agente" ADD COLUMN "conexaoWABAId" TEXT;
ALTER TABLE "Agente" ADD COLUMN "wabaAtivo" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "Agente" ADD CONSTRAINT "Agente_conexaoWABAId_fkey"
    FOREIGN KEY ("conexaoWABAId") REFERENCES "ConexaoWABA"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterEnum: CanalIntegracao — adiciona valor WABA
ALTER TYPE "CanalIntegracao" ADD VALUE 'WABA';
