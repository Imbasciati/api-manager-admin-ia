import * as bufferService from "./message-buffer.service";
import * as memoryService from "./conversation-memory.service";
import * as executionLogger from "./execution-logger.service";
import * as manychatService from "./manychat.service";
import { transcribeAudio, analyzeImage } from "./openai.service";
import { classify } from "../agents/classifier.agent";
import { respond } from "../agents/sales.agent";

/**
 * Ponto de entrada do pipeline de processamento.
 * Chamado pelo buffer após BUFFER_WINDOW_MS sem novas mensagens do contactId.
 *
 * Fluxo:
 *  1. Busca mensagens pendentes no buffer
 *  2. Transcreve áudio / descreve imagens se necessário
 *  3. Combina todas as mensagens em um único texto
 *  4. Classifica: LEAD_REAL vs RESPOSTA_AUTOMATICA
 *  5. Se LEAD_REAL: recupera memória, gera resposta, envia via ManyChat, atualiza memória
 *  6. Marca mensagens como processadas e loga a execução
 */
export async function processContact(contactId: string): Promise<void> {
  const inicio = Date.now();

  const messages = await bufferService.getPendingMessages(contactId);
  if (messages.length === 0) return;

  const ids = messages.map((m) => m.id);
  let inputMensagem = "";

  // Resolve mídia e monta texto combinado
  for (const msg of messages) {
    let texto = msg.conteudo;

    if (msg.tipo !== "text" && msg.mediaUrl) {
      try {
        if (msg.tipo === "audio") {
          texto = await transcribeAudio(msg.mediaUrl);
        } else if (msg.tipo === "image") {
          texto = await analyzeImage(msg.mediaUrl);
        }
        await bufferService.updateTranscricao(msg.id, texto);
      } catch {
        // Mantém conteúdo original se falhar
      }
    }

    if (texto.trim()) {
      inputMensagem += (inputMensagem ? "\n" : "") + texto.trim();
    }
  }

  if (!inputMensagem.trim()) {
    await bufferService.markProcessed(ids);
    return;
  }

  // Classificação
  const classificacao = await classify(inputMensagem);

  if (classificacao !== "LEAD_REAL") {
    await bufferService.markProcessed(ids);
    await executionLogger.log({
      contactId,
      inputMensagem,
      classificacao,
      modelo: "gpt-4.1-mini",
      canal:  "manychat",
    });
    return;
  }

  // Resposta do agente de vendas
  let resposta: string | undefined;
  let inputTokens = 0;
  let outputTokens = 0;
  let erro: string | undefined;

  try {
    const memory = await memoryService.getMemory(contactId);
    const result = await respond(inputMensagem, memory);

    resposta = result.content;
    inputTokens = result.inputTokens;
    outputTokens = result.outputTokens;

    await memoryService.updateMemory(contactId, inputMensagem, resposta);
    await manychatService.sendBlocks(contactId, resposta);
    await manychatService.markIaInteragiu(contactId);
  } catch (err) {
    erro = err instanceof Error ? err.message : String(err);
    console.error(`[processor] Erro ao responder contactId=${contactId}:`, err);
  }

  await bufferService.markProcessed(ids);
  await executionLogger.log({
    contactId,
    inputMensagem,
    classificacao,
    resposta,
    inputTokens,
    outputTokens,
    modelo:  "gpt-4.1-mini",
    canal:   "manychat",
    duracao: Date.now() - inicio,
    erro,
  });
}
