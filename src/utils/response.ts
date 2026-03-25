import { Response } from "express";

export const ok = (res: Response, data: unknown, meta?: unknown) => {
  return res.json({ success: true, data, ...(meta ? { meta } : {}) });
};

export const fail = (res: Response, status: number, error: string, code?: string) => {
  return res.status(status).json({ success: false, error, ...(code ? { code } : {}) });
};

