import { NextFunction, Request, Response } from "express";
import { prisma } from "../prisma/client";
import { logger } from "../utils/logger";

export const errorHandlerMiddleware = async (
  err: { statusCode?: number; message?: string; code?: string; stack?: string },
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  const status = err.statusCode ?? 500;
  const message = err.message ?? "Erro interno no servidor";

  logger.error("request_error", {
    message,
    status,
    stack: err.stack,
    path: req.path,
    method: req.method,
    userId: req.user?.id,
  });

  // Fire-and-forget — não bloqueia a resposta HTTP
  prisma.erroSistema
    .create({
      data: {
        severidade: status >= 500 ? "CRITICAL" : "ERROR",
        categoria: "API",
        mensagem: `${req.method} ${req.path}: ${message}`,
        usuarioId: req.user?.id,
        origem: "backend",
      },
    })
    .catch(() => undefined);

  return res.status(status).json({
    success: false,
    error: message,
    ...(err.code ? { code: err.code } : {}),
  });
};

