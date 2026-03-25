import axios from "axios";
import { getConfig } from "./agente-config.service";

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

function calcDelay(text: string): number {
  const ms = (text.length / 30) * 1000; // 30 chars/s
  return Math.min(8000, Math.max(3000, ms));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Divide o texto em blocos (parágrafos) e envia cada um via ManyChat,
 * gravando no campo MANYCHAT_FIELD_RESPONSE e acionando MANYCHAT_FLOW_NS,
 * com delay humanizado entre blocos.
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

  const blocks = text
    .split(/\n\n+/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

  for (const block of blocks) {
    await setField(subscriberId, fieldId, block);
    await triggerFlow(subscriberId, flowNs);
    await sleep(calcDelay(block));
  }
}

/** Marca o campo IA_INTERAGIU para sinalizar que a IA respondeu. */
export async function markIaInteragiu(subscriberId: string): Promise<void> {
  const fieldId = await getConfig("MANYCHAT_FIELD_IA_INTERAGIU");
  if (!fieldId) return;
  await setField(subscriberId, fieldId, 1);
}
