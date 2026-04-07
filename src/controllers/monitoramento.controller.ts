
import { Request, Response } from "express";
import { StatusResposta } from "@prisma/client";
import { prisma } from "../prisma/client";
import { asyncHandler } from "../utils/asyncHandler";
import { ok } from "../utils/response";
import { listarEventos, resumoEventos } from "../services/evento-agente.service";
import { listarStatusConexoes, verificarAgente } from "../services/conexao-health.service";

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

// ── Eventos por agente ────────────────────────────────────────────────────────

/** Lista os eventos recebidos por um agente, com suporte a paginação e filtro de erros. */
export const eventosAgente = asyncHandler(async (req: Request, res: Response) => {
  const agenteId   = String(req.params.agenteId);
  const limit      = Math.min(Number(req.query.limit ?? 50), 200);
  const offset     = Number(req.query.offset ?? 0);
  const apenasErros = req.query.erros === "true";

  const [eventos, resumo] = await Promise.all([
    listarEventos(agenteId, { limit, offset, apenasErros }),
    resumoEventos(agenteId),
  ]);

  return ok(res, { eventos, resumo });
});

/** Lista erros de execução da IA (AgentExecution.erro) para um agente. */
export const errosAgente = asyncHandler(async (req: Request, res: Response) => {
  const agenteId = String(req.params.agenteId);
  const limit    = Math.min(Number(req.query.limit ?? 50), 200);

  const erros = await prisma.agentExecution.findMany({
    where: { agenteId, erro: { not: null } },
    select: {
      id: true,
      contactId: true,
      modelo: true,
      canal: true,
      inputMensagem: true,
      erro: true,
      duracao: true,
      criadoEm: true,
    },
    orderBy: { criadoEm: "desc" },
    take: limit,
  });

  return ok(res, erros);
});

// ── Conexões ──────────────────────────────────────────────────────────────────

/** Retorna o status de conectividade de todos os agentes ativos. */
export const conexoesStatus = asyncHandler(async (_req: Request, res: Response) => {
  const data = await listarStatusConexoes();
  return ok(res, data);
});

/** Força verificação imediata de um agente específico e retorna o resultado. */
export const verificarConexaoAgente = asyncHandler(async (req: Request, res: Response) => {
  const agenteId = String(req.params.agenteId);
  const resultado = await verificarAgente(agenteId);
  return ok(res, resultado);
});
