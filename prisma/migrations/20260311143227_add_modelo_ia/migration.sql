-- CreateTable
CREATE TABLE "ModeloIA" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "descricao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "custoInputPorMilToken" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "custoOutputPorMilToken" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModeloIA_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ModeloIA_modelId_key" ON "ModeloIA"("modelId");
