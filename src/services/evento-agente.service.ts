import { Prisma } from "@prisma/client";
import { prisma } from "../prisma/client";

export type TipoEvento =
  | "MENSAGEM_RECEBIDA"
  | "LOTE_PROCESSADO"
  | "ERRO_WEBHOOK";

export interface LogEventoParams {
  agenteId: string;
  tipo: TipoEvento;
  canal?: string;
  contactId?: string;
  payload: object;
  erro?: string;
}

/**
 * Persiste um evento recebido pelo agente para auditoria e monitoramento.
 * Fire-and-forget — não lança exceções para não bloquear o fluxo principal.
 */
export async function logEvento(params: LogEventoParams): Promise<void> {
  try {
    await prisma.eventoAgente.create({
      data: {
        agenteId:  params.agenteId,
        tipo:      params.tipo,
        canal:     params.canal ?? "unnichat",
        contactId: params.contactId ?? null,
        payload:   params.payload as Prisma.InputJsonValue,
        erro:      params.erro ?? null,
      },
    });
  } catch (err) {
    // Nunca lança — logging não pode quebrar o fluxo principal
    console.error("[evento-agente] Falha ao persistir evento:", err instanceof Error ? err.message : err);
  }
}

/** Lista eventos de um agente com paginação (mais recentes primeiro). */
export async function listarEventos(
  agenteId: string,
  opts: { limit?: number; offset?: number; apenasErros?: boolean } = {},
) {
  const { limit = 50, offset = 0, apenasErros = false } = opts;

  return prisma.eventoAgente.findMany({
    where: {
      agenteId,
      ...(apenasErros ? { erro: { not: null } } : {}),
    },
    orderBy: { criadoEm: "desc" },
    take: limit,
    skip: offset,
  });
}

/** Conta totais de eventos e erros de um agente nas últimas 24h. */
export async function resumoEventos(agenteId: string) {
  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [total, erros] = await Promise.all([
    prisma.eventoAgente.count({ where: { agenteId, criadoEm: { gte: desde } } }),
    prisma.eventoAgente.count({ where: { agenteId, criadoEm: { gte: desde }, erro: { not: null } } }),
  ]);

  return { total, erros, desde };
}
