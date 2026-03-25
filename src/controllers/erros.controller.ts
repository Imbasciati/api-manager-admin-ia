import { Prisma, Severidade } from "@prisma/client";
import { Request, Response } from "express";
import { prisma } from "../prisma/client";
import { asyncHandler } from "../utils/asyncHandler";
import { parsePagination } from "../utils/query";
import { ok } from "../utils/response";

export const errosResumo = asyncHandler(async (_req: Request, res: Response) => {
  const inicioHoje = new Date();
  inicioHoje.setHours(0, 0, 0, 0);

  const [errosHoje, criticos, frequente, ultimo] = await Promise.all([
    prisma.erroSistema.count({ where: { criadoEm: { gte: inicioHoje } } }),
    prisma.erroSistema.count({ where: { severidade: "CRITICAL" } }),
    prisma.erroSistema.groupBy({
      by: ["categoria"],
      _count: { _all: true },
      orderBy: { _count: { categoria: "desc" } },
      take: 1,
    }),
    prisma.erroSistema.findFirst({ orderBy: { criadoEm: "desc" } }),
  ]);

  return ok(res, {
    errosHoje,
    criticos,
    maisFrequente: frequente[0]?.categoria ?? "N/A",
    ultimo,
  });
});

export const errosList = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, skip } = parsePagination(req);
  const where: Prisma.ErroSistemaWhereInput = {
    ...(req.query.severidade ? { severidade: String(req.query.severidade) as Severidade } : {}),
    ...(req.query.categoria
      ? { categoria: { contains: String(req.query.categoria), mode: "insensitive" } }
      : {}),
  };

  const [total, data] = await Promise.all([
    prisma.erroSistema.count({ where }),
    prisma.erroSistema.findMany({ where, skip, take: limit, orderBy: { criadoEm: "desc" } }),
  ]);

  return ok(res, data, { total, page, limit });
});


