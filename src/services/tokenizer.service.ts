import { get_encoding, type Tiktoken } from "tiktoken";

// o200k_base é o encoding do GPT-4o e GPT-4.1-mini
let enc: Tiktoken | null = null;

function getEncoder(): Tiktoken {
  if (!enc) {
    enc = get_encoding("o200k_base");
  }
  return enc;
}

/**
 * Conta tokens usando o tokenizador oficial da OpenAI (o200k_base).
 * Fallback para estimativa chars/4 caso o WASM não carregue.
 */
export function contarTokens(texto: string): number {
  try {
    return getEncoder().encode(texto).length;
  } catch {
    return Math.max(1, Math.ceil(texto.length / 4));
  }
}
