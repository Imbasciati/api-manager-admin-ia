import { prisma } from "../prisma/client";
import type { ChatMessage } from "../types/agent.types";

const CONTEXT_WINDOW = Number(process.env.CONVERSATION_CONTEXT_WINDOW ?? 50);

/** Retorna o histórico de mensagens do contato, limitado ao CONTEXT_WINDOW. */
export async function getMemory(contactId: string): Promise<ChatMessage[]> {
  const memory = await prisma.conversationMemory.findUnique({ where: { contactId } });
  if (!memory) return [];
  const historico = memory.historico as unknown as ChatMessage[];
  return historico.slice(-CONTEXT_WINDOW);
}

/** Adiciona o par user/assistant ao histórico, respeitando o CONTEXT_WINDOW. */
export async function updateMemory(
  contactId: string,
  userMsg: string,
  assistantMsg: string,
): Promise<void> {
  const current = await getMemory(contactId);

  const updated = [
    ...current,
    { role: "user" as const, content: userMsg },
    { role: "assistant" as const, content: assistantMsg },
  ].slice(-CONTEXT_WINDOW);

  const historico = updated as unknown as Record<string, string>[];

  await prisma.conversationMemory.upsert({
    where: { contactId },
    create: { contactId, historico },
    update: { historico },
  });
}

/** Apaga todo o histórico de um contato. */
export async function clearMemory(contactId: string): Promise<void> {
  await prisma.conversationMemory.deleteMany({ where: { contactId } });
}
