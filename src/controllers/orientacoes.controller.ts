import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../prisma/client";
import { asyncHandler } from "../utils/asyncHandler";
import { ok } from "../utils/response";

export const getOrientacoes = asyncHandler(async (_req: Request, res: Response) => {
  let orientacao = await prisma.orientacaoGlobal.findFirst();
  if (!orientacao) {
    orientacao = await prisma.orientacaoGlobal.create({
      data: {
        conteudo:
          "Você é um assistente de vendas no WhatsApp. Responda com clareza, empatia, objetividade e foco em conversão responsável.",
      },
    });
  }

  return ok(res, orientacao);
});

export const updateOrientacoes = asyncHandler(async (req: Request, res: Response) => {
  const body = z.object({ conteudo: z.string().min(10) }).parse(req.body);
  const current = await prisma.orientacaoGlobal.findFirst();

  const orientacao = current
    ? await prisma.orientacaoGlobal.update({ where: { id: current.id }, data: { conteudo: body.conteudo } })
    : await prisma.orientacaoGlobal.create({ data: { conteudo: body.conteudo } });

  return ok(res, orientacao);
});

export const restoreOrientacoes = asyncHandler(async (_req: Request, res: Response) => {
  const defaultText =
    "Instrução global padrão Beta Admin IA: mantenha tom profissional, personalize com nome do cliente, destaque benefícios e finalize com CTA claro.";

  const current = await prisma.orientacaoGlobal.findFirst();
  const orientacao = current
    ? await prisma.orientacaoGlobal.update({ where: { id: current.id }, data: { conteudo: defaultText } })
    : await prisma.orientacaoGlobal.create({ data: { conteudo: defaultText } });

  return ok(res, orientacao);
});

