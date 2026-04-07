import { prisma } from "../prisma/client";
import { testarConexao } from "./unnichat.service";

export type StatusConexao = "ONLINE" | "OFFLINE" | "ERRO" | "DESCONHECIDO";

/**
 * Verifica a conectividade de um agente específico com o Unnichat
 * e persiste o resultado em ConexaoStatus.
 */
export async function verificarAgente(agenteId: string): Promise<{
  status: StatusConexao;
  detalhe: string;
}> {
  const agente = await prisma.agente.findUnique({
    where: { id: agenteId },
    select: { id: true, unnichatAtivo: true, unnichatApiKey: true },
  });

  if (!agente) {
    return { status: "ERRO", detalhe: "Agente não encontrado" };
  }

  if (!agente.unnichatAtivo || !agente.unnichatApiKey) {
    const detalhe = !agente.unnichatAtivo
      ? "Integração Unnichat inativa"
      : "API Key não configurada";

    await upsertStatus(agenteId, "OFFLINE", detalhe);
    return { status: "OFFLINE", detalhe };
  }

  const resultado = await testarConexao(agente.unnichatApiKey);
  const status: StatusConexao = resultado.ok ? "ONLINE" : "ERRO";

  await upsertStatus(agenteId, status, resultado.mensagem);
  return { status, detalhe: resultado.mensagem };
}

/** Roda verificação em paralelo para todos os agentes com Unnichat ativo. */
export async function verificarTodos(): Promise<void> {
  const agentes = await prisma.agente.findMany({
    where: { unnichatAtivo: true, ativo: true },
    select: { id: true },
  });

  await Promise.allSettled(agentes.map((a) => verificarAgente(a.id)));
  console.log(`[conexao-health] Verificação concluída — ${agentes.length} agentes checados`);
}

/** Retorna o status salvo de todos os agentes (join com Agente). */
export async function listarStatusConexoes() {
  const [agentes, statuses] = await Promise.all([
    prisma.agente.findMany({
      where: { ativo: true },
      select: { id: true, nome: true, unnichatAtivo: true },
      orderBy: { nome: "asc" },
    }),
    prisma.conexaoStatus.findMany(),
  ]);

  const statusMap = new Map(statuses.map((s) => [s.agenteId, s]));

  return agentes.map((a) => {
    const s = statusMap.get(a.id);
    return {
      agenteId:     a.id,
      nome:         a.nome,
      unnichatAtivo: a.unnichatAtivo,
      status:       (s?.status ?? "DESCONHECIDO") as StatusConexao,
      detalhe:      s?.detalhe ?? null,
      verificadoEm: s?.verificadoEm ?? null,
    };
  });
}

// ── helpers ───────────────────────────────────────────────────────────────────

async function upsertStatus(
  agenteId: string,
  status: StatusConexao,
  detalhe: string,
): Promise<void> {
  await prisma.conexaoStatus.upsert({
    where: { agenteId },
    create: { agenteId, status, detalhe, verificadoEm: new Date() },
    update: { status, detalhe, verificadoEm: new Date() },
  });
}

// ── Background polling ────────────────────────────────────────────────────────

const INTERVALO_MS = 5 * 60 * 1000; // 5 minutos
let intervalo: ReturnType<typeof setInterval> | null = null;

/** Inicia o polling periódico de saúde das conexões. */
export function iniciarMonitoramentoConexoes(): void {
  if (intervalo) return; // já rodando

  // Primeira verificação logo ao iniciar
  void verificarTodos();

  intervalo = setInterval(() => {
    void verificarTodos();
  }, INTERVALO_MS);

  console.log(`[conexao-health] Monitoramento iniciado (intervalo: ${INTERVALO_MS / 1000}s)`);
}

/** Para o polling (útil para testes ou shutdown gracioso). */
export function pararMonitoramentoConexoes(): void {
  if (intervalo) {
    clearInterval(intervalo);
    intervalo = null;
  }
}
