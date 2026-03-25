import bcrypt from "bcryptjs";
import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../prisma/client";
import { AppError } from "../utils/errors";
import { asyncHandler } from "../utils/asyncHandler";
import {
  refreshExpiryDate,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../utils/jwt";
import { ok } from "../utils/response";

const loginSchema = z.object({
  email: z.string().email(),
  senha: z.string().min(6),
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, senha } = loginSchema.parse(req.body);

  const usuario = await prisma.usuario.findUnique({ where: { email } });
  if (!usuario || !usuario.status) {
    throw new AppError("Credenciais inválidas", 401, "INVALID_CREDENTIALS");
  }

  const valid = await bcrypt.compare(senha, usuario.senha);
  if (!valid) {
    throw new AppError("Credenciais inválidas", 401, "INVALID_CREDENTIALS");
  }

  const payload = { sub: usuario.id, email: usuario.email, perfil: usuario.perfil };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      usuarioId: usuario.id,
      expiresAt: refreshExpiryDate(),
    },
  });

  await prisma.logAtividade.create({
    data: { usuarioId: usuario.id, evento: "CONECTOU", ip: req.ip },
  });

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  return ok(
    res,
    {
      accessToken,
      refreshToken,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        perfil: usuario.perfil,
        status: usuario.status,
      },
    },
  );
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const token = (req.body.refreshToken as string | undefined) ?? req.cookies?.refreshToken;
  if (!token) {
    throw new AppError("Refresh token não informado", 401, "REFRESH_REQUIRED");
  }

  const dbToken = await prisma.refreshToken.findUnique({ where: { token } });
  if (!dbToken || dbToken.expiresAt < new Date()) {
    throw new AppError("Refresh token inválido", 401, "INVALID_REFRESH");
  }

  const payload = verifyRefreshToken(token);
  const accessToken = signAccessToken({
    sub: payload.sub,
    email: payload.email,
    perfil: payload.perfil,
  });

  return ok(res, { accessToken });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const token = (req.body.refreshToken as string | undefined) ?? req.cookies?.refreshToken;
  if (token) {
    await prisma.refreshToken.deleteMany({ where: { token } });
  }

  if (req.user?.id) {
    await prisma.logAtividade.create({
      data: { usuarioId: req.user.id, evento: "DESCONECTOU", ip: req.ip },
    });
  }

  res.clearCookie("refreshToken");
  return ok(res, { message: "Logout realizado" });
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user?.id) {
    throw new AppError("Não autenticado", 401, "UNAUTHORIZED");
  }

  const usuario = await prisma.usuario.findUnique({
    where: { id: req.user.id },
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

  return ok(res, usuario);
});

