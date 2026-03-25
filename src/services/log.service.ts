import { EventoLog } from "@prisma/client";
import { prisma } from "../prisma/client";

interface LogInput {
  usuarioId: string;
  ip?: string;
  evento?: EventoLog;
  acao: string;
  descricao: string;
  entidade?: string;
  entidadeId?: string;
  metadados?: Record<string, unknown>;
}

/**
 * Registra uma ação do usuário no banco de dados.
 * Nunca lança exceções — falhas de log não devem interromper o fluxo principal.
 */
export async function registrarLog(input: LogInput): Promise<void> {
  await prisma.logAtividade
    .create({
      data: {
        usuarioId: input.usuarioId,
        ip: input.ip,
        evento: input.evento ?? "CONECTOU",
        acao: input.acao,
        descricao: input.descricao,
        entidade: input.entidade,
        entidadeId: input.entidadeId,
        metadados: input.metadados as any,
      },
    })
    .catch(() => undefined);
}
