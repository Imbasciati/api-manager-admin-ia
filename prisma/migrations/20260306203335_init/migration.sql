-- CreateEnum
CREATE TYPE "Perfil" AS ENUM ('ADMIN', 'SUPERVISOR', 'VENDEDOR');

-- CreateEnum
CREATE TYPE "Tom" AS ENUM ('PROFISSIONAL', 'CASUAL', 'FORMAL', 'AMIGAVEL');

-- CreateEnum
CREATE TYPE "StatusResposta" AS ENUM ('SUGESTAO', 'AUTO_RESPOSTA', 'EDITADA', 'IGNORADA');

-- CreateEnum
CREATE TYPE "EventoLog" AS ENUM ('CONECTOU', 'DESCONECTOU', 'ERRO');

-- CreateEnum
CREATE TYPE "Severidade" AS ENUM ('WARNING', 'ERROR', 'CRITICAL');

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senha" TEXT NOT NULL,
    "perfil" "Perfil" NOT NULL DEFAULT 'VENDEDOR',
    "status" BOOLEAN NOT NULL DEFAULT true,
    "agenteIaId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agente" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "promptSistema" TEXT NOT NULL,
    "contextoProdutos" TEXT,
    "tom" "Tom" NOT NULL DEFAULT 'PROFISSIONAL',
    "modelo" TEXT NOT NULL DEFAULT 'gpt-4o',
    "temperatura" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "tokensMaximos" INTEGER NOT NULL DEFAULT 500,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "todosVendedores" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Agente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Documento" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "agenteId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Documento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Monitoramento" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "agenteId" TEXT NOT NULL,
    "campanha" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "mensagemOriginal" TEXT NOT NULL,
    "respostaIA" TEXT NOT NULL,
    "statusResposta" "StatusResposta" NOT NULL DEFAULT 'SUGESTAO',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Monitoramento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustoIA" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "agenteId" TEXT,
    "modelo" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "custoUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "duracao" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustoIA_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogAtividade" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "evento" "EventoLog" NOT NULL,
    "ip" TEXT,
    "duracaoSessao" INTEGER,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogAtividade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErroSistema" (
    "id" TEXT NOT NULL,
    "severidade" "Severidade" NOT NULL,
    "categoria" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "usuarioId" TEXT,
    "origem" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErroSistema_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrientacaoGlobal" (
    "id" TEXT NOT NULL,
    "conteudo" TEXT NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrientacaoGlobal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_agenteIaId_fkey" FOREIGN KEY ("agenteIaId") REFERENCES "Agente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Documento" ADD CONSTRAINT "Documento_agenteId_fkey" FOREIGN KEY ("agenteId") REFERENCES "Agente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Monitoramento" ADD CONSTRAINT "Monitoramento_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Monitoramento" ADD CONSTRAINT "Monitoramento_agenteId_fkey" FOREIGN KEY ("agenteId") REFERENCES "Agente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustoIA" ADD CONSTRAINT "CustoIA_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustoIA" ADD CONSTRAINT "CustoIA_agenteId_fkey" FOREIGN KEY ("agenteId") REFERENCES "Agente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogAtividade" ADD CONSTRAINT "LogAtividade_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
