import { Prisma } from "@prisma/client";
import { Request, Response } from "express";
import { format, subDays } from "date-fns";
import { prisma } from "../prisma/client";
import { asyncHandler } from "../utils/asyncHandler";
import { parsePagination } from "../utils/query";
import { ok } from "../utils/response";

export const custosResumo = asyncHandler(async (_req: Request, res: Response) => {
  const now = new Date();
  const inicioHoje = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1);

  const [hojeCount, hojeSum, mesCount, mesSum] = await Promise.all([
    prisma.custoIA.count({ where: { criadoEm: { gte: inicioHoje } } }),
    prisma.custoIA.aggregate({ where: { criadoEm: { gte: inicioHoje } }, _sum: { custoUsd: true } }),
    prisma.custoIA.count({ where: { criadoEm: { gte: inicioMes } } }),
    prisma.custoIA.aggregate({ where: { criadoEm: { gte: inicioMes } }, _sum: { custoUsd: true } }),
  ]);

  return ok(res, {
    chamadasHoje: hojeCount,
    custoHoje: hojeSum._sum.custoUsd ?? 0,
    chamadasMes: mesCount,
    custoMes: mesSum._sum.custoUsd ?? 0,
  });
});

export const custosPorModelo = asyncHandler(async (req: Request, res: Response) => {
  const where: Prisma.CustoIAWhereInput = req.query.modelo ? { modelo: String(req.query.modelo) } : {};
  const rows = await prisma.custoIA.groupBy({
    by: ["modelo"],
    where,
    _count: { _all: true },
    _sum: { custoUsd: true, inputTokens: true, outputTokens: true },
  });

  return ok(res, rows);
});

export const custosPorVendedor = asyncHandler(async (_req: Request, res: Response) => {
  const rows = await prisma.custoIA.groupBy({
    by: ["usuarioId"],
    _count: { _all: true },
    _sum: { custoUsd: true },
  });

  const ids = rows.map((r) => r.usuarioId);
  const usuarios = await prisma.usuario.findMany({ where: { id: { in: ids } } });

  return ok(
    res,
    rows.map((r) => ({
      usuarioId: r.usuarioId,
      nome: usuarios.find((u) => u.id === r.usuarioId)?.nome ?? "Desconhecido",
      chamadas: r._count._all,
      custoUsd: r._sum.custoUsd ?? 0,
    })),
  );
});

export const custosTendencia = asyncHandler(async (_req: Request, res: Response) => {
  const inicio = subDays(new Date(), 30);
  const rows = await prisma.custoIA.findMany({
    where: { criadoEm: { gte: inicio } },
    select: { criadoEm: true, custoUsd: true },
  });

  const map = new Map<string, number>();
  rows.forEach((r) => {
    const dia = format(r.criadoEm, "yyyy-MM-dd");
    map.set(dia, (map.get(dia) ?? 0) + r.custoUsd);
  });

  return ok(
    res,
    [...map.entries()].map(([dia, custo]) => ({ dia, custo })).sort((a, b) => a.dia.localeCompare(b.dia)),
  );
});

export const custosLog = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, skip } = parsePagination(req);
  const where: Prisma.CustoIAWhereInput = {
    ...(req.query.vendedorId ? { usuarioId: String(req.query.vendedorId) } : {}),
    ...(req.query.modelo ? { modelo: String(req.query.modelo) } : {}),
  };

  const [total, data] = await Promise.all([
    prisma.custoIA.count({ where }),
    prisma.custoIA.findMany({
      where,
      include: { usuario: { select: { nome: true } }, agente: { select: { nome: true } } },
      orderBy: { criadoEm: "desc" },
      skip,
      take: limit,
    }),
  ]);

  return ok(res, data, { total, page, limit });
});

