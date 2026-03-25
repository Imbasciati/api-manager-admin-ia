import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ok, fail } from "../utils/response";
import * as configService from "../services/agente-config.service";

// Metadados dos campos configuráveis do agente de vendas
const CAMPOS: Record<string, { descricao: string; sensivel: boolean; padrao?: string }> = {
  MANYCHAT_TOKEN: {
    descricao: "Token de autenticação da API do ManyChat",
    sensivel: true,
  },
  MANYCHAT_FIELD_IA_INTERAGIU: {
    descricao: "ID do campo customizado 'IA Interagiu' no ManyChat",
    sensivel: false,
  },
  MANYCHAT_FIELD_RESPONSE: {
    descricao: "ID do campo customizado de resposta no ManyChat",
    sensivel: false,
  },
  MANYCHAT_FLOW_NS: {
    descricao: "Namespace do fluxo de envio de mensagens no ManyChat",
    sensivel: false,
  },
  BUFFER_WINDOW_MS: {
    descricao: "Janela de agrupamento de mensagens em milissegundos",
    sensivel: false,
    padrao: "2000",
  },
  CONVERSATION_CONTEXT_WINDOW: {
    descricao: "Número de mensagens mantidas em memória por contato",
    sensivel: false,
    padrao: "50",
  },
};

/** GET /configuracoes/agente — lista todos os campos com status */
export const listAgenteConfigs = asyncHandler(async (_req: Request, res: Response) => {
  const dbConfigs = await configService.getAllConfigs();

  const result = Object.entries(CAMPOS).map(([chave, meta]) => {
    const dbEntry = dbConfigs.find((c) => c.chave === chave);
    const envValue = process.env[chave];

    const fonte: "database" | "env" | "padrao" | "nao_configurado" = dbEntry?.valor
      ? "database"
      : envValue
        ? "env"
        : meta.padrao
          ? "padrao"
          : "nao_configurado";

    return {
      chave,
      descricao: meta.descricao,
      sensivel: meta.sensivel,
      padrao: meta.padrao,
      fonte,
      // Retorna valor apenas para campos não-sensíveis; para sensíveis, indica se está configurado
      valor: meta.sensivel ? "" : (dbEntry?.valor ?? envValue ?? meta.padrao ?? ""),
      configurado: !!(dbEntry?.valor || envValue),
    };
  });

  return ok(res, result);
});

/** PUT /configuracoes/agente/:chave — salva ou atualiza um campo */
export const updateAgenteConfig = asyncHandler(async (req: Request, res: Response) => {
  const chave = String(req.params.chave);
  const { valor } = req.body as { valor: string };

  if (!chave || !(chave in CAMPOS)) {
    return fail(res, 400, `Campo desconhecido: ${chave}`, "VALIDATION_ERROR");
  }
  if (valor === undefined || valor === null) {
    return fail(res, 400, "Campo 'valor' obrigatório", "VALIDATION_ERROR");
  }

  const meta = CAMPOS[chave];
  await configService.upsertConfig(chave, String(valor), {
    descricao: meta.descricao,
    sensivel: meta.sensivel,
  });

  return ok(res, { updated: true });
});

/** DELETE /configuracoes/agente/:chave — remove do banco (volta a usar .env/padrão) */
export const deleteAgenteConfig = asyncHandler(async (req: Request, res: Response) => {
  const chave = String(req.params.chave);

  if (!(chave in CAMPOS)) {
    return fail(res, 400, `Campo desconhecido: ${chave}`, "VALIDATION_ERROR");
  }

  await configService.getAllConfigs().then(async (configs) => {
    const existing = configs.find((c) => c.chave === chave);
    if (existing) {
      const { prisma } = await import("../prisma/client");
      await prisma.configuracaoAgente.delete({ where: { chave } });
    }
  });

  return ok(res, { deleted: true });
});
