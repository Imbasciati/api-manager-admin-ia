import { prisma } from "../prisma/client";

// Preços de fallback por modelo (USD por token)
// Usados quando o modelo não está cadastrado na tabela ModeloIA
const PRECOS_FALLBACK: Record<string, { input: number; output: number }> = {
  "gpt-4.1-mini":   { input: 0.40  / 1_000_000, output: 1.60  / 1_000_000 },
  "gpt-4.1":        { input: 2.00  / 1_000_000, output: 8.00  / 1_000_000 },
  "gpt-4o":         { input: 2.50  / 1_000_000, output: 10.00 / 1_000_000 },
  "gpt-4o-mini":    { input: 0.15  / 1_000_000, output: 0.60  / 1_000_000 },
  "o4-mini":        { input: 1.10  / 1_000_000, output: 4.40  / 1_000_000 },
  "claude-haiku-4-5-20251001":      { input: 0.80  / 1_000_000, output: 4.00  / 1_000_000 },
  "claude-sonnet-4-5": { input: 3.00  / 1_000_000, output: 15.00 / 1_000_000 },
  "claude-opus-4-5":   { input: 15.00 / 1_000_000, output: 75.00 / 1_000_000 },
  "gemini-2.0-flash":  { input: 0.075 / 1_000_000, output: 0.30  / 1_000_000 },
  "gemini-1.5-pro":    { input: 1.25  / 1_000_000, output: 5.00  / 1_000_000 },
};

const PRECO_GENERICO = { input: 0.40 / 1_000_000, output: 1.60 / 1_000_000 };

/**
 * Busca o preço por token do modelo na tabela ModeloIA.
 * Fallback para tabela interna se não encontrar.
 */
async function buscarPreco(modelo: string): Promise<{ input: number; output: number }> {
  const registro = await prisma.modeloIA.findUnique({ where: { modelId: modelo } });
  if (registro) {
    return {
      input:  registro.custoInputPorMilToken  / 1_000,
      output: registro.custoOutputPorMilToken / 1_000,
    };
  }
  return PRECOS_FALLBACK[modelo] ?? PRECO_GENERICO;
}

export async function calcularCusto(
  inputTokens: number,
  outputTokens: number,
  modelo: string,
): Promise<number> {
  const preco = await buscarPreco(modelo);
  return inputTokens * preco.input + outputTokens * preco.output;
}

interface LogData {
  contactId: string;
  agenteId?: string;
  modelo?: string;
  canal?: string;
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
  const inputTokens  = data.inputTokens  ?? 0;
  const outputTokens = data.outputTokens ?? 0;
  const modelo       = data.modelo ?? "gpt-4.1-mini";
  const custoUsd     = data.custoUsd ?? await calcularCusto(inputTokens, outputTokens, modelo);

  await prisma.agentExecution.create({
    data: {
      contactId:    data.contactId,
      agenteId:     data.agenteId,
      modelo,
      canal:        data.canal ?? "manychat",
      inputMensagem: data.inputMensagem,
      classificacao: data.classificacao,
      resposta:     data.resposta,
      inputTokens,
      outputTokens,
      custoUsd,
      duracao:      data.duracao ?? 0,
      erro:         data.erro,
    },
  });
}

export async function listExecutions(params: {
  page?: number;
  limit?: number;
  contactId?: string;
  agenteId?: string;
  canal?: string;
  modelo?: string;
  dataInicio?: string;
  dataFim?: string;
}) {
  const page  = params.page  ?? 1;
  const limit = Math.min(params.limit ?? 20, 100);
  const skip  = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (params.contactId)  where.contactId  = params.contactId;
  if (params.agenteId)   where.agenteId   = params.agenteId;
  if (params.canal)      where.canal      = params.canal;
  if (params.modelo)     where.modelo     = params.modelo;
  if (params.dataInicio || params.dataFim) {
    where.criadoEm = {
      ...(params.dataInicio ? { gte: new Date(params.dataInicio) } : {}),
      ...(params.dataFim    ? { lte: new Date(params.dataFim + "T23:59:59") } : {}),
    };
  }

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
  const now        = new Date();
  const inicioHoje = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const inicioMes  = new Date(now.getFullYear(), now.getMonth(), 1);

  const [totalHoje, aggHoje, totalMes, aggMes, porClassificacao] = await Promise.all([
    prisma.agentExecution.count({ where: { criadoEm: { gte: inicioHoje } } }),
    prisma.agentExecution.aggregate({
      where: { criadoEm: { gte: inicioHoje } },
      _sum: { custoUsd: true, inputTokens: true, outputTokens: true },
    }),
    prisma.agentExecution.count({ where: { criadoEm: { gte: inicioMes } } }),
    prisma.agentExecution.aggregate({
      where: { criadoEm: { gte: inicioMes } },
      _sum: { custoUsd: true, inputTokens: true, outputTokens: true },
    }),
    prisma.agentExecution.groupBy({
      by: ["classificacao"],
      _count: { _all: true },
    }),
  ]);

  return {
    hoje: {
      execucoes:    totalHoje,
      custoUsd:     aggHoje._sum.custoUsd     ?? 0,
      inputTokens:  aggHoje._sum.inputTokens  ?? 0,
      outputTokens: aggHoje._sum.outputTokens ?? 0,
    },
    mes: {
      execucoes:    totalMes,
      custoUsd:     aggMes._sum.custoUsd     ?? 0,
      inputTokens:  aggMes._sum.inputTokens  ?? 0,
      outputTokens: aggMes._sum.outputTokens ?? 0,
    },
    porClassificacao: porClassificacao.map((r) => ({
      classificacao: r.classificacao,
      total: r._count._all,
    })),
  };
}
