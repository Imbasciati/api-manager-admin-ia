import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../prisma/client";
import { asyncHandler } from "../utils/asyncHandler";
import { AppError } from "../utils/errors";
import { parsePagination } from "../utils/query";
import { ok } from "../utils/response";

function asString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

const modeloSchema = z.object({
  nome: z.string().min(2),
  modelId: z.string().min(2),
  provider: z.string().min(2),
  descricao: z.string().optional().nullable(),
  ativo: z.boolean().optional(),
  custoInputPorMilToken: z.number().min(0).optional(),
  custoOutputPorMilToken: z.number().min(0).optional(),
});

export const listModelos = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, skip } = parsePagination(req);

  const ativo = asString(req.query.ativo);

  const where = ativo !== undefined
    ? { ativo: ativo === "true" }
    : {};

  const [total, data] = await Promise.all([
    prisma.modeloIA.count({ where }),
    prisma.modeloIA.findMany({
      where,
      skip,
      take: limit,
      orderBy: { criadoEm: "desc" },
    }),
  ]);

  return ok(res, data, { total, page, limit });
});

export const getModelo = asyncHandler(async (req: Request, res: Response) => {
  const id = asString(req.params.id);

  if (!id) throw new AppError("ID do modelo inválido", 400);

  const modelo = await prisma.modeloIA.findUnique({ where: { id } });
  if (!modelo) throw new AppError("Modelo não encontrado", 404);

  return ok(res, modelo);
});

export const createModelo = asyncHandler(async (req: Request, res: Response) => {
  const body = modeloSchema.parse(req.body);

  const existing = await prisma.modeloIA.findUnique({ where: { modelId: body.modelId } });
  if (existing) throw new AppError("Já existe um modelo com esse ID", 409);

  const modelo = await prisma.modeloIA.create({ data: body });
  return ok(res, modelo);
});

export const updateModelo = asyncHandler(async (req: Request, res: Response) => {
  const id = asString(req.params.id);

  if (!id) throw new AppError("ID do modelo inválido", 400);

  const body = modeloSchema.partial().parse(req.body);

  if (body.modelId) {
    const existing = await prisma.modeloIA.findFirst({
      where: { modelId: body.modelId, NOT: { id } },
    });
    if (existing) throw new AppError("Já existe um modelo com esse ID", 409);
  }

  const modelo = await prisma.modeloIA.update({
    where: { id },
    data: body,
  });

  return ok(res, modelo);
});

export const changeModeloStatus = asyncHandler(async (req: Request, res: Response) => {
  const id = asString(req.params.id);

  if (!id) throw new AppError("ID do modelo inválido", 400);

  const { ativo } = z.object({ ativo: z.boolean() }).parse(req.body);

  const modelo = await prisma.modeloIA.update({
    where: { id },
    data: { ativo },
  });

  return ok(res, modelo);
});

export const deleteModelo = asyncHandler(async (req: Request, res: Response) => {
  const id = asString(req.params.id);

  if (!id) throw new AppError("ID do modelo inválido", 400);

  await prisma.modeloIA.delete({ where: { id } });
  return ok(res, { message: "Modelo excluído com sucesso" });
});