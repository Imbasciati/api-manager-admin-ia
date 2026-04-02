import axios from "axios";
import { getConfig } from "./agente-config.service";
import { splitMessageBlocks, calcMessageDelay, sleep } from "../utils/message-format";

const BASE = "https://api.manychat.com";

async function getToken(): Promise<string> {
  const token = await getConfig("MANYCHAT_TOKEN");
  if (!token) throw new Error("MANYCHAT_TOKEN não configurado. Acesse Configurações → Agente de Vendas.");
  return token;
}

async function buildHeaders() {
  return {
    Authorization: `Bearer ${await getToken()}`,
    "Content-Type": "application/json",
  };
}

async function setField(
  subscriberId: string,
  fieldId: string,
  value: string | number,
): Promise<void> {
  await axios.post(
    `${BASE}/fb/subscriber/setCustomField`,
    { subscriber_id: subscriberId, field_id: Number(fieldId), field_value: value },
    { headers: await buildHeaders() },
  );
}

async function triggerFlow(subscriberId: string, flowNs: string): Promise<void> {
  await axios.post(
    `${BASE}/fb/sending/sendFlow`,
    { subscriber_id: subscriberId, flow_ns: flowNs },
    { headers: await buildHeaders() },
  );
}

/**
 * Divide o texto em blocos usando a lógica compartilhada de formatação e envia
 * cada um via ManyChat, gravando no campo MANYCHAT_FIELD_RESPONSE e acionando
 * MANYCHAT_FLOW_NS, com delay humanizado entre blocos.
 *
 * Regras de estruturação da IA:
 * - \n  → quebra de linha dentro da mesma mensagem
 * - \n\n → nova mensagem separada (nenhum desses marcadores chega ao lead)
 */
export async function sendBlocks(subscriberId: string, text: string): Promise<void> {
  const [fieldId, flowNs] = await Promise.all([
    getConfig("MANYCHAT_FIELD_RESPONSE"),
    getConfig("MANYCHAT_FLOW_NS"),
  ]);

  if (!fieldId || !flowNs) {
    throw new Error(
      "MANYCHAT_FIELD_RESPONSE ou MANYCHAT_FLOW_NS não configurado. Acesse Configurações → Agente de Vendas.",
    );
  }

  const blocks = splitMessageBlocks(text);

  for (const block of blocks) {
    await setField(subscriberId, fieldId, block);
    await triggerFlow(subscriberId, flowNs);
    await sleep(calcMessageDelay(block));
  }
}

/** Marca o campo IA_INTERAGIU para sinalizar que a IA respondeu. */
export async function markIaInteragiu(subscriberId: string): Promise<void> {
  const fieldId = await getConfig("MANYCHAT_FIELD_IA_INTERAGIU");
  if (!fieldId) return;
  await setField(subscriberId, fieldId, 1);
}
