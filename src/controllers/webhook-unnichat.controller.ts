import { Request, Response } from "express";
import { prisma } from "../prisma/client";
import { chatWithAgentHistory, type HistoricoMensagem } from "../services/ia.service";
import { enviarMensagem } from "../services/unnichat.service";
import { broadcast } from "../services/sse.service";
import { addMessage, getPendingMessages, markProcessed, scheduleProcessing } from "../services/message-buffer.service";
import { splitMessageBlocks, calcMessageDelay, sleep } from "../utils/message-format";

/**
 * Contexto em memória por contactId — guarda agente, telefone e nome
 * do lead entre o recebimento e o processamento após o debounce.
 */
const pendingContexts = new Map<string, {
  agenteId: string;
  telefone: string;
  nome: string | null;
}>();

/**
 * Extrai os campos relevantes do payload enviado pelo Unnichat.
 *
 * Formatos suportados:
 *
 * 1. Formato Unnichat Automação (data wrapper):
 * { "data": { "id": "...", "name": "...", "phoneNumber": "...", "message": "..." } }
 *
 * 2. Formato padrão com objetos aninhados:
 * { "contact": { "id": "...", "phone": "...", "name": "..." },
 *   "message": { "id": "...", "text": "...", "type": "text" } }
 *
 * 3. Formato simplificado / plano:
 * { "phone": "...", "name": "...", "message": "..." }
 */
function extrairPayload(body: Record<string, unknown>) {
  // ── Formato 1: Unnichat Automação { data: { phoneNumber, name, ... } } ──────
  if (body.data && typeof body.data === "object") {
    const d = body.data as Record<string, unknown>;
    const phone = String(d.phoneNumber ?? d.phone ?? d.telefone ?? "");
    if (phone) {
      const field = (d.field && typeof d.field === "object") ? d.field as Record<string, unknown> : {};
      const texto = String(
        d.message ?? d.text ?? d.mensagem ??
        field.message ?? field.text ?? field.mensagem ?? ""
      ).trim();

      return {
        contactId: String(d.id ?? phone),
        telefone: normalizePhone(phone),
        nome: d.name ? String(d.name) : null,
        texto,
      };
    }
  }

  // ── Formato 2: { contact, message } ──────────────────────────────────────────
  if (body.contact && body.message) {
    const contact = body.contact as Record<string, string>;
    const message = body.message as Record<string, string>;
    const texto = (message.text ?? message.conversation ?? message.body ?? "").trim();
    const tipo = message.type ?? "text";
    if (tipo !== "text" && !texto) return null;
    return {
      contactId: contact.id ?? contact.phone ?? "",
      telefone: normalizePhone(contact.phone ?? ""),
      nome: contact.name ?? contact.pushName ?? null,
      texto,
    };
  }

  // ── Formato 3: plano ──────────────────────────────────────────────────────────
  if (body.phone || body.telefone) {
    const texto = String(body.message ?? body.mensagem ?? body.text ?? "").trim();
    return {
      contactId: String(body.contactId ?? body.phone ?? body.telefone ?? ""),
      telefone: normalizePhone(String(body.phone ?? body.telefone ?? "")),
      nome: body.name ? String(body.name) : null,
      texto,
    };
  }

  return null;
}

/** Normaliza telefone: remove não-dígitos, garante DDI 55 */
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return phone;
  return digits.startsWith("55") ? digits : `55${digits}`;
}

/**
 * POST /api/webhook/unnichat/:agenteId
 *
 * Recebe mensagem do Unnichat → enfileira no buffer → aguarda debounce →
 * combina sequência de mensagens → responde via IA → envia via Unnichat API.
 *
 * O debounce garante que rajadas de mensagens enviadas em sequência rápida
 * (ex: "Oi" + "Bom dia" + "Tudo bem?") sejam tratadas como um único bloco,
 * enquanto mensagens enviadas com intervalo maior são tratadas separadamente.
 *
 * Endpoint público (sem JWT) — autenticado pelo agenteId na URL.
 */
export async function receberMensagemUnnichat(req: Request, res: Response) {
  const agenteId = String(req.params.agenteId);

  // 1. Busca o agente e valida integração
  const agente = await prisma.agente.findUnique({ where: { id: agenteId } });

  if (!agente) {
    return res.status(404).json({ error: "Agente não encontrado" });
  }
  if (!agente.unnichatAtivo) {
    return res.status(403).json({ error: "Integração Unnichat inativa para este agente" });
  }
  if (!agente.unnichatApiKey) {
    return res.status(500).json({ error: "API Key Unnichat não configurada" });
  }

  // 2. Extrai dados do payload
  const payload = extrairPayload(req.body as Record<string, unknown>);
  if (!payload || !payload.texto) {
    return res.status(200).json({ ok: true, ignorado: true, motivo: "Payload sem texto" });
  }

  const { contactId, telefone, nome, texto } = payload;

  // 3. Responde imediatamente ao Unnichat (evita timeout/retry)
  res.status(200).json({ ok: true, recebido: true, fila: true });

  // 4. Salva mensagem do cliente IMEDIATAMENTE (aparece na UI sem esperar debounce)
  //    e agenda o processamento da IA com debounce
  void (async () => {
    try {
      // Adiciona ao buffer de mensagens (para combinar no lote da IA)
      await addMessage(contactId, "text", texto);

      // Atualiza contexto em memória (preserva nome se já conhecido)
      const ctxAnterior = pendingContexts.get(contactId);
      pendingContexts.set(contactId, {
        agenteId: agente.id,
        telefone,
        nome: nome ?? ctxAnterior?.nome ?? null,
      });

      // Cria ou recupera o atendimento agora (não espera o debounce)
      let atendimento = await prisma.atendimento.findFirst({
        where: { telefone, canal: "unnichat", status: { not: "FINALIZADO" } },
      });

      if (!atendimento) {
        atendimento = await prisma.atendimento.create({
          data: {
            telefone,
            nome: nome ?? undefined,
            canal: "unnichat",
            status: "EM_ANDAMENTO",
            agenteId: agente.id,
            nomeAgente: agente.nome,
          },
        });
        broadcast("novo_atendimento", atendimento);
      } else if (nome && !atendimento.nome) {
        atendimento = await prisma.atendimento.update({
          where: { id: atendimento.id },
          data: { nome },
        });
      }

      // Salva mensagem do cliente no atendimento e transmite via SSE imediatamente
      const msgCliente = await prisma.mensagemAtendimento.create({
        data: {
          atendimentoId: atendimento.id,
          origem: "CLIENTE",
          conteudo: texto,
        },
      });
      await prisma.atendimento.update({
        where: { id: atendimento.id },
        data: { atualizadoEm: new Date() },
      });
      broadcast("nova_mensagem", { atendimentoId: atendimento.id, mensagem: msgCliente });

      // Agenda processamento da IA com debounce — mensagens rápidas em sequência
      // serão combinadas em um único bloco antes de chamar a IA
      scheduleProcessing(contactId, async (cId) => {
        const ctx = pendingContexts.get(cId);
        if (!ctx) return;
        pendingContexts.delete(cId);

        await processarLoteMensagens({
          agente,
          contactId: cId,
          telefone: ctx.telefone,
          nome: ctx.nome,
        }).catch((err) => {
          console.error("[UNNICHAT] Erro ao processar lote:", err instanceof Error ? err.message : err);
        });
      });
    } catch (err) {
      console.error("[UNNICHAT] Erro ao enfileirar mensagem:", err instanceof Error ? err.message : err);
    }
  })();
}

/**
 * Processa todas as mensagens pendentes no buffer para um contactId.
 * Combina os textos em ordem, chama a IA uma única vez e responde.
 */
async function processarLoteMensagens(params: {
  agente: {
    id: string;
    nome: string;
    modelo: string;
    temperatura: number;
    tokensMaximos: number;
    promptSistema: string;
    contextoProdutos: string | null;
    unnichatApiKey: string | null;
  };
  contactId: string;
  telefone: string;
  nome: string | null;
}) {
  const { agente, contactId, telefone, nome } = params;

  // 1. Busca todas as mensagens pendentes no buffer (em ordem de chegada)
  const mensagensBuffer = await getPendingMessages(contactId);
  if (mensagensBuffer.length === 0) return;

  // 2. Recupera o Atendimento (já foi criado no momento do recebimento)
  const atendimento = await prisma.atendimento.findFirst({
    where: { telefone, canal: "unnichat", status: { not: "FINALIZADO" } },
  });

  // Se por algum motivo o atendimento não existir, aborta silenciosamente
  if (!atendimento) return;

  // 3. Combina todos os textos pendentes em ordem (separados por nova linha)
  //    As mensagens do cliente já foram salvas no DB no momento do recebimento
  const textosCombinados = mensagensBuffer.map((m) => m.conteudo).join("\n");

  // 4. Carrega histórico contextual da conversa
  const memoria = await prisma.conversationMemory.findUnique({ where: { contactId } });
  const historico: HistoricoMensagem[] = Array.isArray(memoria?.historico)
    ? (memoria!.historico as HistoricoMensagem[])
    : [];

  // 5. Chama a IA com o bloco combinado de mensagens
  const respostaIA = await chatWithAgentHistory(
    {
      modelo: agente.modelo,
      temperatura: agente.temperatura,
      tokensMaximos: agente.tokensMaximos,
      promptSistema: agente.promptSistema,
      contextoProdutos: agente.contextoProdutos,
    },
    historico,
    textosCombinados,
  );

  // 6. Salva resposta da IA e transmite via SSE
  const msgIA = await prisma.mensagemAtendimento.create({
    data: {
      atendimentoId: atendimento.id,
      origem: "AGENTE_IA",
      conteudo: respostaIA,
    },
  });
  await prisma.atendimento.update({
    where: { id: atendimento.id },
    data: { atualizadoEm: new Date() },
  });
  broadcast("nova_mensagem", { atendimentoId: atendimento.id, mensagem: msgIA });

  // 7. Atualiza memória contextual (mantém últimas 20 trocas = 40 mensagens)
  const novoHistorico: HistoricoMensagem[] = [
    ...historico,
    { role: "user" as const, content: textosCombinados },
    { role: "assistant" as const, content: respostaIA },
  ].slice(-40);

  await prisma.conversationMemory.upsert({
    where: { contactId },
    create: { contactId, historico: novoHistorico },
    update: { historico: novoHistorico },
  });

  // 8. Envia resposta ao Unnichat em blocos separados com delay humanizado
  //    \n\n na resposta da IA = nova mensagem | \n = quebra de linha na mesma mensagem
  const blocos = splitMessageBlocks(respostaIA);
  for (let i = 0; i < blocos.length; i++) {
    await enviarMensagem(agente.unnichatApiKey!, telefone, blocos[i]);
    if (i < blocos.length - 1) {
      await sleep(calcMessageDelay(blocos[i]));
    }
  }

  // 9. Marca todas as mensagens do buffer como processadas
  await markProcessed(mensagensBuffer.map((m) => m.id));
}
