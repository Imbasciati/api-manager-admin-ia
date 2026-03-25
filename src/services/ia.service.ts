import axios from "axios";
import { prisma } from "../prisma/client";
import { AppError } from "../utils/errors";

type AgentConfig = {
  modelo: string;
  temperatura: number;
  tokensMaximos: number;
  promptSistema: string;
  contextoProdutos?: string | null;
};

/** Detecta o provedor a partir do ID do modelo. */
function detectarProvider(modelo: string): "openai" | "anthropic" | "google" {
  const m = modelo.toLowerCase();
  if (m.startsWith("claude")) return "anthropic";
  if (m.startsWith("gemini")) return "google";
  return "openai";
}

/**
 * Busca a API Key: primeiro tenta o banco (admin configura via UI),
 * com fallback para variável de ambiente.
 */
async function getApiKey(provider: "openai" | "anthropic" | "google"): Promise<string> {
  const config = await prisma.configuracaoProvedor.findUnique({
    where: { provider },
  });

  if (config?.apiKey && config.ativo) return config.apiKey;

  // Fallback para .env
  const envMap: Record<string, string | undefined> = {
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    google: process.env.GOOGLE_API_KEY,
  };

  const key = envMap[provider];
  if (!key) {
    const label: Record<string, string> = {
      openai: "OpenAI",
      anthropic: "Anthropic",
      google: "Google Gemini",
    };
    throw new AppError(
      `API Key da ${label[provider]} não configurada. Acesse Configurações → Provedores.`,
      500,
      "IA_CONFIG_ERROR",
    );
  }

  return key;
}

/** ── OpenAI ─────────────────────────────────────────────────────────────── */
async function chatOpenAI(
  config: AgentConfig,
  mensagem: string,
  apiKey: string,
  imagemBase64?: string,
  imagemMimeType?: string,
): Promise<string> {
  const systemPrompt = buildSystemPrompt(config);

  // Conteúdo do usuário: texto simples ou multimodal (texto + imagem)
  const userContent: unknown = imagemBase64
    ? [
        { type: "text", text: mensagem || "Descreva esta imagem." },
        { type: "image_url", image_url: { url: `data:${imagemMimeType ?? "image/jpeg"};base64,${imagemBase64}` } },
      ]
    : mensagem;

  const response = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: config.modelo,
      temperature: config.temperatura,
      max_tokens: config.tokensMaximos,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    },
    { headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" } },
  );

  return response.data?.choices?.[0]?.message?.content ?? "Sem resposta da IA.";
}

/** ── Anthropic ──────────────────────────────────────────────────────────── */
async function chatAnthropic(
  config: AgentConfig,
  mensagem: string,
  apiKey: string,
): Promise<string> {
  const systemPrompt = buildSystemPrompt(config);

  const response = await axios.post(
    "https://api.anthropic.com/v1/messages",
    {
      model: config.modelo,
      max_tokens: config.tokensMaximos,
      temperature: config.temperatura,
      system: systemPrompt,
      messages: [{ role: "user", content: mensagem }],
    },
    {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
    },
  );

  return response.data?.content?.[0]?.text ?? "Sem resposta da IA.";
}

/** ── Google Gemini ──────────────────────────────────────────────────────── */
async function chatGemini(config: AgentConfig, mensagem: string, apiKey: string): Promise<string> {
  const systemPrompt = buildSystemPrompt(config);

  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${config.modelo}:generateContent?key=${apiKey}`,
    {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: mensagem }] }],
      generationConfig: {
        maxOutputTokens: config.tokensMaximos,
        temperature: config.temperatura,
      },
    },
    { headers: { "Content-Type": "application/json" } },
  );

  return (
    response.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "Sem resposta da IA."
  );
}

function buildSystemPrompt(config: AgentConfig): string {
  return `${config.promptSistema}\n\nContexto de produtos:\n${config.contextoProdutos ?? "Sem contexto adicional."}`;
}

export type HistoricoMensagem = { role: "user" | "assistant"; content: string };

/**
 * Chat com histórico completo de conversa.
 * Usado pela integração Unnichat para manter contexto entre mensagens.
 */
export const chatWithAgentHistory = async (
  config: AgentConfig,
  historico: HistoricoMensagem[],
  mensagemAtual: string,
): Promise<string> => {
  const provider = detectarProvider(config.modelo);
  const apiKey = await getApiKey(provider);
  const systemPrompt = buildSystemPrompt(config);

  if (provider === "anthropic") {
    const messages = [
      ...historico.map((h) => ({ role: h.role, content: h.content })),
      { role: "user" as const, content: mensagemAtual },
    ];
    const response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      { model: config.modelo, max_tokens: config.tokensMaximos, temperature: config.temperatura, system: systemPrompt, messages },
      { headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" } },
    );
    return response.data?.content?.[0]?.text ?? "Sem resposta da IA.";
  }

  if (provider === "google") {
    const contents = [
      ...historico.map((h) => ({ role: h.role === "assistant" ? "model" : "user", parts: [{ text: h.content }] })),
      { role: "user", parts: [{ text: mensagemAtual }] },
    ];
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${config.modelo}:generateContent?key=${apiKey}`,
      { systemInstruction: { parts: [{ text: systemPrompt }] }, contents, generationConfig: { maxOutputTokens: config.tokensMaximos, temperature: config.temperatura } },
      { headers: { "Content-Type": "application/json" } },
    );
    return response.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "Sem resposta da IA.";
  }

  // OpenAI (default)
  const messages = [
    { role: "system" as const, content: systemPrompt },
    ...historico.map((h) => ({ role: h.role, content: h.content })),
    { role: "user" as const, content: mensagemAtual },
  ];
  const response = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    { model: config.modelo, temperature: config.temperatura, max_tokens: config.tokensMaximos, messages },
    { headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" } },
  );
  return response.data?.choices?.[0]?.message?.content ?? "Sem resposta da IA.";
};

/** Ponto de entrada principal — roteado por provedor. Suporta imagem (visão) para OpenAI. */
export const chatWithAgent = async (
  config: AgentConfig,
  mensagem: string,
  imagemBuffer?: Buffer,
  imagemMimeType?: string,
): Promise<string> => {
  const provider = detectarProvider(config.modelo);
  const apiKey = await getApiKey(provider);
  const imagemBase64 = imagemBuffer?.toString("base64");

  switch (provider) {
    case "anthropic":
      return chatAnthropic(config, mensagem, apiKey);
    case "google":
      return chatGemini(config, mensagem, apiKey);
    default:
      return chatOpenAI(config, mensagem, apiKey, imagemBase64, imagemMimeType);
  }
};

/** Exporta getApiKey para uso em controllers externos (ex: transcrição Whisper). */
export { getApiKey };

/**
 * Testa a conexão com um provedor fazendo uma chamada mínima.
 * Exportado para uso no controller de provedores.
 */
export const testarConexao = async (
  provider: string,
  apiKey: string,
): Promise<{ ok: boolean; mensagem: string; modelo?: string }> => {
  try {
    if (provider === "openai") {
      const res = await axios.get("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 10000,
      });
      const modelos: string[] = res.data?.data?.map((m: any) => m.id) ?? [];
      const temGpt4o = modelos.some((m) => m.includes("gpt-4o"));
      return {
        ok: true,
        mensagem: `Conexão estabelecida. ${modelos.length} modelo(s) disponível(is).`,
        modelo: temGpt4o ? "gpt-4o" : modelos[0],
      };
    }

    if (provider === "anthropic") {
      await axios.post(
        "https://api.anthropic.com/v1/messages",
        {
          model: "claude-haiku-4-5-20251001",
          max_tokens: 5,
          messages: [{ role: "user", content: "ok" }],
        },
        {
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          timeout: 10000,
        },
      );
      return { ok: true, mensagem: "Conexão estabelecida com a API da Anthropic.", modelo: "claude-haiku-4-5-20251001" };
    }

    if (provider === "google") {
      const res = await axios.get(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
        { timeout: 10000 },
      );
      const modelos: string[] = res.data?.models?.map((m: any) => m.name) ?? [];
      return {
        ok: true,
        mensagem: `Conexão estabelecida. ${modelos.length} modelo(s) disponível(is).`,
        modelo: "gemini-2.0-flash",
      };
    }

    return { ok: false, mensagem: "Provedor desconhecido." };
  } catch (err: any) {
    const status = err?.response?.status;
    const detail = err?.response?.data?.error?.message ?? err?.message ?? "Erro desconhecido";

    if (status === 401 || status === 403) {
      return { ok: false, mensagem: `API Key inválida ou sem permissão. (${detail})` };
    }

    return { ok: false, mensagem: `Falha na conexão: ${detail}` };
  }
};
