-- CreateTable: EventoAgente
-- Registra cada evento recebido pelos webhooks dos agentes (Unnichat, n8n, etc.)
CREATE TABLE "EventoAgente" (
    "id"        TEXT NOT NULL,
    "agenteId"  TEXT NOT NULL,
    "tipo"      TEXT NOT NULL,
    "canal"     TEXT NOT NULL DEFAULT 'unnichat',
    "contactId" TEXT,
    "payload"   JSONB NOT NULL,
    "erro"      TEXT,
    "criadoEm"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoAgente_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ConexaoStatus
-- Armazena o resultado da última verificação de conectividade de cada agente
CREATE TABLE "ConexaoStatus" (
    "id"           TEXT NOT NULL,
    "agenteId"     TEXT NOT NULL,
    "status"       TEXT NOT NULL DEFAULT 'DESCONHECIDO',
    "detalhe"      TEXT,
    "verificadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConexaoStatus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventoAgente_agenteId_criadoEm_idx" ON "EventoAgente"("agenteId", "criadoEm");
CREATE INDEX "EventoAgente_agenteId_erro_idx" ON "EventoAgente"("agenteId", "erro");
CREATE INDEX "EventoAgente_criadoEm_idx" ON "EventoAgente"("criadoEm");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "ConexaoStatus_agenteId_key" ON "ConexaoStatus"("agenteId");
CREATE INDEX "ConexaoStatus_agenteId_idx" ON "ConexaoStatus"("agenteId");
