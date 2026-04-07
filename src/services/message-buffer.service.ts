import { prisma } from "../prisma/client";
import { getConfig } from "./agente-config.service";
import type { TipoMidia } from "../types/agent.types";

// Timers de debounce por contactId — sem Redis, tudo em memória
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Cache do window de debounce — evita race condition ao definir timer sincronamente
let cachedWindowMs = 4000;
let windowCacheLoaded = false;

async function loadWindowMs(): Promise<void> {
  try {
    const val = await getConfig("BUFFER_WINDOW_MS");
    if (val) cachedWindowMs = Number(val);
    windowCacheLoaded = true;
  } catch {
    // mantém valor padrão em caso de falha
  }
}

// Pré-carrega na inicialização do módulo
void loadWindowMs();

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
 * Cada nova mensagem reinicia o timer; só processa depois de cachedWindowMs
 * sem novas mensagens do mesmo contato.
 *
 * O timer é definido SINCRONAMENTE usando cachedWindowMs para que o
 * clearTimeout funcione corretamente mesmo com mensagens em rápida sucessão.
 * O cache é atualizado de forma assíncrona após cada disparo.
 */
export function scheduleProcessing(
  contactId: string,
  processor: (contactId: string) => Promise<void>,
): void {
  const existing = pendingTimers.get(contactId);
  if (existing) clearTimeout(existing);

  // Timer definido sincronamente — sem race condition
  const timer = setTimeout(async () => {
    pendingTimers.delete(contactId);
    // Atualiza cache para o próximo ciclo
    void loadWindowMs();
    try {
      await processor(contactId);
    } catch (err) {
      console.error(`[buffer] Erro ao processar contactId=${contactId}:`, err);
    }
  }, cachedWindowMs);

  pendingTimers.set(contactId, timer);
}
