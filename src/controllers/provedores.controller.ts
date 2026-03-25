import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../prisma/client";
import { asyncHandler } from "../utils/asyncHandler";
import { AppError } from "../utils/errors";
import { ok } from "../utils/response";

function asString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

// Placeholder que indica "não alterar a key atual"
const KEY_MASK_PREFIX = "••••••••••••";

/** Mascara a API Key para exibição — mostra apenas os últimos 6 caracteres. */
function mascarar(apiKey: string): string {
  if (apiKey.length <= 6) return KEY_MASK_PREFIX;
  return `${KEY_MASK_PREFIX}${apiKey.slice(-6)}`;
}

/** Retorna true se o valor enviado é uma máscara (não deve atualizar a key). */
function ehMascara(value: string): boolean {
  return value.startsWith("••••");
}

const PROVIDERS_VALIDOS = ["openai", "anthropic", "google"] as const;

const saveSchema = z.object({
  apiKey: z.string().min(1, "API Key obrigatória"),
  ativo: z.boolean().optional(),
});

/** Lista todos os provedores com keys mascaradas. */
export const listProvedores = asyncHandler(async (_req: Request, res: Response) => {
  const configs = await prisma.configuracaoProvedor.findMany({
    orderBy: { provider: "asc" },
  });

  // Garante que os 3 provedores aparecem mesmo sem config
  const provedoresBase = PROVIDERS_VALIDOS.map((provider) => {
    const config = configs.find((c) => c.provider === provider);
    return {
      provider,
      configurado: Boolean(config),
      ativo: config?.ativo ?? false,
      verificado: config?.verificado ?? false,
      apiKeyMascarada: config ? mascarar(config.apiKey) : null,
      atualizadoEm: config?.atualizadoEm ?? null,
    };
  });

  return ok(res, provedoresBase);
});

/** Salva ou atualiza a configuração de um provedor. */
export const saveProvedor = asyncHandler(async (req: Request, res: Response) => {
  const provider = asString(req.params.provider);

  if (!provider) {
    throw new AppError("Provider inválido", 400);
  }

  if (!PROVIDERS_VALIDOS.includes(provider as (typeof PROVIDERS_VALIDOS)[number])) {
    throw new AppError(`Provedor inválido. Use: ${PROVIDERS_VALIDOS.join(", ")}`, 400);
  }

  const body = saveSchema.parse(req.body);

  // Se veio máscara, não atualiza a key — apenas atualiza outros campos
  if (ehMascara(body.apiKey)) {
    const existing = await prisma.configuracaoProvedor.findUnique({
      where: { provider },
    });

    if (!existing) {
      throw new AppError("Configuração não encontrada. Informe a API Key completa.", 404);
    }

    const atualizado = await prisma.configuracaoProvedor.update({
      where: { provider },
      data: { ativo: body.ativo ?? existing.ativo },
    });

    return ok(res, {
      provider: atualizado.provider,
      configurado: true,
      ativo: atualizado.ativo,
      verificado: atualizado.verificado,
      apiKeyMascarada: mascarar(existing.apiKey),
      atualizadoEm: atualizado.atualizadoEm,
    });
  }

  // Salva a key completa (upsert)
  const config = await prisma.configuracaoProvedor.upsert({
    where: { provider },
    create: {
      provider,
      apiKey: body.apiKey,
      ativo: body.ativo ?? true,
      verificado: false,
    },
    update: {
      apiKey: body.apiKey,
      ativo: body.ativo ?? true,
      verificado: false, // key nova = não verificada
    },
  });

  return ok(res, {
    provider: config.provider,
    configurado: true,
    ativo: config.ativo,
    verificado: config.verificado,
    apiKeyMascarada: mascarar(config.apiKey),
    atualizadoEm: config.atualizadoEm,
  });
});

/** Testa a conexão com o provedor fazendo uma chamada mínima. */
export const testarProvedor = asyncHandler(async (req: Request, res: Response) => {
  const provider = asString(req.params.provider);

  if (!provider) {
    throw new AppError("Provider inválido", 400);
  }

  if (!PROVIDERS_VALIDOS.includes(provider as (typeof PROVIDERS_VALIDOS)[number])) {
    throw new AppError(`Provedor inválido. Use: ${PROVIDERS_VALIDOS.join(", ")}`, 400);
  }

  const config = await prisma.configuracaoProvedor.findUnique({ where: { provider } });
  if (!config) throw new AppError("Provedor não configurado", 404);
  if (!config.ativo) throw new AppError("Provedor está desativado", 400);

  const { testarConexao } = await import("../services/ia.service");
  const resultado = await testarConexao(provider, config.apiKey);

  if (resultado.ok) {
    await prisma.configuracaoProvedor.update({
      where: { provider },
      data: { verificado: true },
    });
  }

  return ok(res, resultado);
});

/** Ativa/desativa um provedor. */
export const toggleProvedor = asyncHandler(async (req: Request, res: Response) => {
  const provider = asString(req.params.provider);

  if (!provider) {
    throw new AppError("Provider inválido", 400);
  }

  if (!PROVIDERS_VALIDOS.includes(provider as (typeof PROVIDERS_VALIDOS)[number])) {
    throw new AppError(`Provedor inválido. Use: ${PROVIDERS_VALIDOS.join(", ")}`, 400);
  }

  const { ativo } = z.object({ ativo: z.boolean() }).parse(req.body);

  const config = await prisma.configuracaoProvedor.update({
    where: { provider },
    data: { ativo },
  });

  return ok(res, {
    provider: config.provider,
    ativo: config.ativo,
  });
});