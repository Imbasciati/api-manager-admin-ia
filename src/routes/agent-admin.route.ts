import { Router } from "express";
import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ok } from "../utils/response";
import * as executionLogger from "../services/execution-logger.service";
import * as memoryService from "../services/conversation-memory.service";
import { parsePagination } from "../utils/query";

export const agentAdminRouter = Router();

/** GET /api/agents/executions?page=&limit=&contactId= */
agentAdminRouter.get(
  "/executions",
  asyncHandler(async (req: Request, res: Response) => {
    const { page, limit } = parsePagination(req);
    const contactId = req.query.contactId ? String(req.query.contactId) : undefined;
    const result = await executionLogger.listExecutions({ page, limit, contactId });
    return ok(res, result.data, { total: result.total, page: result.page, limit: result.limit });
  }),
);

/** GET /api/agents/executions/stats */
agentAdminRouter.get(
  "/executions/stats",
  asyncHandler(async (_req: Request, res: Response) => {
    const stats = await executionLogger.getStats();
    return ok(res, stats);
  }),
);

/** GET /api/agents/memory/:contactId */
agentAdminRouter.get(
  "/memory/:contactId",
  asyncHandler(async (req: Request, res: Response) => {
    const memory = await memoryService.getMemory(String(req.params.contactId));
    return ok(res, memory);
  }),
);

/** DELETE /api/agents/memory/:contactId */
agentAdminRouter.delete(
  "/memory/:contactId",
  asyncHandler(async (req: Request, res: Response) => {
    await memoryService.clearMemory(String(req.params.contactId));
    return ok(res, { cleared: true });
  }),
);
