import { prisma } from "../prisma/client";
import { getConfig } from "./agente-config.service";
import type { TipoMidia } from "../types/agent.types";

// Timers de debounce por contactId — sem Redis, tudo em memória
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

export async function addMessage(
  contactId: string,
  tipo: TipoMidia,
  conteudo: string,
  mediaUrl?: string,
): Promise<void> {
  await prisma.messageBuffer.create({
    data: { contactId, tipo, conteudo, mediaUrl },
  });
}

export async function getPendingMessages(contactId: string) {
  return prisma.messageBuffer.findMany({
    where: { contactId, processado: false },
    orderBy: { criadoEm: "asc" },
  });
}

export async function markProcessed(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await prisma.messageBuffer.updateMany({
    where: { id: { in: ids } },
    data: { processado: true },
  });
}

export async function updateTranscricao(id: string, transcricao: string): Promise<void> {
  await prisma.messageBuffer.update({
    where: { id },
    data: { transcricao },
  });
}

/**
 * Agenda o processamento de um contactId com debounce.
 * Cada nova mensagem reinicia o timer; só processa depois de BUFFER_WINDOW_MS
 * sem novas mensagens do mesmo contato.
 * Lê BUFFER_WINDOW_MS do banco (configurável via UI), fallback para .env/padrão.
 */
export function scheduleProcessing(
  contactId: string,
  processor: (contactId: string) => Promise<void>,
): void {
  const existing = pendingTimers.get(contactId);
  if (existing) clearTimeout(existing);

  // Lê o window assincronamente, depois agenda o timer
  void getConfig("BUFFER_WINDOW_MS").then((windowMsStr) => {
    const windowMs = Number(windowMsStr ?? 2000);

    const timer = setTimeout(async () => {
      pendingTimers.delete(contactId);
      try {
        await processor(contactId);
      } catch (err) {
        console.error(`[buffer] Erro ao processar contactId=${contactId}:`, err);
      }
    }, windowMs);

    pendingTimers.set(contactId, timer);
  });
}
