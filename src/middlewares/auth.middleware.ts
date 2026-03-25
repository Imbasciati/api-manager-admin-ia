import { Perfil } from "@prisma/client";
import { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../utils/jwt";
import { fail } from "../utils/response";

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  // SSE connections não suportam headers — aceita token via query param como fallback
  const queryToken = req.query.token as string | undefined;

  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.replace("Bearer ", "")
    : queryToken ?? null;

  if (!token) {
    return fail(res, 401, "Token de acesso ausente", "UNAUTHORIZED");
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = {
      id: payload.sub,
      email: payload.email,
      perfil: payload.perfil as Perfil,
    };
    return next();
  } catch {
    return fail(res, 401, "Token inválido ou expirado", "UNAUTHORIZED");
  }
};


