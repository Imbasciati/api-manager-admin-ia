import { Request, Response } from "express";
import { format, subDays } from "date-fns";
import { prisma } from "../prisma/client";
import { asyncHandler } from "../utils/asyncHandler";
import { parsePagination } from "../utils/query";
import { ok } from "../utils/response";

/** Deriva o nome do provedor a partir do ID do modelo. */
function providerDoModelo(modelo: string): string {
  const m = modelo.toLowerCase();
  if (m.startsWith("claude"))  return "anthropic";
  if (m.startsWith("gemini"))  return "google";
  return "openai";
}

/** Monta filtro de data para consultas no AgentExecution. */
function filtroData(req: Request) {
  const di = req.query.dataInicio ? new Date(String(req.query.dataInicio)) : undefined;
  const df = req.query.dataFim    ? new Date(String(req.query.dataFim) + "T23:59:59") : undefined;
  if (!di && !df) return undefined;
  return { ...(di ? { gte: di } : {}), ...(df ? { lte: df } : {}) };
}

// ── Resumo geral ────────────────────────────────────────────────────────────────

export const custosResumo = asyncHandler(async (req: Request, res: Response) => {
  const now        = new Date();
  const inicioHoje = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const inicioMes  = new Date(now.getFullYear(), now.getMonth(), 1);

  const [aggHoje, aggMes, aggTotal] = await Promise.all([
    prisma.agentExecution.aggregate({
      where: { criadoEm: { gte: inicioHoje } },
      _sum:   { custoUsd: true, inputTokens: true, outputTokens: true },
      _count: { _all: true },
    }),
    prisma.agentExecution.aggregate({
      where: { criadoEm: { gte: inicioMes } },
      _sum:   { custoUsd: true, inputTokens: true, outputTokens: true },
      _count: { _all: true },
    }),
    prisma.agentExecution.aggregate({
      _sum:   { custoUsd: true, inputTokens: true, outputTokens: true },
      _count: { _all: true },
    }),
  ]);

  return ok(res, {
    hoje: {
      execucoes:    aggHoje._count._all,
      custoUsd:     aggHoje._sum.custoUsd     ?? 0,
      inputTokens:  aggHoje._sum.inputTokens  ?? 0,
      outputTokens: aggHoje._sum.outputTokens ?? 0,
    },
    mes: {
      execucoes:    aggMes._count._all,
      custoUsd:     aggMes._sum.custoUsd     ?? 0,
      inputTokens:  aggMes._sum.inputTokens  ?? 0,
      outputTokens: aggMes._sum.outputTokens ?? 0,
    },
    total: {
      execucoes:    aggTotal._count._all,
      custoUsd:     aggTotal._sum.custoUsd     ?? 0,
      inputTokens:  aggTotal._sum.inputTokens  ?? 0,
      outputTokens: aggTotal._sum.outputTokens ?? 0,
    },
  });
});

// ── Por provedor ────────────────────────────────────────────────────────────────

export const custosPorProvedor = asyncHandler(async (req: Request, res: Response) => {
  const criadoEm = filtroData(req);
  const where = criadoEm ? { criadoEm } : {};

  const rows = await prisma.agentExecution.groupBy({
    by:    ["modelo"],
    where,
    _sum:   { custoUsd: true, inputTokens: true, outputTokens: true },
    _count: { _all: true },
  });

  // Agrupa por provedor derivado do modelo
  const map = new Map<string, { execucoes: number; custoUsd: number; inputTokens: number; outputTokens: number }>();
  for (const r of rows) {
    const provider = providerDoModelo(r.modelo);
    const acc = map.get(provider) ?? { execucoes: 0, custoUsd: 0, inputTokens: 0, outputTokens: 0 };
    map.set(provider, {
      execucoes:    acc.execucoes    + r._count._all,
      custoUsd:     acc.custoUsd     + (r._sum.custoUsd     ?? 0),
      inputTokens:  acc.inputTokens  + (r._sum.inputTokens  ?? 0),
      outputTokens: acc.outputTokens + (r._sum.outputTokens ?? 0),
    });
  }

  return ok(res, [...map.entries()].map(([provider, v]) => ({ provider, ...v }))
    .sort((a, b) => b.custoUsd - a.custoUsd));
});

// ── Por modelo ──────────────────────────────────────────────────────────────────

export const custosPorModelo = asyncHandler(async (req: Request, res: Response) => {
  const criadoEm = filtroData(req);
  const where: Record<string, unknown> = criadoEm ? { criadoEm } : {};
  if (req.query.modelo) where.modelo = String(req.query.modelo);

  const rows = await prisma.agentExecution.groupBy({
    by:    ["modelo"],
    where,
    _sum:   { custoUsd: true, inputTokens: true, outputTokens: true },
    _count: { _all: true },
    orderBy: { _sum: { custoUsd: "desc" } },
  });

  return ok(res, rows.map((r) => ({
    modelo:       r.modelo,
    provider:     providerDoModelo(r.modelo),
    execucoes:    r._count._all,
    custoUsd:     r._sum.custoUsd     ?? 0,
    inputTokens:  r._sum.inputTokens  ?? 0,
    outputTokens: r._sum.outputTokens ?? 0,
  })));
});

// ── Por agente ──────────────────────────────────────────────────────────────────

export const custosPorAgente = asyncHandler(async (req: Request, res: Response) => {
  const criadoEm = filtroData(req);
  const where: Record<string, unknown> = criadoEm ? { criadoEm } : {};
  if (req.query.agenteId) where.agenteId = String(req.query.agenteId);

  const rows = await prisma.agentExecution.groupBy({
    by:    ["agenteId"],
    where,
    _sum:   { custoUsd: true, inputTokens: true, outputTokens: true },
    _count: { _all: true },
    orderBy: { _sum: { custoUsd: "desc" } },
  });

  // Busca nomes dos agentes
  const ids = rows.map((r) => r.agenteId).filter(Boolean) as string[];
  const agentes = await prisma.agente.findMany({
    where: { id: { in: ids } },
    select: { id: true, nome: true, produto: true, atuacao: true, modelo: true },
  });
  const agenteMap = new Map(agentes.map((a) => [a.id, a]));

  return ok(res, rows.map((r) => {
    const agente = r.agenteId ? agenteMap.get(r.agenteId) : null;
    return {
      agenteId:     r.agenteId ?? "sem-agente",
      nomeAgente:   agente?.nome    ?? "ManyChat / Sem agente",
      produto:      agente?.produto ?? null,
      atuacao:      agente?.atuacao ?? null,
      modelo:       agente?.modelo  ?? "gpt-4.1-mini",
      execucoes:    r._count._all,
      custoUsd:     r._sum.custoUsd     ?? 0,
      inputTokens:  r._sum.inputTokens  ?? 0,
      outputTokens: r._sum.outputTokens ?? 0,
    };
  }));
});

// ── Por canal ───────────────────────────────────────────────────────────────────

export const custosPorCanal = asyncHandler(async (req: Request, res: Response) => {
  const criadoEm = filtroData(req);
  const where = criadoEm ? { criadoEm } : {};

  const rows = await prisma.agentExecution.groupBy({
    by:    ["canal"],
    where,
    _sum:   { custoUsd: true, inputTokens: true, outputTokens: true },
    _count: { _all: true },
    orderBy: { _sum: { custoUsd: "desc" } },
  });

  return ok(res, rows.map((r) => ({
    canal:        r.canal,
    execucoes:    r._count._all,
    custoUsd:     r._sum.custoUsd     ?? 0,
    inputTokens:  r._sum.inputTokens  ?? 0,
    outputTokens: r._sum.outputTokens ?? 0,
  })));
});

// ── Tendência diária (últimos 30 dias) ─────────────────────────────────────────

export const custosTendencia = asyncHandler(async (req: Request, res: Response) => {
  const criadoEm = filtroData(req) ?? { gte: subDays(new Date(), 30) };

  const rows = await prisma.agentExecution.findMany({
    where:  { criadoEm },
    select: { criadoEm: true, custoUsd: true, inputTokens: true, outputTokens: true },
  });

  const map = new Map<string, { custoUsd: number; inputTokens: number; outputTokens: number; execucoes: number }>();
  for (const r of rows) {
    const dia = format(r.criadoEm, "yyyy-MM-dd");
    const acc = map.get(dia) ?? { custoUsd: 0, inputTokens: 0, outputTokens: 0, execucoes: 0 };
    map.set(dia, {
      custoUsd:     acc.custoUsd     + r.custoUsd,
      inputTokens:  acc.inputTokens  + r.inputTokens,
      outputTokens: acc.outputTokens + r.outputTokens,
      execucoes:    acc.execucoes    + 1,
    });
  }

  return ok(res,
    [...map.entries()]
      .map(([dia, v]) => ({ dia, ...v }))
      .sort((a, b) => a.dia.localeCompare(b.dia)),
  );
});

// ── Log paginado de execuções ───────────────────────────────────────────────────

export const custosLog = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, skip } = parsePagination(req);
  const criadoEm = filtroData(req);

  const where: Record<string, unknown> = {};
  if (criadoEm)              where.criadoEm = criadoEm;
  if (req.query.agenteId)    where.agenteId = String(req.query.agenteId);
  if (req.query.modelo)      where.modelo   = String(req.query.modelo);
  if (req.query.canal)       where.canal    = String(req.query.canal);

  const [total, data] = await Promise.all([
    prisma.agentExecution.count({ where }),
    prisma.agentExecution.findMany({
      where,
      orderBy: { criadoEm: "desc" },
      skip,
      take: limit,
    }),
  ]);

  // Resolve nomes dos agentes em lote
  const ids = [...new Set(data.map((r) => r.agenteId).filter(Boolean))] as string[];
  const agentes = await prisma.agente.findMany({
    where: { id: { in: ids } },
    select: { id: true, nome: true },
  });
  const agenteMap = new Map(agentes.map((a) => [a.id, a.nome]));

  return ok(res, data.map((r) => ({
    ...r,
    nomeAgente: r.agenteId ? (agenteMap.get(r.agenteId) ?? "Desconhecido") : "ManyChat",
    provider:   providerDoModelo(r.modelo),
  })), { total, page, limit });
});

// Manter endpoint legado de resumo vendedor para compatibilidade
export const custosPorVendedor = asyncHandler(async (_req: Request, res: Response) => {
  return ok(res, []);
});
