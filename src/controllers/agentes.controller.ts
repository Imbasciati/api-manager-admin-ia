import { Request, Response } from "express";
import { z } from "zod";
import OpenAI, { toFile } from "openai";
import { prisma } from "../prisma/client";
import { chatWithAgent, getApiKey } from "../services/ia.service";
import { testarConexao } from "../services/unnichat.service";
import { registrarLog } from "../services/log.service";
import { asyncHandler } from "../utils/asyncHandler";
import { AppError } from "../utils/errors";
import { parsePagination } from "../utils/query";
import { ok } from "../utils/response";

const agenteSchema = z.object({
  nome: z.string().min(3),
  promptSistema: z.string().min(10),
  contextoProdutos: z.string().optional().nullable(),
  tom: z.enum(["PROFISSIONAL", "CASUAL", "FORMAL", "AMIGAVEL"]),
  modelo: z.string().min(2),
  temperatura: z.coerce.number().min(0).max(2),
  tokensMaximos: z.coerce.number().int().min(50).max(4000),
  ativo: z.coerce.boolean().optional(),
  todosVendedores: z.coerce.boolean().optional(),
  canalIntegracao: z.enum(["NENHUM", "UNNICHAT", "MANYCHAT", "AMBOS"]).optional(),
  unnichatAtivo: z.coerce.boolean().optional(),
  unnichatApiKey: z.string().optional().nullable(),
  unnichatConexaoNome: z.string().optional().nullable(),
  produto: z.string().optional().nullable(),
  atuacao: z.string().optional().nullable(),
});

export const listAgentes = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, skip } = parsePagination(req);
  const [total, data] = await Promise.all([
    prisma.agente.count(),
    prisma.agente.findMany({
      skip,
      take: limit,
      orderBy: { criadoEm: "desc" },
      include: {
        documentos: true,
        _count: { select: { vendedores: true } },
      },
    }),
  ]);

  return ok(res, data, { total, page, limit });
});

export const createAgente = asyncHandler(async (req: Request, res: Response) => {
  const body = agenteSchema.parse(req.body);

  const agente = await prisma.agente.create({
    data: {
      ...body,
      ativo: body.ativo ?? true,
      todosVendedores: body.todosVendedores ?? true,
      documentos: {
        create:
          (req.files as Express.Multer.File[] | undefined)?.map((file) => ({
            nome: file.originalname,
            path: file.path,
            tamanho: file.size,
          })) ?? [],
      },
    },
    include: { documentos: true },
  });

  if (req.user?.id) {
    registrarLog({
      usuarioId: req.user.id,
      ip: req.ip,
      evento: "ACAO",
      acao: "CRIAR_AGENTE",
      descricao: `Criou o agente "${agente.nome}"`,
      entidade: "Agente",
      entidadeId: agente.id,
    });
  }

  return ok(res, agente);
});

export const getAgente = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const agente = await prisma.agente.findUnique({
    where: { id },
    include: { documentos: true, vendedores: true },
  });

  if (!agente) {
    throw new AppError("Agente não encontrado", 404, "NOT_FOUND");
  }

  return ok(res, agente);
});

export const updateAgente = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const body = agenteSchema.partial().parse(req.body);
  const agente = await prisma.agente.update({
    where: { id },
    data: body,
    include: { documentos: true },
  });

  if (req.user?.id) {
    registrarLog({
      usuarioId: req.user.id,
      ip: req.ip,
      evento: "ACAO",
      acao: "EDITAR_AGENTE",
      descricao: `Editou o agente "${agente.nome}"`,
      entidade: "Agente",
      entidadeId: agente.id,
    });
  }

  return ok(res, agente);
});

export const duplicarAgente = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const base = await prisma.agente.findUnique({
    where: { id },
    include: { documentos: true },
  });

  if (!base) {
    throw new AppError("Agente não encontrado", 404, "NOT_FOUND");
  }

  const novo = await prisma.agente.create({
    data: {
      nome: `${base.nome} (Cópia)`,
      promptSistema: base.promptSistema,
      contextoProdutos: base.contextoProdutos,
      tom: base.tom,
      modelo: base.modelo,
      temperatura: base.temperatura,
      tokensMaximos: base.tokensMaximos,
      ativo: false,
      todosVendedores: base.todosVendedores,
      documentos: {
        create: base.documentos.map((doc) => ({
          nome: doc.nome,
          path: doc.path,
          tamanho: doc.tamanho,
        })),
      },
    },
    include: { documentos: true },
  });

  return ok(res, novo);
});

export const changeAgenteStatus = asyncHandler(async (req: Request, res: Response) => {
  const body = z.object({ ativo: z.boolean() }).parse(req.body);
  const id = String(req.params.id);
  const agente = await prisma.agente.update({
    where: { id },
    data: { ativo: body.ativo },
    select: { id: true, ativo: true },
  });

  return ok(res, agente);
});

export const deleteAgente = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const agente = await prisma.agente.findUnique({ where: { id }, select: { nome: true } });
  await prisma.agente.delete({ where: { id } });

  if (req.user?.id) {
    registrarLog({
      usuarioId: req.user.id,
      ip: req.ip,
      evento: "ACAO",
      acao: "EXCLUIR_AGENTE",
      descricao: `Excluiu o agente "${agente?.nome ?? id}"`,
      entidade: "Agente",
      entidadeId: id,
    });
  }

  return ok(res, { message: "Agente excluído com sucesso" });
});

export const chatAgente = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id);
  // Aceita JSON (mensagem obrigatória) ou multipart/form-data (imagem opcional)
  const mensagem = String(req.body.mensagem ?? "");
  const imagem   = req.file as Express.Multer.File | undefined;

  if (!mensagem && !imagem) {
    throw new AppError("Envie uma mensagem ou imagem", 400);
  }

  const agente = await prisma.agente.findUnique({ where: { id } });
  if (!agente) throw new AppError("Agente não encontrado", 404, "NOT_FOUND");

  const resposta = await chatWithAgent(
    { modelo: agente.modelo, temperatura: agente.temperatura, tokensMaximos: agente.tokensMaximos, promptSistema: agente.promptSistema, contextoProdutos: agente.contextoProdutos },
    mensagem || "Descreva esta imagem.",
    imagem?.buffer,
    imagem?.mimetype,
  );

  return ok(res, { resposta });
});

export const transcribeAudio = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw new AppError("Arquivo de áudio obrigatório", 400);

  // Normaliza MIME type — remove parâmetros de codec ("audio/webm;codecs=opus" → "audio/webm")
  const baseMime = req.file.mimetype.split(";")[0].trim();

  const extMap: Record<string, string> = {
    "audio/webm": "webm", "audio/ogg": "ogg",  "audio/mp4": "mp4",
    "audio/mpeg": "mp3",  "audio/wav": "wav",   "audio/flac": "flac",
    "audio/x-m4a": "m4a", "audio/m4a": "m4a",
  };
  const ext      = extMap[baseMime] ?? "webm";
  const filename = `audio.${ext}`;

  const apiKey = await getApiKey("openai");
  const client = new OpenAI({ apiKey });

  const transcription = await client.audio.transcriptions.create({
    file: await toFile(req.file.buffer, filename, { type: baseMime }),
    model: "whisper-1",
    language: "pt",
  });

  return ok(res, { transcricao: transcription.text });
});

export const removeDocumento = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const docId = String(req.params.docId);
  await prisma.documento.deleteMany({ where: { id: docId, agenteId: id } });
  return ok(res, { message: "Documento removido" });
});

export const testarConexaoUnnichat = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const agente = await prisma.agente.findUnique({ where: { id }, select: { unnichatApiKey: true } });

  if (!agente) throw new AppError("Agente não encontrado", 404, "NOT_FOUND");
  if (!agente.unnichatApiKey) throw new AppError("API Key Unnichat não configurada", 400);

  const resultado = await testarConexao(agente.unnichatApiKey);
  return ok(res, resultado);
});

