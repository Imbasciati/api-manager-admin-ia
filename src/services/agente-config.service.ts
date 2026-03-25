import { prisma } from "../prisma/client";

/**
 * Lê uma configuração do agente.
 * Prioridade: banco de dados → variável de ambiente.
 */
export async function getConfig(chave: string): Promise<string | undefined> {
  const config = await prisma.configuracaoAgente.findUnique({ where: { chave } });
  if (config?.valor) return config.valor;
  return process.env[chave];
}

export async function getAllConfigs() {
  return prisma.configuracaoAgente.findMany({ orderBy: { chave: "asc" } });
}

export async function upsertConfig(chave: string, valor: string, meta?: { descricao?: string; sensivel?: boolean }): Promise<void> {
  await prisma.configuracaoAgente.upsert({
    where: { chave },
    create: { chave, valor, descricao: meta?.descricao, sensivel: meta?.sensivel ?? false },
    update: { valor },
  });
}
