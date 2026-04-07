-- CreateTable: ConexaoUnnichat
-- Armazena conexões nomeadas do Unnichat, cada uma com sua própria API Key
CREATE TABLE "ConexaoUnnichat" (
    "id"           TEXT NOT NULL,
    "nome"         TEXT NOT NULL,
    "apiKey"       TEXT NOT NULL,
    "ativo"        BOOLEAN NOT NULL DEFAULT true,
    "criadoEm"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConexaoUnnichat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConexaoUnnichat_ativo_idx" ON "ConexaoUnnichat"("ativo");

-- AlterTable: Agente — adiciona FK para ConexaoUnnichat
ALTER TABLE "Agente" ADD COLUMN "conexaoUnnichatId" TEXT;

-- AddForeignKey
ALTER TABLE "Agente" ADD CONSTRAINT "Agente_conexaoUnnichatId_fkey"
    FOREIGN KEY ("conexaoUnnichatId") REFERENCES "ConexaoUnnichat"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
