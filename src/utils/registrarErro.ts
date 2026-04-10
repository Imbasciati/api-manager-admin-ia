import { Request } from "express";
import { prisma } from "../prisma/client";

type Severidade = "INFO" | "WARNING" | "ERROR" | "CRITICAL";

interface RegistrarErroOptions {
  req?: Request;
  severidade?: Severidade;
  categoria?: string;
  origem?: string;
}

/**
 * Registra um erro no MonitordeErros (tabela ErroSistema).
 * Fire-and-forget — não bloqueia a execução.
 *
 * Use nos controllers ao retornar `fail()` para erros que merecem visibilidade:
 * falhas de integração externa, estado inesperado, erros de configuração, etc.
 */
export function registrarErro(mensagem: string, opts: RegistrarErroOptions = {}): void {
  const {
    req,
    severidade = "ERROR",
    categoria = "API",
    origem = "backend",
  } = opts;

  prisma.erroSistema
    .create({
      data: {
        severidade,
        categoria,
        mensagem,
        usuarioId: req?.user?.id,
        origem,
      },
    })
    .catch(() => undefined); // nunca deixa estouro silencioso quebrar o fluxo
}
