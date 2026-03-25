import { prisma } from "../prisma/client";

// GPT-4.1-mini pricing
const PRECO_INPUT_POR_TOKEN = 0.4 / 1_000_000;
const PRECO_OUTPUT_POR_TOKEN = 1.6 / 1_000_000;

export function calcularCusto(inputTokens: number, outputTokens: number): number {
  return inputTokens * PRECO_INPUT_POR_TOKEN + outputTokens * PRECO_OUTPUT_POR_TOKEN;
}

interface LogData {
  contactId: string;
  inputMensagem: string;
  classificacao: string;
  resposta?: string;
  inputTokens?: number;
  outputTokens?: number;
  custoUsd?: number;
  duracao?: number;
  erro?: string;
}

export async function log(data: LogData): Promise<void> {
  const inputTokens = data.inputTokens ?? 0;
  const outputTokens = data.outputTokens ?? 0;
  const custoUsd = data.custoUsd ?? calcularCusto(inputTokens, outputTokens);

  await prisma.agentExecution.create({
    data: {
      contactId: data.contactId,
      inputMensagem: data.inputMensagem,
      classificacao: data.classificacao,
      resposta: data.resposta,
      inputTokens,
      outputTokens,
      custoUsd,
      duracao: data.duracao ?? 0,
      erro: data.erro,
    },
  });
}

export async function listExecutions(params: {
  page?: number;
  limit?: number;
  contactId?: string;
}) {
  const page = params.page ?? 1;
  const limit = Math.min(params.limit ?? 20, 100);
  const skip = (page - 1) * limit;
  const where = params.contactId ? { contactId: params.contactId } : {};

  const [total, data] = await Promise.all([
    prisma.agentExecution.count({ where }),
    prisma.agentExecution.findMany({
      where,
      orderBy: { criadoEm: "desc" },
      skip,
      take: limit,
    }),
  ]);

  return { total, page, limit, data };
}

export async function getStats() {
  const now = new Date();
  const inicioHoje = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1);

  const [totalHoje, aggHoje, totalMes, aggMes, porClassificacao] = await Promise.all([
    prisma.agentExecution.count({ where: { criadoEm: { gte: inicioHoje } } }),
    prisma.agentExecution.aggregate({
      where: { criadoEm: { gte: inicioHoje } },
      _sum: { custoUsd: true, inputTokens: true, outputTokens: true },
    }),
    prisma.agentExecution.count({ where: { criadoEm: { gte: inicioMes } } }),
    prisma.agentExecution.aggregate({
      where: { criadoEm: { gte: inicioMes } },
      _sum: { custoUsd: true },
    }),
    prisma.agentExecution.groupBy({
      by: ["classificacao"],
      _count: { _all: true },
    }),
  ]);

  return {
    hoje: {
      execucoes: totalHoje,
      custoUsd: aggHoje._sum.custoUsd ?? 0,
      inputTokens: aggHoje._sum.inputTokens ?? 0,
      outputTokens: aggHoje._sum.outputTokens ?? 0,
    },
    mes: {
      execucoes: totalMes,
      custoUsd: aggMes._sum.custoUsd ?? 0,
    },
    porClassificacao: porClassificacao.map((r) => ({
      classificacao: r.classificacao,
      total: r._count._all,
    })),
  };
}
