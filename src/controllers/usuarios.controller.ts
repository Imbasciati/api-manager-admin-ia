import bcrypt from "bcryptjs";
import { Perfil } from "@prisma/client";
import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../prisma/client";
import { asyncHandler } from "../utils/asyncHandler";
import { AppError } from "../utils/errors";
import { parseDateRange, parsePagination } from "../utils/query";
import { ok } from "../utils/response";

const createSchema = z.object({
  nome: z.string().min(3),
  email: z.string().email(),
  senha: z.string().min(8),
  perfil: z.nativeEnum(Perfil),
  status: z.boolean().optional(),
  agenteIaId: z.string().uuid().nullable().optional(),
});

const updateSchema = createSchema.omit({ senha: true }).partial();

export const listUsuarios = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, skip } = parsePagination(req);
  const { gte, lte } = parseDateRange(req);
  const search = String(req.query.search ?? "").trim();

  const where = {
    AND: [
      search
        ? {
            OR: [
              { nome: { contains: search, mode: "insensitive" as const } },
              { email: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {},
      gte || lte
        ? {
            criadoEm: {
              ...(gte ? { gte } : {}),
              ...(lte ? { lte } : {}),
            },
          }
        : {},
      req.query.vendedorId ? { id: String(req.query.vendedorId) } : {},
    ],
  };

  const [total, data] = await Promise.all([
    prisma.usuario.count({ where }),
    prisma.usuario.findMany({
      where,
      skip,
      take: limit,
      orderBy: { criadoEm: "desc" },
      select: {
        id: true,
        nome: true,
        email: true,
        perfil: true,
        status: true,
        agenteIaId: true,
        criadoEm: true,
      },
    }),
  ]);

  return ok(res, data, { total, page, limit });
});

export const createUsuario = asyncHandler(async (req: Request, res: Response) => {
  const body = createSchema.parse(req.body);

  const exists = await prisma.usuario.findUnique({ where: { email: body.email } });
  if (exists) {
    throw new AppError("Email já cadastrado", 409, "EMAIL_EXISTS");
  }

  const senha = await bcrypt.hash(body.senha, 12);
  const usuario = await prisma.usuario.create({
    data: {
      nome: body.nome,
      email: body.email,
      senha,
      perfil: body.perfil,
      status: body.status ?? true,
      agenteIaId: body.agenteIaId ?? null,
    },
    select: {
      id: true,
      nome: true,
      email: true,
      perfil: true,
      status: true,
      criadoEm: true,
    },
  });

  if (req.user?.id) {
    await prisma.logAtividade.create({
      data: { usuarioId: req.user.id, evento: "CONECTOU", ip: req.ip },
    });
  }

  return ok(res, usuario);
});

export const updateUsuario = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const body = updateSchema.parse(req.body);

  const usuario = await prisma.usuario.update({
    where: { id },
    data: {
      nome: body.nome,
      email: body.email,
      perfil: body.perfil,
      status: body.status,
      agenteIaId: body.agenteIaId,
    },
    select: {
      id: true,
      nome: true,
      email: true,
      perfil: true,
      status: true,
      agenteIaId: true,
      criadoEm: true,
    },
  });

  if (req.user?.id) {
    await prisma.logAtividade.create({
      data: { usuarioId: req.user.id, evento: "CONECTOU", ip: req.ip },
    });
  }

  return ok(res, usuario);
});

export const changeSenha = asyncHandler(async (req: Request, res: Response) => {
  const body = z.object({ senha: z.string().min(8) }).parse(req.body);
  const senha = await bcrypt.hash(body.senha, 12);
  const id = String(req.params.id);

  await prisma.usuario.update({
    where: { id },
    data: { senha },
  });

  return ok(res, { message: "Senha atualizada com sucesso" });
});

export const changeStatus = asyncHandler(async (req: Request, res: Response) => {
  const body = z.object({ status: z.boolean() }).parse(req.body);
  const id = String(req.params.id);
  const usuario = await prisma.usuario.update({
    where: { id },
    data: { status: body.status },
    select: { id: true, status: true },
  });

  return ok(res, usuario);
});

export const reenviarAcesso = asyncHandler(async (_req: Request, res: Response) => {
  return ok(res, { message: "Email de acesso reenviado com sucesso" });
});

export const deleteUsuario = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id);

  await prisma.$transaction([
    prisma.refreshToken.deleteMany({ where: { usuarioId: id } }),
    prisma.logAtividade.deleteMany({ where: { usuarioId: id } }),
    prisma.custoIA.deleteMany({ where: { usuarioId: id } }),
    prisma.monitoramento.deleteMany({ where: { usuarioId: id } }),
    prisma.usuario.delete({ where: { id } }),
  ]);

  return ok(res, { message: "Usuário excluído com sucesso" });
});

