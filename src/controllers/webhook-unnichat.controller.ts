import { Request, Response } from "express";
import { prisma } from "../prisma/client";
import { chatWithAgentHistory, type HistoricoMensagem } from "../services/ia.service";
import { enviarMensagem } from "../services/unnichat.service";
import { broadcast } from "../services/sse.service";
import { addMessage, getPendingMessages, markProcessed, scheduleProcessing, updateTranscricao } from "../services/message-buffer.service";
import { splitMessageBlocks, calcMessageDelay, sleep } from "../utils/message-format";
import { transcribeAudio, analyzeImage } from "../services/openai.service";
import { log as logExecucao } from "../services/execution-logger.service";
import { logEvento } from "../services/evento-agente.service";

type MidiaTipo = "text" | "audio" | "image";

interface PayloadExtraido {
  contactId: string;
  telefone: string;
  nome: string | null;
  texto: string;        // texto da mensagem (vazio para áudio/imagem puro)
  tipo: MidiaTipo;
  mediaUrl?: string;    // URL da mídia quando tipo = audio | image
  produtoTag?: string;  // campo "produto" enviado pelo Unnichat — usado para triagem em agentes de Produtos Variados
}

/**
 * Contexto em memória por contactId — guarda agente, telefone, nome e
 * produto do lead entre o recebimento e o processamento após o debounce.
 */
const pendingContexts = new Map<string, {
  agenteId: string;
  telefone: string;
  nome: string | null;
  produtoTag?: string;
}>();

/**
 * Detecta o tipo de mídia a partir do campo `type` do Unnichat.
 * Vários valores possíveis (audio, voice, ptt, image, photo, sticker…).
 */
function detectarTipoPorCampo(raw?: string): MidiaTipo | null {
  if (!raw) return null;
  const t = raw.toLowerCase();
  if (t === "audio" || t === "voice" || t === "ptt") return "audio";
  if (t === "image" || t === "photo" || t === "sticker") return "image";
  if (t === "text" || t === "chat") return "text";
  return null;
}

/**
 * Detecta o tipo de mídia pela extensão da URL — usado como fallback quando
 * o campo `type` não está presente ou não é reconhecido.
 */
function detectarTipoPorUrl(url: string): MidiaTipo {
  const clean = url.split("?")[0].toLowerCase();
  if (/\.(ogg|mp3|wav|m4a|aac|opus|oga|mp4a)$/.test(clean)) return "audio";
  if (/\.(jpg|jpeg|png|gif|webp|bmp|svg|heic|heif)$/.test(clean)) return "image";
  return "text";
  
}

/**
 * Resolve o tipo final: campo `type` tem prioridade; fallback para extensão da URL.
 * Se nenhum indicador encontrado, assume "text".
 */
function detectarTipo(rawTipo?: string, url?: string): MidiaTipo {
  const porCampo = detectarTipoPorCampo(rawTipo);
  if (porCampo) return porCampo;
  if (url) return detectarTipoPorUrl(url);
  return "text";
}

/**
 * Extrai os campos relevantes do payload enviado pelo Unnichat.
 * Suporta mensagens de texto, áudio e imagem nos 3 formatos conhecidos.
 *
 * 1. Formato Unnichat Automação (data wrapper):
 *    { "data": { "phoneNumber": "...", "name": "...", "message": "...", "type": "audio" } }
 *
 * 2. Formato padrão com objetos aninhados:
 *    { "contact": { ... }, "message": { "type": "audio", "url": "...", "text": "" } }
 *
 * 3. Formato simplificado / plano:
 *    { "phone": "...", "name": "...", "message": "...", "type": "audio" }
 */
function extrairPayload(body: Record<string, unknown>): PayloadExtraido | null {
  // ── Formato 1: Unnichat Automação { data: { phoneNumber, ... } } ──────────────
  if (body.data && typeof body.data === "object") {
    const d = body.data as Record<string, unknown>;
    const phone = String(d.phoneNumber ?? d.phone ?? d.telefone ?? "");
    if (!phone) return null;

    const field = (d.field && typeof d.field === "object") ? d.field as Record<string, unknown> : {};

    // Tenta extrair texto e URL de vários campos possíveis
    const rawContent = String(
      d.message ?? d.text ?? d.mensagem ??
      field.message ?? field.text ?? field.mensagem ?? ""
    ).trim();

    // URL explícita de mídia tem prioridade; fallback para rawContent (Unnichat às vezes coloca a URL no campo message)
    const rawMediaUrl = String(d.mediaUrl ?? d.url ?? d.media ?? "").trim() || rawContent;

    // Detecta tipo: campo type primeiro, depois extensão da URL como fallback
    const tipo = detectarTipo(String(d.type ?? field.type ?? ""), rawMediaUrl);

    const mediaUrl = tipo !== "text" ? rawMediaUrl || undefined : undefined;

    const texto = tipo === "text" ? rawContent : "";

    // Rejeita se não tem nem texto nem URL de mídia
    if (!texto && !mediaUrl) return null;

    // Campo "produto" enviado pelo Unnichat na estrutura de automação
    const produtoTag = d.produto ? String(d.produto).trim() : undefined;

    return {
      contactId: String(d.id ?? phone),
      telefone: normalizePhone(phone),
      nome: d.name ? String(d.name) : null,
      texto,
      tipo,
      mediaUrl,
      produtoTag: produtoTag || undefined,
    };
  }

  // ── Formato 2: { contact, message } ──────────────────────────────────────────
  if (body.contact && body.message) {
    const contact = body.contact as Record<string, string>;
    const message = body.message as Record<string, string>;

    // URL da mídia pode estar em vários campos dependendo da versão do Unnichat
    const rawMediaUrl = (message.url ?? message.mediaUrl ?? message.body ?? message.text ?? "").trim();

    const tipo = detectarTipo(message.type, rawMediaUrl);

    const texto = tipo === "text"
      ? (message.text ?? message.conversation ?? message.body ?? "").trim()
      : "";

    const mediaUrl = tipo !== "text" ? rawMediaUrl || undefined : undefined;

    if (!texto && !mediaUrl) return null;

    return {
      contactId: contact.id ?? contact.phone ?? "",
      telefone: normalizePhone(contact.phone ?? ""),
      nome: contact.name ?? contact.pushName ?? null,
      texto,
      tipo,
      mediaUrl,
    };
  }

  // ── Formato 3: plano ──────────────────────────────────────────────────────────
  if (body.phone || body.telefone) {
    const rawContent = String(body.message ?? body.mensagem ?? body.text ?? "").trim();
    const rawMediaUrl = String(body.mediaUrl ?? body.url ?? body.media ?? rawContent).trim();

    const tipo = detectarTipo(String(body.type ?? ""), rawMediaUrl);

    const mediaUrl = tipo !== "text" ? rawMediaUrl || undefined : undefined;
    const texto = tipo === "text" ? rawContent : "";

    if (!texto && !mediaUrl) return null;

    return {
      contactId: String(body.contactId ?? body.phone ?? body.telefone ?? ""),
      telefone: normalizePhone(String(body.phone ?? body.telefone ?? "")),
      nome: body.name ? String(body.name) : null,
      texto,
      tipo,
      mediaUrl,
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

/** Texto legível para exibir na UI enquanto a transcrição/análise não está pronta. */
function placeholderMidia(tipo: MidiaTipo): string {
  if (tipo === "audio") return "🎵 [Áudio recebido — aguardando transcrição]";
  if (tipo === "image") return "🖼️ [Imagem recebida — aguardando análise]";
  return "";
}

/**
 * Detecta se o payload é uma notificação de template enviado pelo Unnichat ao lead.
 * Quando `data.template` existe com conteúdo, o Unnichat está informando que
 * disparou uma mensagem de template (ex: recuperação de carrinho) para o contato.
 * Neste caso o sistema deve armazenar e contextualizar, mas NÃO acionar a IA.
 */
function detectarTemplate(body: Record<string, unknown>): string | null {
  if (body.data && typeof body.data === "object") {
    const d = body.data as Record<string, unknown>;
    if (d.template && typeof d.template === "string" && d.template.trim()) {
      return d.template.trim();
    }
  }
  return null;
}

/**
 * Processa uma mensagem de template enviada pelo Unnichat ao lead.
 * Armazena no histórico do atendimento e na memória contextual (como mensagem
 * do assistente), para que a IA tenha contexto quando o lead responder.
 */
async function processarTemplate(
  res: Response,
  agente: { id: string; nome: string },
  rawBody: Record<string, unknown>,
  templateTexto: string,
) {
  const d = (rawBody.data as Record<string, unknown>);
  const phone = String(d.phoneNumber ?? d.phone ?? d.telefone ?? "");
  const telefone = normalizePhone(phone);
  const nome = d.name ? String(d.name) : null;
  const contactIdBase = String(d.id ?? phone);
  const contactId = `${agente.id}:${contactIdBase}`;

  // Responde imediatamente ao Unnichat
  res.status(200).json({ ok: true, tipo: "template", armazenado: true });

  void (async () => {
    try {
      void logEvento({
        agenteId: agente.id,
        tipo: "TEMPLATE_ENVIADO",
        canal: "unnichat",
        contactId: contactIdBase,
        payload: rawBody,
      });

      // Cria ou recupera atendimento
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

      // Salva o template como mensagem de saída do agente no histórico visual
      const conteudoTemplate = `📨 [Mensagem enviada ao lead]\n${templateTexto}`;
      const msgTemplate = await prisma.mensagemAtendimento.create({
        data: {
          atendimentoId: atendimento.id,
          origem: "AGENTE_IA",
          conteudo: conteudoTemplate,
        },
      });
      await prisma.atendimento.update({
        where: { id: atendimento.id },
        data: { atualizadoEm: new Date() },
      });
      broadcast("nova_mensagem", { atendimentoId: atendimento.id, mensagem: msgTemplate });

      // Persiste na memória contextual como mensagem do assistente
      // para que a IA saiba o que foi enviado ao lead antes de ele responder
      const memoria = await prisma.conversationMemory.findUnique({ where: { contactId } });
      const historicoAtual: HistoricoMensagem[] = Array.isArray(memoria?.historico)
        ? (memoria!.historico as HistoricoMensagem[])
        : [];

      const novoHistorico: HistoricoMensagem[] = [
        ...historicoAtual,
        { role: "assistant" as const, content: `[Mensagem enviada ao lead]\n${templateTexto}` },
      ].slice(-40);

      await prisma.conversationMemory.upsert({
        where: { contactId },
        create: { contactId, historico: novoHistorico },
        update: { historico: novoHistorico },
      });

      console.log(`[UNNICHAT] Template armazenado para ${telefone} (agente ${agente.id})`);
    } catch (err) {
      console.error("[UNNICHAT] Erro ao processar template:", err instanceof Error ? err.message : err);
    }
  })();
}

/**
 * POST /api/webhook/unnichat/:agenteId
 *
 * Recebe mensagem do Unnichat → enfileira no buffer → aguarda debounce →
 * combina sequência de mensagens (transcrevendo áudio/imagens) → responde via IA.
 *
 * Caso especial: payload com `data.template` = notificação de template enviado
 * pelo Unnichat ao lead → armazena contexto, NÃO aciona a IA.
 */
export async function receberMensagemUnnichat(req: Request, res: Response) {
  const agenteId = String(req.params.agenteId);

  // 1. Busca o agente e valida integração
  const agente = await prisma.agente.findUnique({
    where: { id: agenteId },
    include: { conexaoUnnichat: true },
  });

  if (!agente) {
    return res.status(404).json({ error: "Agente não encontrado" });
  }
  if (!agente.unnichatAtivo) {
    return res.status(403).json({ error: "Integração Unnichat inativa para este agente" });
  }

  // Resolve API key: da conexão vinculada ao agente
  const unnichatApiKey = agente.conexaoUnnichat?.apiKey ?? agente.unnichatApiKey;
  if (!unnichatApiKey) {
    return res.status(500).json({ error: "Nenhuma conexão Unnichat configurada para este agente. Vincule uma conexão em Configurações → Unnichat." });
  }

  const rawBody = req.body as Record<string, unknown>;

  // 2. Verifica se é um evento de template (mensagem enviada pelo Unnichat ao lead)
  //    Neste caso: armazena como contexto e retorna — sem acionar a IA.
  const templateTexto = detectarTemplate(rawBody);
  if (templateTexto !== null) {
    return processarTemplate(res, agente, rawBody, templateTexto);
  }

  // 3. Extrai dados do payload (texto OU mídia enviado pelo lead)
  const payload = extrairPayload(rawBody);

  if (!payload) {
    void logEvento({
      agenteId,
      tipo: "MENSAGEM_RECEBIDA",
      canal: "unnichat",
      payload: rawBody,
      erro: "Payload sem conteúdo reconhecível",
    });
    return res.status(200).json({ ok: true, ignorado: true, motivo: "Payload sem conteúdo" });
  }

  const { telefone, nome, texto, tipo, mediaUrl, produtoTag } = payload;

  // Namespacing por agente: garante isolamento total de memória e buffer entre agentes.
  // O mesmo número de telefone pode falar com agentes diferentes sem cruzar histórico.
  const contactId = `${agenteId}:${payload.contactId}`;

  // 3. Responde imediatamente ao Unnichat (evita timeout/retry)
  res.status(200).json({ ok: true, recebido: true, fila: true });

  // 4. Enfileira e agenda processamento
  void (async () => {
    try {
      // Loga evento de recebimento com payload completo para auditoria
      void logEvento({
        agenteId,
        tipo: "MENSAGEM_RECEBIDA",
        canal: "unnichat",
        contactId: payload.contactId,
        payload: {
          telefone: payload.telefone,
          nome: payload.nome,
          tipo: payload.tipo,
          texto: payload.texto,
          mediaUrl: payload.mediaUrl,
          raw: rawBody,
        },
      });

      // Conteúdo salvo no buffer: texto puro ou a URL da mídia (será transcrita depois)
      const conteudoBuffer = tipo === "text" ? texto : (mediaUrl ?? texto);
      await addMessage(contactId, tipo, conteudoBuffer, mediaUrl);

      // Atualiza contexto em memória
      const ctxAnterior = pendingContexts.get(contactId);
      pendingContexts.set(contactId, {
        agenteId: agente.id,
        telefone,
        nome: nome ?? ctxAnterior?.nome ?? null,
        // produtoTag: mantém o valor mais recente — se o lead enviou várias msgs,
        // a última que trouxer o campo vence; caso não venha, preserva o anterior.
        produtoTag: produtoTag ?? ctxAnterior?.produtoTag,
      });

      // Cria ou recupera o atendimento imediatamente (não espera debounce)
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

      // Salva mensagem do cliente na UI imediatamente
      // Para mídia: mostra placeholder legível (não a URL bruta)
      const conteudoUI = tipo === "text" ? texto : placeholderMidia(tipo);
      const msgCliente = await prisma.mensagemAtendimento.create({
        data: {
          atendimentoId: atendimento.id,
          origem: "CLIENTE",
          conteudo: conteudoUI,
        },
      });
      await prisma.atendimento.update({
        where: { id: atendimento.id },
        data: { atualizadoEm: new Date() },
      });
      broadcast("nova_mensagem", { atendimentoId: atendimento.id, mensagem: msgCliente });

      // Agenda processamento da IA com debounce
      scheduleProcessing(contactId, async (cId) => {
        const ctx = pendingContexts.get(cId);
        if (!ctx) return;
        pendingContexts.delete(cId);

        await processarLoteMensagens({
          agente,
          unnichatApiKey,
          contactId: cId,
          telefone: ctx.telefone,
          nome: ctx.nome,
          produtoTag: ctx.produtoTag,
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
 * Transcreve áudio e analisa imagens antes de enviar para a IA.
 */
/** Interface de um produto variado armazenado em contextoProdutos (JSON) */
interface ProdutoVariadoCtx {
  nome: string;
  descricao?: string;
  linkVendas?: string;
  valorProduto?: string;
  valorParcelado?: string;
  formasPagamento?: string;
}

/**
 * Quando o agente é do tipo Produtos Variados (`produto === "PRODUTOS_VARIADOS"`),
 * resolve o contexto correto a partir do campo `produtoTag` vindo do payload.
 *
 * Algoritmo de matching (em ordem de prioridade):
 *   1. Correspondência exata (case-insensitive)
 *   2. Nome do produto contém a tag ou vice-versa
 *   3. Fallback: inclui todos os produtos no contexto
 */
function resolverContextoProdutoVariado(
  contextoProdutosJson: string,
  produtoTag: string | undefined,
): string {
  let produtos: ProdutoVariadoCtx[] = [];

  try {
    const parsed = JSON.parse(contextoProdutosJson);
    if (Array.isArray(parsed)) produtos = parsed as ProdutoVariadoCtx[];
  } catch {
    return contextoProdutosJson; // não é JSON — retorna como está
  }

  if (produtos.length === 0) return contextoProdutosJson;

  const formatarProduto = (p: ProdutoVariadoCtx) => {
    const linhas = [`Produto: ${p.nome}`];
    if (p.descricao)       linhas.push(`Descrição: ${p.descricao}`);
    if (p.valorProduto)    linhas.push(`Valor: ${p.valorProduto}`);
    if (p.valorParcelado)  linhas.push(`Parcelamento: ${p.valorParcelado}`);
    if (p.formasPagamento) linhas.push(`Formas de pagamento: ${p.formasPagamento}`);
    if (p.linkVendas)      linhas.push(`Link de compra: ${p.linkVendas}`);
    return linhas.join("\n");
  };

  if (!produtoTag) {
    // Sem tag: passa todos os produtos como contexto
    console.log("[UNNICHAT] produtoTag ausente — usando todos os produtos variados como contexto");
    return produtos.map(formatarProduto).join("\n\n---\n\n");
  }

  const tagLower = produtoTag.toLowerCase().trim();

  // 1. Exato
  let encontrado = produtos.find((p) => p.nome.toLowerCase().trim() === tagLower);

  // 2. Contém
  if (!encontrado) {
    encontrado = produtos.find(
      (p) => p.nome.toLowerCase().includes(tagLower) || tagLower.includes(p.nome.toLowerCase().trim()),
    );
  }

  if (encontrado) {
    console.log(`[UNNICHAT] Produto identificado pela tag "${produtoTag}": "${encontrado.nome}"`);
    return formatarProduto(encontrado);
  }

  // 3. Fallback: todos os produtos + aviso
  console.warn(`[UNNICHAT] Nenhum produto encontrado para tag "${produtoTag}" — enviando todos como contexto`);
  return `[Produto solicitado: "${produtoTag}" — não encontrado na lista. Contexto completo abaixo:]\n\n` +
    produtos.map(formatarProduto).join("\n\n---\n\n");
}

async function processarLoteMensagens(params: {
  agente: {
    id: string;
    nome: string;
    modelo: string;
    temperatura: number;
    tokensMaximos: number;
    promptSistema: string;
    contextoProdutos: string | null;
    produto: string | null;
    unnichatApiKey: string | null;
  };
  unnichatApiKey: string;
  contactId: string;
  telefone: string;
  nome: string | null;
  produtoTag?: string;
}) {
  const { agente, unnichatApiKey, contactId, telefone, produtoTag } = params;

  // 1. Busca todas as mensagens pendentes no buffer (em ordem de chegada)
  const mensagensBuffer = await getPendingMessages(contactId);
  if (mensagensBuffer.length === 0) return;

  // 2. Recupera o atendimento
  const atendimento = await prisma.atendimento.findFirst({
    where: { telefone, canal: "unnichat", status: { not: "FINALIZADO" } },
  });
  if (!atendimento) return;

  // 3. Resolve cada mensagem: transcreve áudio, descreve imagens, mantém texto puro
  const textosResolvidos: string[] = [];

  for (const msg of mensagensBuffer) {
    let textoFinal = msg.conteudo;

    if (msg.tipo === "audio" && msg.mediaUrl) {
      try {
        console.log(`[UNNICHAT] Transcrevendo áudio: ${msg.mediaUrl}`);
        textoFinal = await transcribeAudio(msg.mediaUrl);
        await updateTranscricao(msg.id, textoFinal);

        // Atualiza o registro de UI com a transcrição real
        await prisma.mensagemAtendimento.updateMany({
          where: {
            atendimentoId: atendimento.id,
            origem: "CLIENTE",
            conteudo: placeholderMidia("audio"),
          },
          data: { conteudo: `🎵 [Áudio] ${textoFinal}` },
        });
      } catch (err) {
        console.error("[UNNICHAT] Falha ao transcrever áudio:", err instanceof Error ? err.message : err);
        textoFinal = "[O cliente enviou um áudio que não foi possível transcrever]";
      }
    } else if (msg.tipo === "image" && msg.mediaUrl) {
      try {
        console.log(`[UNNICHAT] Analisando imagem: ${msg.mediaUrl}`);
        textoFinal = await analyzeImage(msg.mediaUrl);
        await updateTranscricao(msg.id, textoFinal);

        // Atualiza o registro de UI com a descrição real
        await prisma.mensagemAtendimento.updateMany({
          where: {
            atendimentoId: atendimento.id,
            origem: "CLIENTE",
            conteudo: placeholderMidia("image"),
          },
          data: { conteudo: `🖼️ [Imagem] ${textoFinal}` },
        });
      } catch (err) {
        console.error("[UNNICHAT] Falha ao analisar imagem:", err instanceof Error ? err.message : err);
        textoFinal = "[O cliente enviou uma imagem que não foi possível analisar]";
      }
    }

    if (textoFinal.trim()) {
      textosResolvidos.push(textoFinal.trim());
    }
  }

  const textosCombinados = textosResolvidos.join("\n");
  if (!textosCombinados.trim()) {
    await markProcessed(mensagensBuffer.map((m) => m.id));
    return;
  }

  // 4. Carrega histórico contextual da conversa
  const memoria = await prisma.conversationMemory.findUnique({ where: { contactId } });
  let historico: HistoricoMensagem[] = Array.isArray(memoria?.historico)
    ? (memoria!.historico as HistoricoMensagem[])
    : [];

  // Fallback: se a memória está vazia (primeiro contato, restart ou contactId novo),
  // reconstrói o histórico a partir das últimas 30 mensagens do atendimento no banco.
  // Isso garante que a IA sempre tem contexto mesmo sem ConversationMemory.
  if (historico.length === 0) {
    const msgsBanco = await prisma.mensagemAtendimento.findMany({
      where: { atendimentoId: atendimento.id },
      orderBy: { criadoEm: "desc" },
      take: 30,
      select: { origem: true, conteudo: true },
    });

    if (msgsBanco.length > 0) {
      historico = msgsBanco
        .reverse() // volta à ordem cronológica
        .map((m) => ({
          role: m.origem === "CLIENTE" ? ("user" as const) : ("assistant" as const),
          content: m.conteudo,
        }));
      console.log(`[UNNICHAT] Histórico reconstruído do banco: ${historico.length} msgs para ${contactId}`);
    }
  }

  // 5. Resolve contexto de produto (triagem para Produtos Variados)
  //    Para agentes normais: usa contextoProdutos direto.
  //    Para Produtos Variados: resolve o produto correto pelo campo "produto" do payload.
  let contextoProdutosResolvido = agente.contextoProdutos;

  if (agente.produto === "PRODUTOS_VARIADOS" && agente.contextoProdutos) {
    contextoProdutosResolvido = resolverContextoProdutoVariado(agente.contextoProdutos, produtoTag);
  }

  // 6. Chama a IA com o bloco combinado e resolvido
  const inicio = Date.now();
  let respostaIA = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let erroIA: string | undefined;

  try {
    const resultado = await chatWithAgentHistory(
      {
        modelo: agente.modelo,
        temperatura: agente.temperatura,
        tokensMaximos: agente.tokensMaximos,
        promptSistema: agente.promptSistema,
        contextoProdutos: contextoProdutosResolvido,
        agenteId: agente.id,
      },
      historico,
      textosCombinados,
    );
    respostaIA   = resultado.content;
    inputTokens  = resultado.inputTokens;
    outputTokens = resultado.outputTokens;
  } catch (err) {
    erroIA = err instanceof Error ? err.message : String(err);
    console.error("[UNNICHAT] Erro na chamada à IA:", erroIA);
  }

  const duracao = Date.now() - inicio;

  // 7. Registra execução com custo real (tokens captados de todos os provedores)
  await logExecucao({
    contactId,
    agenteId: agente.id,
    modelo:   agente.modelo,
    canal:    "unnichat",
    inputMensagem: textosCombinados,
    classificacao: "LEAD_REAL",
    resposta:  respostaIA || undefined,
    inputTokens,
    outputTokens,
    duracao,
    erro: erroIA,
  });

  if (!respostaIA) {
    await markProcessed(mensagensBuffer.map((m) => m.id));
    return;
  }

  // 8. Divide em blocos e salva CADA BLOCO como mensagem separada
  //    (cada bloco terá seu próprio ID → permite like/dislike por mensagem individual)
  const blocos = splitMessageBlocks(respostaIA);
  const blocosFinais = blocos.length > 0 ? blocos : [respostaIA];

  for (const bloco of blocosFinais) {
    const msgIA = await prisma.mensagemAtendimento.create({
      data: {
        atendimentoId: atendimento.id,
        origem: "AGENTE_IA",
        conteudo: bloco,
      },
    });
    broadcast("nova_mensagem", { atendimentoId: atendimento.id, mensagem: msgIA });
  }

  await prisma.atendimento.update({
    where: { id: atendimento.id },
    data: { atualizadoEm: new Date() },
  });

  // 9. Atualiza memória contextual (mantém últimas 20 trocas = 40 mensagens)
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

  // 10. Envia cada bloco ao Unnichat com delay humanizado entre eles
  for (let i = 0; i < blocosFinais.length; i++) {
    await enviarMensagem(unnichatApiKey, telefone, blocosFinais[i]);
    if (i < blocosFinais.length - 1) {
      await sleep(calcMessageDelay(blocosFinais[i]));
    }
  }

  // 11. Marca todas as mensagens do buffer como processadas
  await markProcessed(mensagensBuffer.map((m) => m.id));

  // 12. Loga resultado do processamento para monitoramento
  void logEvento({
    agenteId: agente.id,
    tipo: "LOTE_PROCESSADO",
    canal: "unnichat",
    contactId,
    payload: {
      mensagens: mensagensBuffer.length,
      tokens: { input: inputTokens, output: outputTokens },
      duracao,
      erro: erroIA ?? null,
    },
    erro: erroIA,
  });
}
