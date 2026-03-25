import { Request, Response } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { prisma } from "../prisma/client";
import { asyncHandler } from "../utils/asyncHandler";
import { AppError } from "../utils/errors";
import { ok } from "../utils/response";

const schema = z.object({
  nome: z.string().min(2),
  descricao: z.string().optional().nullable(),
  ativo: z.boolean().optional(),
});

export const listWebhooks = asyncHandler(async (_req: Request, res: Response) => {
  const webhooks = await prisma.configuracaoWebhook.findMany({
    orderBy: { criadoEm: "desc" },
  });
  return ok(res, webhooks);
});

export const createWebhook = asyncHandler(async (req: Request, res: Response) => {
  const body = schema.parse(req.body);
  const webhook = await prisma.configuracaoWebhook.create({
    data: { ...body, token: randomUUID() },
  });
  return ok(res, webhook);
});

export const updateWebhook = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const body = schema.partial().parse(req.body);
  const webhook = await prisma.configuracaoWebhook.update({
    where: { id },
    data: body,
  });
  return ok(res, webhook);
});

export const regenerarToken = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const webhook = await prisma.configuracaoWebhook.update({
    where: { id },
    data: { token: randomUUID() },
  });
  return ok(res, webhook);
});

export const deleteWebhook = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const exists = await prisma.configuracaoWebhook.findUnique({ where: { id } });
  if (!exists) throw new AppError("Webhook não encontrado", 404);
  await prisma.configuracaoWebhook.delete({ where: { id } });
  return ok(res, { message: "Webhook excluído com sucesso" });
});
