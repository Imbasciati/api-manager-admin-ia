import { Prisma } from "@prisma/client";
import { Request, Response } from "express";
import { prisma } from "../prisma/client";
import { asyncHandler } from "../utils/asyncHandler";
import { parsePagination } from "../utils/query";
import { ok } from "../utils/response";

export const logsAtivos = asyncHandler(async (_req: Request, res: Response) => {
  const limite = new Date(Date.now() - 15 * 60 * 1000);
  const ativos = await prisma.logAtividade.findMany({
    where: { evento: "CONECTOU", criadoEm: { gte: limite } },
    distinct: ["usuarioId"],
    orderBy: { criadoEm: "desc" },
    include: { usuario: { select: { id: true, nome: true, email: true, perfil: true } } },
  });
  return ok(res, ativos);
});

export const logsHistorico = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, skip } = parsePagination(req);
  const where: Prisma.LogAtividadeWhereInput = {
    ...(req.query.vendedorId ? { usuarioId: String(req.query.vendedorId) } : {}),
  };

  const [total, data] = await Promise.all([
    prisma.logAtividade.count({ where }),
    prisma.logAtividade.findMany({
      where,
      include: { usuario: { select: { nome: true, email: true, perfil: true } } },
      skip,
      take: limit,
      orderBy: { criadoEm: "desc" },
    }),
  ]);

  return ok(res, data, { total, page, limit });
});

/**
 * Retorna resumo agrupado por usuário:
 * total de ações, último acesso, horário de conexão/desconexão, tempo de sessão.
 */
export const logsPorUsuario = asyncHandler(async (_req: Request, res: Response) => {
  // 4 queries totais independentemente do número de usuários (elimina N+1)
  const [usuarios, totaisPorUsuario, conexoesPorUsuario, ultimasSessoes] = await Promise.all([
    prisma.usuario.findMany({
      where: { logs: { some: {} } },
      select: {
        id: true,
        nome: true,
        email: true,
        perfil: true,
        logs: {
          orderBy: { criadoEm: "desc" },
          take: 1,
          select: { criadoEm: true, ip: true },
        },
      },
      orderBy: { nome: "asc" },
    }),
    prisma.logAtividade.groupBy({
      by: ["usuarioId"],
      _count: { id: true },
    }),
    prisma.logAtividade.groupBy({
      by: ["usuarioId"],
      where: { evento: "CONECTOU" },
      _count: { id: true },
    }),
    prisma.logAtividade.findMany({
      where: { evento: "CONECTOU" },
      orderBy: { criadoEm: "desc" },
      distinct: ["usuarioId"],
      select: { usuarioId: true, criadoEm: true, ip: true, duracaoSessao: true },
    }),
  ]);

  const totaisMap = new Map(totaisPorUsuario.map((r) => [r.usuarioId, r._count.id]));
  const conexoesMap = new Map(conexoesPorUsuario.map((r) => [r.usuarioId, r._count.id]));
  const sessoesMap = new Map(ultimasSessoes.map((s) => [s.usuarioId, s]));

  const resultado = usuarios.map((u) => ({
    usuario: { id: u.id, nome: u.nome, email: u.email, perfil: u.perfil },
    totalAcoes: totaisMap.get(u.id) ?? 0,
    totalConexoes: conexoesMap.get(u.id) ?? 0,
    ultimaAtividade: u.logs[0]?.criadoEm ?? null,
    ultimoIp: u.logs[0]?.ip ?? null,
    ultimaSessao: sessoesMap.get(u.id) ?? null,
  }));

  return ok(res, resultado);
});

/**
 * Retorna todos os logs de um usuário específico, paginados.
 */
export const logsDetalheUsuario = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, skip } = parsePagination(req);
  const usuarioId = String(req.params.usuarioId);

  const where: Prisma.LogAtividadeWhereInput = { usuarioId };

  const [total, data] = await Promise.all([
    prisma.logAtividade.count({ where }),
    prisma.logAtividade.findMany({
      where,
      skip,
      take: limit,
      orderBy: { criadoEm: "desc" },
      select: {
        id: true,
        evento: true,
        acao: true,
        descricao: true,
        entidade: true,
        entidadeId: true,
        ip: true,
        duracaoSessao: true,
        criadoEm: true,
      },
    }),
  ]);

  return ok(res, data, { total, page, limit });
});
