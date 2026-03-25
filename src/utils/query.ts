import { Request } from "express";

export const parsePagination = (req: Request) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 10);
  const safePage = Number.isNaN(page) || page < 1 ? 1 : page;
  const safeLimit = Number.isNaN(limit) || limit < 1 ? 10 : Math.min(limit, 100);
  return {
    page: safePage,
    limit: safeLimit,
    skip: (safePage - 1) * safeLimit,
  };
};

export const parseDateRange = (req: Request) => {
  const de = req.query.de ? new Date(String(req.query.de)) : undefined;
  const ate = req.query.ate ? new Date(String(req.query.ate)) : undefined;
  return {
    gte: de && !Number.isNaN(de.getTime()) ? de : undefined,
    lte: ate && !Number.isNaN(ate.getTime()) ? ate : undefined,
  };
};

