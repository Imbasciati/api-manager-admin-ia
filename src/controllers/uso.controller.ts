import { Prisma } from "@prisma/client";
import { Request, Response } from "express";
import { format } from "date-fns";
import { prisma } from "../prisma/client";
import { asyncHandler } from "../utils/asyncHandler";
import { parseDateRange } from "../utils/query";
import { ok } from "../utils/response";

export const usoResumo = asyncHandler(async (req: Request, res: Response) => {
  const { gte, lte } = parseDateRange(req);

  const where: Prisma.MonitoramentoWhereInput = {
    ...(req.query.vendedorId ? { usuarioId: String(req.query.vendedorId) } : {}),
    ...(gte || lte ? { criadoEm: { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) } } : {}),
  };

  const [total, grouped] = await Promise.all([
    prisma.monitoramento.count({ where }),
    prisma.monitoramento.groupBy({ by: ["statusResposta"], where, _count: { _all: true } }),
  ]);

  return ok(res, {
    total,
    sugestoes: grouped.find((g) => g.statusResposta === "SUGESTAO")?._count._all ?? 0,
    autoRespostas: grouped.find((g) => g.statusResposta === "AUTO_RESPOSTA")?._count._all ?? 0,
    editadas: grouped.find((g) => g.statusResposta === "EDITADA")?._count._all ?? 0,
    ignoradas: grouped.find((g) => g.statusResposta === "IGNORADA")?._count._all ?? 0,
  });
});

export const usoPorHora = asyncHandler(async (req: Request, res: Response) => {
  const { gte, lte } = parseDateRange(req);
  const rows = await prisma.monitoramento.findMany({
    where: {
      ...(req.query.vendedorId ? { usuarioId: String(req.query.vendedorId) } : {}),
      ...(gte || lte ? { criadoEm: { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) } } : {}),
    },
    select: { criadoEm: true, statusResposta: true },
  });

  const map = new Map<string, { hora: string; total: number; auto: number }>();

  rows.forEach((row) => {
    const key = format(row.criadoEm, "HH:00");
    const item = map.get(key) ?? { hora: key, total: 0, auto: 0 };
    item.total += 1;
    if (row.statusResposta === "AUTO_RESPOSTA") {
      item.auto += 1;
    }
    map.set(key, item);
  });

  return ok(res, [...map.values()].sort((a, b) => a.hora.localeCompare(b.hora)));
});

