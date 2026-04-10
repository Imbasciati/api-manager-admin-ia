import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ok, fail } from "../utils/response";
import { prisma } from "../prisma/client";

const CHAVE = "FIREPAY_API_KEY";
const FIREPAY_BASE = "https://admin.firepay.com.br";

/** GET /configuracoes/firepay — status da chave configurada */
export const getFirepayConfig = asyncHandler(async (_req: Request, res: Response) => {
  const config = await prisma.configuracaoAgente.findUnique({ where: { chave: CHAVE } });
  return ok(res, {
    configurado: Boolean(config?.valor),
    apiKeyMascarada: config?.valor
      ? `${config.valor.slice(0, 8)}${"•".repeat(20)}${config.valor.slice(-4)}`
      : null,
  });
});

/** PUT /configuracoes/firepay — salva/atualiza a API key */
export const saveFirepayApiKey = asyncHandler(async (req: Request, res: Response) => {
  const { apiKey } = req.body as { apiKey?: string };
  if (!apiKey?.trim()) return fail(res, 400, "API Key obrigatória", "VALIDATION_ERROR");

  await prisma.configuracaoAgente.upsert({
    where: { chave: CHAVE },
    create: {
      chave: CHAVE,
      valor: apiKey.trim(),
      descricao: "API Key da FirePay para consulta de checkouts",
      sensivel: true,
    },
    update: { valor: apiKey.trim() },
  });

  return ok(res, { saved: true });
});

/** DELETE /configuracoes/firepay — remove a chave */
export const deleteFirepayApiKey = asyncHandler(async (_req: Request, res: Response) => {
  await prisma.configuracaoAgente.deleteMany({ where: { chave: CHAVE } });
  return ok(res, { deleted: true });
});

/**
 * GET /configuracoes/firepay/checkout/:id
 * Consulta os dados de um checkout na API da FirePay pelo ID.
 * Retorna o payload bruto para o frontend mapear link + valor.
 */
export const buscarCheckoutFirepay = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id || !/^\d+$/.test(id)) {
    return fail(res, 400, "ID do checkout deve ser numérico", "VALIDATION_ERROR");
  }

  const config = await prisma.configuracaoAgente.findUnique({ where: { chave: CHAVE } });
  if (!config?.valor) {
    return fail(
      res,
      400,
      "API Key da FirePay não configurada. Acesse Configurações → FirePay.",
      "NOT_CONFIGURED",
    );
  }

  let response: globalThis.Response;
  try {
    response = await fetch(`${FIREPAY_BASE}/api/public/checkouts/${id}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.valor}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });
  } catch {
    return fail(res, 502, "Não foi possível conectar à API da FirePay", "FIREPAY_UNAVAILABLE");
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return fail(
      res,
      response.status >= 500 ? 502 : response.status,
      `FirePay retornou erro ${response.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
      "FIREPAY_ERROR",
    );
  }

  const data = (await response.json()) as Record<string, unknown>;
  return ok(res, data);
});
