import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;

if (!url || !key) {
  // eslint-disable-next-line no-console
  console.warn("[Supabase] SUPABASE_URL ou SUPABASE_KEY não configurados — módulo Atendimentos desativado.");
}

export const supabase = url && key ? createClient(url, key) : null;

// ── parser de mensagem ────────────────────────────────────────────────────────

export type TipoMensagem = "human" | "ai";

export interface MensagemParsed {
  id: number | string;
  tipo: TipoMensagem;
  conteudo: string;
  criadoEm: string | null;
}

/**
 * Faz o parse do campo `message` armazenado pelo n8n/LangChain no Supabase.
 * Suporta os formatos:
 *   - {"type": "human", "data": {"content": "..."}}
 *   - {"lc":1, "type":"constructor", "kwargs":{"content":"...", "type":"human"}}
 *   - {"role": "user"|"assistant", "content": "..."}
 *   - String pura começando com "Human:" ou "AI:"
 *   - String pura (assume human)
 */
export function parseMensagem(raw: unknown): { tipo: TipoMensagem; conteudo: string } | null {
  if (!raw) return null;

  // Se for string, tenta parse JSON primeiro
  let obj: unknown = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      // string simples
      const lower = raw.toLowerCase();
      if (lower.startsWith("ai:") || lower.startsWith("assistant:")) {
        return { tipo: "ai", conteudo: raw.replace(/^(ai|assistant):\s*/i, "").trim() };
      }
      if (lower.startsWith("human:") || lower.startsWith("user:")) {
        return { tipo: "human", conteudo: raw.replace(/^(human|user):\s*/i, "").trim() };
      }
      return { tipo: "human", conteudo: raw.trim() };
    }
  }

  if (typeof obj !== "object" || obj === null) return null;
  const o = obj as Record<string, unknown>;

  // Formato LangChain clássico: {type: "human"|"ai", data: {content: ...}}
  if (typeof o.type === "string" && o.data && typeof (o.data as Record<string, unknown>).content === "string") {
    const tipo = normalizarTipo(o.type);
    return tipo ? { tipo, conteudo: String((o.data as Record<string, unknown>).content) } : null;
  }

  // Formato LangChain v2 (lc:1): {lc:1, type:"constructor", kwargs:{content:..., type:"human"}}
  if (o.lc === 1 && o.kwargs) {
    const kwargs = o.kwargs as Record<string, unknown>;
    const tipo = normalizarTipo(String(kwargs.type ?? ""));
    const content = typeof kwargs.content === "string" ? kwargs.content : null;
    if (tipo && content !== null) return { tipo, conteudo: content };
  }

  // Formato OpenAI: {role: "user"|"assistant", content: ...}
  if (typeof o.role === "string" && typeof o.content === "string") {
    const tipo = o.role === "assistant" ? "ai" : "human";
    return { tipo, conteudo: o.content };
  }

  // Fallback: tipo direto no objeto
  if (typeof o.type === "string" && typeof o.content === "string") {
    const tipo = normalizarTipo(o.type);
    return tipo ? { tipo, conteudo: o.content } : null;
  }

  return null;
}

function normalizarTipo(raw: string): TipoMensagem | null {
  const lower = raw.toLowerCase();
  if (["human", "user", "humano"].includes(lower)) return "human";
  if (["ai", "assistant", "ia", "bot"].includes(lower)) return "ai";
  return null;
}