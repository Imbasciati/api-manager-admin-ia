import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ok, fail } from "../utils/response";
import { prisma } from "../prisma/client";
import { registrarErro } from "../utils/registrarErro";

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
 * Valida se a API Key consegue autenticar na FirePay fazendo uma chamada real.
 */
export const testarFirepayApiKey = asyncHandler(async (req: Request, res: Response) => {
  const config = await prisma.configuracaoAgente.findUnique({ where: { chave: CHAVE } });
  if (!config?.valor) {
    return fail(res, 400, "API Key da FirePay não configurada.", "NOT_CONFIGURED");
  }

  // Janela de 7 dias recentes — dentro do limite de 180 dias da API
  const hoje = new Date();
  const seteDiasAtras = new Date(hoje);
  seteDiasAtras.setDate(hoje.getDate() - 7);
  const finalDate = hoje.toISOString().split("T")[0] as string;
  const startDate = seteDiasAtras.toISOString().split("T")[0] as string;

  const url = new URL(`${FIREPAY_BASE}/api/public/transactions`);
  url.searchParams.set("startDate", startDate);
  url.searchParams.set("finalDate", finalDate);

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
  } catch (err) {
    const msg = `FirePay — falha de conexão ao testar API Key: ${err instanceof Error ? err.message : String(err)}`;
    registrarErro(msg, { req, severidade: "CRITICAL", categoria: "FirePay", origem: "backend" });
    return fail(res, 502, "Não foi possível conectar à API da FirePay.", "FIREPAY_UNAVAILABLE");
  }

  if (response.status === 401 || response.status === 403) {
    registrarErro(
      `FirePay — API Key inválida ou sem permissão (HTTP ${response.status})`,
      { req, severidade: "ERROR", categoria: "FirePay", origem: "backend" },
    );
    return fail(res, 401, "API Key inválida ou sem permissão.", "INVALID_KEY");
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const msg = `FirePay — erro ao testar conexão (HTTP ${response.status})${text ? `: ${text.slice(0, 500)}` : ""}`;
    registrarErro(msg, { req, severidade: "ERROR", categoria: "FirePay", origem: "backend" });
    return fail(res, 502, `FirePay retornou erro ${response.status}`, "FIREPAY_ERROR");
  }

  return ok(res, { conectado: true });
});

/**
 * GET /configuracoes/firepay/checkout/:id
 * Consulta transações de um checkout na API da FirePay para validar o ID.
 * A API pública só retorna totais agregados (total_sales_count, total_sales_value).
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

  // A API da FirePay aceita no máximo 180 dias por janela.
  // Usamos os últimos 30 dias como janela padrão de verificação.
  const hoje = new Date();
  const trintaDiasAtras = new Date(hoje);
  trintaDiasAtras.setDate(hoje.getDate() - 30);
  const finalDate = hoje.toISOString().split("T")[0] as string;
  const startDate = trintaDiasAtras.toISOString().split("T")[0] as string;

  const url = new URL(`${FIREPAY_BASE}/api/public/transactions`);
  url.searchParams.set("checkoutId", id);
  url.searchParams.set("startDate", startDate);
  url.searchParams.set("finalDate", finalDate);

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
  } catch (err) {
    const msg = `FirePay — falha de conexão ao buscar checkout ${id}: ${err instanceof Error ? err.message : String(err)}`;
    registrarErro(msg, { req, severidade: "CRITICAL", categoria: "FirePay", origem: "backend" });
    return fail(res, 502, "Não foi possível conectar à API da FirePay", "FIREPAY_UNAVAILABLE");
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const msg = `FirePay — erro ao buscar checkout ${id} (HTTP ${response.status})${text ? `: ${text.slice(0, 500)}` : ""}`;
    registrarErro(msg, {
      req,
      severidade: response.status >= 500 ? "CRITICAL" : "ERROR",
      categoria: "FirePay",
      origem: "backend",
    });
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
