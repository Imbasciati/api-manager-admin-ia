import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../prisma/client";
import { broadcast } from "../services/sse.service";
import { fail, ok } from "../utils/response";

/**
 * Payload esperado do n8n.
 * Todos os campos são opcionais exceto `telefone` e `mensagem`.
 * O campo `evento` controla a ação executada.
 */
const payloadSchema = z.object({
  evento: z.enum(["NOVA_MENSAGEM", "NOVO_ATENDIMENTO", "ATENDIMENTO_FINALIZADO"]).default("NOVA_MENSAGEM"),
  conversaId: z.string().optional(),
  telefone: z.string().min(1),
  nome: z.string().optional(),
  campanha: z.string().optional(),
  canal: z.string().optional(),
  mensagem: z.string().optional(),
  origem: z.enum(["CLIENTE", "AGENTE_IA", "VENDEDOR"]).default("CLIENTE"),
});

export async function receberEvento(req: Request, res: Response) {
  // Valida token — aceita via header ou query param
  const token =
    String(req.headers["x-webhook-token"] ?? req.query.token ?? "").trim();

  if (!token) {
    return fail(res, 401, "Token de webhook obrigatório", "WEBHOOK_TOKEN_MISSING");
  }

  const config = await prisma.configuracaoWebhook.findUnique({
    where: { token },
  });

  if (!config || !config.ativo) {
    return fail(res, 401, "Token inválido ou webhook desativado", "WEBHOOK_TOKEN_INVALID");
  }

  // Valida payload
  const parsed = payloadSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(
      res,
      400,
      `Payload inválido: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
      "WEBHOOK_PAYLOAD_INVALID",
    );
  }

  const { evento, conversaId, telefone, nome, campanha, canal, mensagem, origem } = parsed.data;

  let atendimento;

  if (evento === "ATENDIMENTO_FINALIZADO") {
    // Finaliza conversa existente
    const where = conversaId ? { conversaId } : undefined;
    if (where) {
      atendimento = await prisma.atendimento.update({
        where,
        data: { status: "FINALIZADO" },
        include: { mensagens: { orderBy: { criadoEm: "asc" } } },
      });
      broadcast("status_alterado", {
        atendimentoId: atendimento.id,
        status: "FINALIZADO",
      });
    }
  } else {
    // Encontra ou cria o atendimento
    atendimento = conversaId
      ? await prisma.atendimento.findUnique({ where: { conversaId } })
      : null;

    if (!atendimento) {
      atendimento = await prisma.atendimento.create({
        data: {
          conversaId: conversaId ?? undefined,
          telefone,
          nome,
          campanha,
          canal: canal ?? "whatsapp",
          status: "EM_ANDAMENTO",
        },
        include: { mensagens: true },
      });
      broadcast("novo_atendimento", atendimento);
    } else if (nome && !atendimento.nome) {
      // Atualiza nome se chegou agora
      atendimento = await prisma.atendimento.update({
        where: { id: atendimento.id },
        data: { nome, status: "EM_ANDAMENTO", atualizadoEm: new Date() },
        include: { mensagens: { orderBy: { criadoEm: "asc" } } },
      });
    }

    // Adiciona mensagem se enviada
    if (mensagem) {
      const novaMensagem = await prisma.mensagemAtendimento.create({
        data: {
          atendimentoId: atendimento.id,
          conteudo: mensagem,
          origem,
        },
      });

      // Atualiza timestamp do atendimento
      await prisma.atendimento.update({
        where: { id: atendimento.id },
        data: { atualizadoEm: new Date() },
      });

      broadcast("nova_mensagem", {
        atendimentoId: atendimento.id,
        mensagem: novaMensagem,
      });
    }
  }

  // Incrementa contador do webhook
  await prisma.configuracaoWebhook.update({
    where: { token },
    data: {
      totalEventos: { increment: 1 },
      ultimoEventoEm: new Date(),
    },
  });

  return ok(res, { recebido: true, evento, atendimentoId: atendimento?.id });
}
