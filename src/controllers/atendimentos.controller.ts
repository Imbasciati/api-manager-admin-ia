import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../prisma/client";
import { addSseClient, broadcast, clientCount } from "../services/sse.service";
import { asyncHandler } from "../utils/asyncHandler";
import { AppError } from "../utils/errors";
import { parsePagination } from "../utils/query";
import { ok } from "../utils/response";

/** Lista atendimentos com filtros e paginação. */
export const listAtendimentos = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, skip } = parsePagination(req);

  const status     = req.query.status     as string | undefined;
  const campanha   = req.query.campanha   as string | undefined;
  const agenteId   = req.query.agenteId   as string | undefined;
  const dataInicio = req.query.dataInicio as string | undefined;
  const dataFim    = req.query.dataFim    as string | undefined;
  const search     = String(req.query.search ?? "").trim();

  const where: Record<string, unknown> = {};
  if (status)   where.status   = status;
  if (campanha) where.campanha = { contains: campanha, mode: "insensitive" };
  if (agenteId) where.agenteId = agenteId;

  if (dataInicio || dataFim) {
    where.criadoEm = {
      ...(dataInicio ? { gte: new Date(`${dataInicio}T00:00:00`) } : {}),
      ...(dataFim    ? { lte: new Date(`${dataFim}T23:59:59`)    } : {}),
    };
  }

  if (search) {
    where.OR = [
      { telefone:  { contains: search, mode: "insensitive" } },
      { nome:      { contains: search, mode: "insensitive" } },
      { nomeAgente:{ contains: search, mode: "insensitive" } },
    ];
  }

  const [total, data] = await Promise.all([
    prisma.atendimento.count({ where }),
    prisma.atendimento.findMany({
      where,
      skip,
      take: limit,
      orderBy: { atualizadoEm: "desc" },
      select: {
        id:          true,
        telefone:    true,
        nome:        true,
        campanha:    true,
        canal:       true,
        status:      true,
        agenteId:    true,
        nomeAgente:  true,
        criadoEm:    true,
        atualizadoEm:true,
        _count: { select: { mensagens: true } },
        mensagens: {
          orderBy: { criadoEm: "desc" },
          take: 1,
          select: { conteudo: true, criadoEm: true, origem: true },
        },
      },
    }),
  ]);

  return ok(res, data, { total, page, limit });
});

/** Busca um atendimento com todas as mensagens. */
export const getAtendimento = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const atendimento = await prisma.atendimento.findUnique({
    where: { id },
    include: {
      mensagens: { orderBy: { criadoEm: "asc" } },
    },
  });

  if (!atendimento) throw new AppError("Atendimento não encontrado", 404);
  return ok(res, atendimento);
});

/** Altera o status de um atendimento manualmente. */
export const updateStatus = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const { status } = z
    .object({ status: z.enum(["NOVO", "EM_ANDAMENTO", "AGUARDANDO", "FINALIZADO"]) })
    .parse(req.body);

  const atendimento = await prisma.atendimento.update({
    where: { id },
    data: { status },
  });

  broadcast("status_alterado", { atendimentoId: id, status });
  return ok(res, atendimento);
});

/** Exclui um atendimento e todas as mensagens (cascade). */
export const deleteAtendimento = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id);
  await prisma.atendimento.delete({ where: { id } });
  return ok(res, { message: "Atendimento excluído com sucesso" });
});

/** Lista apenas as mensagens de um atendimento. */
export const getMensagensAtendimento = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const mensagens = await prisma.mensagemAtendimento.findMany({
    where: { atendimentoId: id },
    orderBy: { criadoEm: "asc" },
  });
  return ok(res, mensagens);
});

/** SSE — stream de eventos em tempo real. */
export function sseAtendimentos(req: Request, res: Response) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // Evento inicial de confirmação
  res.write(`event: connected\ndata: {"clientes":${clientCount() + 1}}\n\n`);

  addSseClient(res);

  // Heartbeat a cada 25s para manter conexão viva
  const heartbeat = setInterval(() => {
    try {
      res.write(": heartbeat\n\n");
    } catch {
      clearInterval(heartbeat);
    }
  }, 25000);

  req.on("close", () => clearInterval(heartbeat));
}
