import { Perfil } from "@prisma/client";
import { NextFunction, Request, Response } from "express";
import { fail } from "../utils/response";

export const roleMiddleware = (...roles: Perfil[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return fail(res, 401, "Não autenticado", "UNAUTHORIZED");
    }
    if (!roles.includes(req.user.perfil)) {
      return fail(res, 403, "Acesso negado", "FORBIDDEN");
    }
    return next();
  };
};

