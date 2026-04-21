import type { Request, Response } from "express";

const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN ?? "PLACEHOLDER_VERIFY_TOKEN";

// ── GET — verificação do webhook pela Meta ────────────────────────────────────
// A Meta faz um GET com hub.mode, hub.verify_token e hub.challenge.
// Retornamos o challenge se o token bater.

export function verificarWebhookWABA(req: Request, res: Response) {
  const mode      = req.query["hub.mode"];
  const token     = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("[WABA] Webhook verificado pela Meta.");
    return res.status(200).send(challenge);
  }

  console.warn("[WABA] Falha na verificação do webhook — token inválido.");
  return res.status(403).json({ error: "Forbidden" });
}

// ── POST — recebe eventos da Meta ─────────────────────────────────────────────
// IMPORTANTE: a Meta exige resposta 200 em < 20 s. Retornamos imediatamente
// e processamos de forma assíncrona.

export async function receberEventoWABA(req: Request, res: Response) {
  // Responde imediatamente para evitar timeout da Meta
  res.sendStatus(200);

  const body = req.body as {
    object?: string;
    entry?: {
      id: string;
      changes?: {
        value: {
          messaging_product: string;
          metadata?: { display_phone_number: string; phone_number_id: string };
          contacts?: { profile: { name: string }; wa_id: string }[];
          messages?: {
            id: string;
            from: string;
            timestamp: string;
            type: string;
            text?: { body: string };
            image?: { mime_type: string; sha256: string; id: string };
            audio?: { mime_type: string; sha256: string; id: string; voice: boolean };
          }[];
          statuses?: {
            id: string;
            status: string;
            timestamp: string;
            recipient_id: string;
            errors?: { code: number; title: string }[];
          }[];
        };
        field: string;
      }[];
    }[];
  };

  if (body.object !== "whatsapp_business_account") return;

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;

      const value = change.value;

      // Mensagens recebidas
      for (const msg of value.messages ?? []) {
        const contato = value.contacts?.find((c) => c.wa_id === msg.from);
        const nome    = contato?.profile?.name ?? null;

        console.log(`[WABA] Mensagem de ${msg.from} (${nome ?? "desconhecido"}):`, {
          id:   msg.id,
          tipo: msg.type,
          texto: msg.text?.body,
        });

        // TODO: integrar com processamento de agente IA
        // Exemplo de fluxo futuro:
        // const agente = await resolverAgentePorNumero(value.metadata?.phone_number_id);
        // await processarMensagemWABA({ agente, mensagem: msg, nome, telefone: msg.from });
      }

      // Status de mensagens enviadas (entregue, lido, erro, etc.)
      for (const status of value.statuses ?? []) {
        if (status.errors?.length) {
          console.error(`[WABA] Erro no envio para ${status.recipient_id}:`, status.errors);
        } else {
          console.log(`[WABA] Status "${status.status}" para ${status.recipient_id} (msg: ${status.id})`);
        }
      }
    }
  }
}
