-- CreateTable
CREATE TABLE "MessageBuffer" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "conteudo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'text',
    "mediaUrl" TEXT,
    "transcricao" TEXT,
    "processado" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageBuffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationMemory" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "historico" JSONB NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentExecution" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "inputMensagem" TEXT NOT NULL,
    "classificacao" TEXT NOT NULL,
    "resposta" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "custoUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "duracao" INTEGER NOT NULL DEFAULT 0,
    "erro" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentExecution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessageBuffer_contactId_processado_idx" ON "MessageBuffer"("contactId", "processado");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationMemory_contactId_key" ON "ConversationMemory"("contactId");

-- CreateIndex
CREATE INDEX "AgentExecution_contactId_idx" ON "AgentExecution"("contactId");

-- CreateIndex
CREATE INDEX "AgentExecution_criadoEm_idx" ON "AgentExecution"("criadoEm");
