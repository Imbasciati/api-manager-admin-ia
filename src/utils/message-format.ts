/**
 * Utilitário de formatação e envio de mensagens.
 *
 * Regras de estruturação para respostas da IA:
 * - \n  (literal "\\n" ou nova linha real) → quebra de linha dentro da MESMA mensagem
 * - \n\n (literal "\\n\\n" ou dupla nova linha real) → NOVA mensagem separada
 *
 * Nenhum desses marcadores deve aparecer literalmente para o lead na mensagem final.
 */

/**
 * Separa a resposta da IA em blocos de mensagens independentes.
 *
 * Trata tanto marcadores literais (\n como texto) quanto caracteres reais de nova linha.
 * Cada bloco é enviado como uma mensagem separada ao lead.
 */
export function splitMessageBlocks(text: string): string[] {
  // Normaliza marcadores literais \n (barra-invertida + n) para nova linha real
  const normalized = text
    .replace(/\\n\\n/g, "\n\n") // "\\n\\n" literal → dupla nova linha
    .replace(/\\n/g, "\n");     // "\\n" literal    → nova linha simples

  return normalized
    .split(/\n{2,}/)              // quebra em blocos a cada dupla (ou mais) nova linha
    .map((block) => block.trim()) // remove espaços/novas linhas nas bordas de cada bloco
    .filter((block) => block.length > 0); // descarta blocos vazios
}

/**
 * Calcula delay humanizado com base no tamanho do texto (simula digitação).
 * Mínimo: 3s | Máximo: 8s
 */
export function calcMessageDelay(text: string): number {
  const ms = (text.length / 30) * 1_000;
  return Math.min(8_000, Math.max(3_000, ms));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
