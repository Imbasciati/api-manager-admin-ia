-- CreateEnum
CREATE TYPE "StatusAtendimento" AS ENUM ('NOVO', 'EM_ANDAMENTO', 'AGUARDANDO', 'FINALIZADO');

-- CreateEnum
CREATE TYPE "OrigemMensagem" AS ENUM ('CLIENTE', 'AGENTE_IA', 'VENDEDOR');

-- CreateTable
CREATE TABLE "Atendimento" (
    "id" TEXT NOT NULL,
    "conversaId" TEXT,
    "telefone" TEXT NOT NULL,
    "nome" TEXT,
    "campanha" TEXT,
    "canal" TEXT NOT NULL DEFAULT 'whatsapp',
    "status" "StatusAtendimento" NOT NULL DEFAULT 'NOVO',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Atendimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MensagemAtendimento" (
    "id" TEXT NOT NULL,
    "atendimentoId" TEXT NOT NULL,
    "origem" "OrigemMensagem" NOT NULL DEFAULT 'CLIENTE',
    "conteudo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MensagemAtendimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfiguracaoWebhook" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "descricao" TEXT,
    "totalEventos" INTEGER NOT NULL DEFAULT 0,
    "ultimoEventoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfiguracaoWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Atendimento_conversaId_key" ON "Atendimento"("conversaId");

-- CreateIndex
CREATE UNIQUE INDEX "ConfiguracaoWebhook_token_key" ON "ConfiguracaoWebhook"("token");

-- AddForeignKey
ALTER TABLE "MensagemAtendimento" ADD CONSTRAINT "MensagemAtendimento_atendimentoId_fkey" FOREIGN KEY ("atendimentoId") REFERENCES "Atendimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
