-- CreateTable
CREATE TABLE "AvaliacaoMensagem" (
    "id" TEXT NOT NULL,
    "mensagemId" TEXT NOT NULL,
    "agenteId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "justificativa" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AvaliacaoMensagem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AvaliacaoMensagem_mensagemId_key" ON "AvaliacaoMensagem"("mensagemId");
CREATE INDEX "AvaliacaoMensagem_agenteId_idx" ON "AvaliacaoMensagem"("agenteId");
CREATE INDEX "AvaliacaoMensagem_agenteId_tipo_idx" ON "AvaliacaoMensagem"("agenteId", "tipo");

-- AddForeignKey
ALTER TABLE "AvaliacaoMensagem" ADD CONSTRAINT "AvaliacaoMensagem_mensagemId_fkey" FOREIGN KEY ("mensagemId") REFERENCES "MensagemAtendimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AvaliacaoMensagem" ADD CONSTRAINT "AvaliacaoMensagem_agenteId_fkey" FOREIGN KEY ("agenteId") REFERENCES "Agente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
