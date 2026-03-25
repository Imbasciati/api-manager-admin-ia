import { Perfil } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        perfil: Perfil;
      };
    }
  }
}

export {};

