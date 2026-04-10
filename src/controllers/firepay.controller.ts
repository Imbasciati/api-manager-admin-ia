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
 * POST /configuracoes/firepay/testar
 * Valida se a API Key configurada consegue autenticar na FirePay.
 */
export const testarFirepayApiKey = asyncHandler(async (_req: Request, res: Response) => {
  const config = await prisma.configuracaoAgente.findUnique({ where: { chave: CHAVE } });
  if (!config?.valor) {
    return fail(res, 400, "API Key da FirePay não configurada.", "NOT_CONFIGURED");
  }

  // Usa o endpoint de transactions com um intervalo mínimo só para testar autenticação
  const url = new URL(`${FIREPAY_BASE}/api/public/transactions`);
  url.searchParams.set("startDate", "2025-01-01");
  url.searchParams.set("finalDate", "2025-01-01");

  let response: globalThis.Response;
  try {
    response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.valor}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });
  } catch {
    return fail(res, 502, "Não foi possível conectar à API da FirePay.", "FIREPAY_UNAVAILABLE");
  }

  if (response.status === 401 || response.status === 403) {
    return fail(res, 401, "API Key inválida ou sem permissão.", "INVALID_KEY");
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return fail(
      res,
      502,
      `FirePay retornou erro ${response.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
      "FIREPAY_ERROR",
    );
  }

  return ok(res, { conectado: true });
});

/**
 * GET /configuracoes/firepay/checkout/:id
 * Consulta os dados de um checkout na API da FirePay pelo checkoutId.
 * Usa GET /api/public/transactions?checkoutId={id} (único endpoint público documentado).
 */
export const buscarCheckoutFirepay = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id ?? "");

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

  // Intervalo de 5 anos para garantir que o checkout seja encontrado
  const today = new Date().toISOString().split("T")[0] as string;
  const fiveYearsAgo = new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0] as string;

  const url = new URL(`${FIREPAY_BASE}/api/public/transactions`);
  url.searchParams.set("checkoutId", id);
  url.searchParams.set("startDate", fiveYearsAgo);
  url.searchParams.set("finalDate", today);
  url.searchParams.set("per-page", "1");

  let response: globalThis.Response;
  try {
    response = await fetch(url.toString(), {
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
