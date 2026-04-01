
import { Request, Response } from "express";
import { StatusResposta } from "@prisma/client";
import { prisma } from "../prisma/client";
import { asyncHandler } from "../utils/asyncHandler";
import { ok } from "../utils/response";

// ── Agentes: status e logs técnicos ──────────────────────────────────────────

/** Retorna todos os agentes com stats de interação e situação calculada. */
export const agentesStatus = asyncHandler(async (_req: Request, res: Response) => {
  const [agentes, interacoes] = await Promise.all([
    prisma.agente.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true, modelo: true, ativo: true } }),
    prisma.monitoramento.groupBy({
      by: ["agenteId"],
      _count: { _all: true },
      _max: { criadoEm: true },
    }),
  ]);

  const map = new Map(interacoes.map((i) => [i.agenteId, { total: i._count._all, ultima: i._max.criadoEm }]));
  const limite48h = new Date(Date.now() - 48 * 60 * 60 * 1000);

  const data = agentes.map((a) => {
    const stats = map.get(a.id);
    const ultimaInteracao = stats?.ultima ?? null;
    let situacao: "ativo" | "inativo" | "problema";
    if (!a.ativo) {
      situacao = "inativo";
    } else if (stats && stats.total > 0 && ultimaInteracao && new Date(ultimaInteracao) < limite48h) {
      situacao = "problema";
    } else {
      situacao = "ativo";
    }
    return { id: a.id, nome: a.nome, modelo: a.modelo, ativo: a.ativo, situacao, totalInteracoes: stats?.total ?? 0, ultimaInteracao };
  });

  return ok(res, data);
});

/** Retorna os últimos 100 logs de interação de um agente específico. */
export const logsAgente = asyncHandler(async (req: Request, res: Response) => {
  const agenteId = String(req.params.agenteId);
  const logs = await prisma.monitoramento.findMany({
    where: { agenteId },
    include: { usuario: { select: { id: true, nome: true } } },
    orderBy: { criadoEm: "desc" },
    take: 100,
  });
  return ok(res, logs);
});

export const vendedoresOnline = asyncHandler(async (_req: Request, res: Response) => {
  const limite = new Date(Date.now() - 15 * 60 * 1000);

  const ativos = await prisma.logAtividade.findMany({
    where: {
      evento: "CONECTOU",
      criadoEm: { gte: limite },
      usuario: { status: true },
    },
    orderBy: { criadoEm: "desc" },
    distinct: ["usuarioId"],
    include: { usuario: true },
  });

  return ok(
    res,
    ativos.map((a) => ({
      id: a.usuario.id,
      nome: a.usuario.nome,
      email: a.usuario.email,
      perfil: a.usuario.perfil,
      online: true,
      ultimoEvento: a.criadoEm,
    })),
  );
});

export const historicoVendedor = asyncHandler(async (req: Request, res: Response) => {
  const usuarioId = String(req.params.usuarioId);
  const data = await prisma.monitoramento.findMany({
    where: { usuarioId },
    include: { agente: true },
    orderBy: { criadoEm: "desc" },
    take: 100,
  });

  return ok(res, data);
});

export const statsVendedor = asyncHandler(async (req: Request, res: Response) => {
  const usuarioId = String(req.params.usuarioId);
  const grouped = await prisma.monitoramento.groupBy({
    by: ["statusResposta"],
    where: { usuarioId },
    _count: { _all: true },
  });

  const stats: Record<StatusResposta, number> = {
    SUGESTAO: 0,
    AUTO_RESPOSTA: 0,
    EDITADA: 0,
    IGNORADA: 0,
  };

  grouped.forEach((item) => {
    stats[item.statusResposta] = Number(item._count._all ?? 0);
  });

  return ok(res, stats);
});
