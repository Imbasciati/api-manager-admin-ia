import { Router } from "express";
import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ok, fail } from "../utils/response";
import * as bufferService from "../services/message-buffer.service";
import { processContact } from "../services/message-processor.service";
import type { ManyChatPayload, TipoMidia } from "../types/agent.types";

export const webhookRouter = Router();

/**
 * POST /webhook/manychat
 * Endpoint público (sem JWT) para receber mensagens do ManyChat.
 * Aceita texto, áudio (.ogg) e imagem.
 */
webhookRouter.post(
  "/manychat",
  asyncHandler(async (req: Request, res: Response) => {
    const payload = req.body as ManyChatPayload;

    if (!payload.subscriber_id) {
      return fail(res, 400, "subscriber_id obrigatório", "VALIDATION_ERROR");
    }

    const tipo: TipoMidia = payload.type ?? "text";
    const conteudo = payload.text ?? payload.media_url ?? "";

    if (!conteudo) {
      return ok(res, { received: true, skipped: true });
    }

    await bufferService.addMessage(
      payload.subscriber_id,
      tipo,
      conteudo,
      tipo !== "text" ? payload.media_url : undefined,
    );

    // Processa após BUFFER_WINDOW_MS sem novas mensagens do mesmo contato
    bufferService.scheduleProcessing(payload.subscriber_id, processContact);

    return ok(res, { received: true });
  }),
);
