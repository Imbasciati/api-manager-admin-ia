import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../prisma/client";
import { testarConexao } from "../services/unnichat.service";
import { asyncHandler } from "../utils/asyncHandler";
import { AppError } from "../utils/errors";
import { ok } from "../utils/response";

const conexaoSchema = z.object({
  nome:   z.string().min(2, "Nome obrigatório"),
  apiKey: z.string().min(10, "API Key inválida"),
  ativo:  z.boolean().optional().default(true),
});

/** Mascara a API Key para exibição — mostra só os últimos 6 caracteres */
function mascarar(key: string) {
  if (key.length <= 10) return "•".repeat(key.length);
  return "•".repeat(key.length - 6) + key.slice(-6);
}

/** GET /configuracoes/unnichat/conexoes */
export const listConexoes = asyncHandler(async (_req: Request, res: Response) => {
  const conexoes = await prisma.conexaoUnnichat.findMany({
    orderBy: { criadoEm: "asc" },
    include: { _count: { select: { agentes: true } } },
  });

  return ok(res, conexoes.map((c) => ({
    id:           c.id,
    nome:         c.nome,
    apiKeyMasked: mascarar(c.apiKey),
    ativo:        c.ativo,
    agentesCount: c._count.agentes,
    criadoEm:     c.criadoEm,
  })));
});

/** POST /configuracoes/unnichat/conexoes */
export const createConexao = asyncHandler(async (req: Request, res: Response) => {
  const body = conexaoSchema.safeParse(req.body);
  if (!body.success) throw new AppError(body.error.issues[0].message, 400, "VALIDATION_ERROR");

  const { nome, apiKey, ativo } = body.data;

  const conexao = await prisma.conexaoUnnichat.create({
    data: { nome, apiKey, ativo },
  });

  return ok(res, {
    id:           conexao.id,
    nome:         conexao.nome,
    apiKeyMasked: mascarar(conexao.apiKey),
    ativo:        conexao.ativo,
    agentesCount: 0,
    criadoEm:     conexao.criadoEm,
  }, 201);
});

/** PUT /configuracoes/unnichat/conexoes/:id */
export const updateConexao = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const body = conexaoSchema.partial().safeParse(req.body);
  if (!body.success) throw new AppError(body.error.issues[0].message, 400, "VALIDATION_ERROR");

  const existente = await prisma.conexaoUnnichat.findUnique({ where: { id } });
  if (!existente) throw new AppError("Conexão não encontrada", 404, "NOT_FOUND");

  // Se a API Key recebida é a mascarada (começa com •), mantém a atual
  const apiKey = body.data.apiKey?.startsWith("•") ? existente.apiKey : (body.data.apiKey ?? existente.apiKey);

  const conexao = await prisma.conexaoUnnichat.update({
    where: { id },
    data: {
      nome:  body.data.nome  ?? existente.nome,
      apiKey,
      ativo: body.data.ativo ?? existente.ativo,
    },
  });

  return ok(res, {
    id:           conexao.id,
    nome:         conexao.nome,
    apiKeyMasked: mascarar(conexao.apiKey),
    ativo:        conexao.ativo,
  });
});

/** DELETE /configuracoes/unnichat/conexoes/:id */
export const deleteConexao = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id);

  const existente = await prisma.conexaoUnnichat.findUnique({
    where: { id },
    include: { _count: { select: { agentes: true } } },
  });
  if (!existente) throw new AppError("Conexão não encontrada", 404, "NOT_FOUND");

  if (existente._count.agentes > 0) {
    throw new AppError(
      `Esta conexão está vinculada a ${existente._count.agentes} agente(s). Desvincule-os antes de excluir.`,
      400,
      "CONFLICT",
    );
  }

  await prisma.conexaoUnnichat.delete({ where: { id } });
  return ok(res, { deleted: true });
});

/** POST /configuracoes/unnichat/conexoes/:id/testar */
export const testarConexaoUnnichat = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const conexao = await prisma.conexaoUnnichat.findUnique({ where: { id } });
  if (!conexao) throw new AppError("Conexão não encontrada", 404, "NOT_FOUND");

  const resultado = await testarConexao(conexao.apiKey);
  return ok(res, resultado);
});
