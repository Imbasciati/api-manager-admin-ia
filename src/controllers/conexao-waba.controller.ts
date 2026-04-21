import type { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { wabaService } from "../services/waba.service";

// ── helpers ───────────────────────────────────────────────────────────────────

function maskToken(token: string): string {
  if (token.length <= 8) return "****";
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

function formatarConexao(c: {
  id: string;
  nome: string;
  wabaId: string;
  phoneNumberId: string;
  accessToken: string;
  displayPhone: string | null;
  qualidade: string | null;
  ativo: boolean;
  criadoEm: Date;
  _count: { agentes: number };
}) {
  return {
    id:                 c.id,
    nome:               c.nome,
    wabaId:             c.wabaId,
    phoneNumberId:      c.phoneNumberId,
    accessTokenMasked:  maskToken(c.accessToken),
    displayPhone:       c.displayPhone,
    qualidade:          c.qualidade,
    ativo:              c.ativo,
    agentesCount:       c._count.agentes,
    criadoEm:           c.criadoEm,
  };
}

// ── list ──────────────────────────────────────────────────────────────────────

export async function listConexoesWABA(req: Request, res: Response) {
  try {
    const conexoes = await prisma.conexaoWABA.findMany({
      orderBy: { criadoEm: "desc" },
      include: { _count: { select: { agentes: true } } },
    });
    res.json({ success: true, data: conexoes.map(formatarConexao) });
  } catch {
    res.status(500).json({ success: false, error: "Erro ao listar conexões WABA" });
  }
}

// ── OAuth Embedded Signup ─────────────────────────────────────────────────────
// Recebe o `code` retornado pelo popup do Meta, troca por token e salva a conexão.

export async function conectarViaOAuth(req: Request, res: Response) {
  const { code, nome } = req.body as { code?: string; nome?: string };

  if (!code || !nome?.trim()) {
    return res.status(400).json({ success: false, error: "code e nome são obrigatórios" });
  }

  try {
    const tokenData = await wabaService.exchangeCode(code);
    const wabaInfo  = await wabaService.getWABAInfo(tokenData.access_token);

    const conexao = await prisma.conexaoWABA.create({
      data: {
        nome:          nome.trim(),
        wabaId:        wabaInfo.wabaId,
        phoneNumberId: wabaInfo.phoneNumberId,
        accessToken:   tokenData.access_token,
        displayPhone:  wabaInfo.displayPhone,
        qualidade:     wabaInfo.qualidade ?? "UNKNOWN",
      },
      include: { _count: { select: { agentes: true } } },
    });

    res.json({ success: true, data: formatarConexao(conexao) });
  } catch (err: unknown) {
    const e = err as { message?: string };
    console.error("[WABA] Erro no OAuth callback:", e?.message);
    res.status(500).json({ success: false, error: e?.message ?? "Erro ao conectar conta WABA" });
  }
}

// ── create manual ─────────────────────────────────────────────────────────────
// Permite criar a conexão inserindo as credenciais manualmente (sem Embedded Signup).

export async function createConexaoWABA(req: Request, res: Response) {
  const { nome, wabaId, phoneNumberId, accessToken } = req.body as {
    nome?: string;
    wabaId?: string;
    phoneNumberId?: string;
    accessToken?: string;
  };

  if (!nome?.trim() || !wabaId?.trim() || !phoneNumberId?.trim() || !accessToken?.trim()) {
    return res.status(400).json({ success: false, error: "nome, wabaId, phoneNumberId e accessToken são obrigatórios" });
  }

  try {
    const conexao = await prisma.conexaoWABA.create({
      data: { nome: nome.trim(), wabaId: wabaId.trim(), phoneNumberId: phoneNumberId.trim(), accessToken: accessToken.trim() },
      include: { _count: { select: { agentes: true } } },
    });
    res.json({ success: true, data: formatarConexao(conexao) });
  } catch {
    res.status(500).json({ success: false, error: "Erro ao criar conexão WABA" });
  }
}

// ── update ────────────────────────────────────────────────────────────────────

export async function updateConexaoWABA(req: Request, res: Response) {
  const { id } = req.params;
  const { nome, accessToken } = req.body as { nome?: string; accessToken?: string };

  try {
    const conexao = await prisma.conexaoWABA.update({
      where: { id },
      data: {
        ...(nome?.trim()        ? { nome: nome.trim() }               : {}),
        ...(accessToken?.trim() ? { accessToken: accessToken.trim() } : {}),
      },
      include: { _count: { select: { agentes: true } } },
    });
    res.json({ success: true, data: formatarConexao(conexao) });
  } catch {
    res.status(500).json({ success: false, error: "Conexão não encontrada ou erro ao atualizar" });
  }
}

// ── delete ────────────────────────────────────────────────────────────────────

export async function deleteConexaoWABA(req: Request, res: Response) {
  const { id } = req.params;

  try {
    const conexao = await prisma.conexaoWABA.findUnique({
      where:   { id },
      include: { _count: { select: { agentes: true } } },
    });

    if (!conexao) return res.status(404).json({ success: false, error: "Conexão não encontrada" });

    if (conexao._count.agentes > 0) {
      return res.status(400).json({
        success: false,
        error: `Desvincule os ${conexao._count.agentes} agente(s) antes de excluir esta conexão.`,
      });
    }

    await prisma.conexaoWABA.delete({ where: { id } });
    res.json({ success: true, data: { deleted: true } });
  } catch {
    res.status(500).json({ success: false, error: "Erro ao excluir conexão WABA" });
  }
}

// ── testar ────────────────────────────────────────────────────────────────────

export async function testarConexaoWABA(req: Request, res: Response) {
  const { id } = req.params;

  try {
    const conexao = await prisma.conexaoWABA.findUnique({ where: { id } });
    if (!conexao) return res.status(404).json({ success: false, error: "Conexão não encontrada" });

    const resultado = await wabaService.testarConexao(conexao.phoneNumberId, conexao.accessToken);
    res.json({ success: true, data: resultado });
  } catch (err: unknown) {
    const e = err as { message?: string };
    res.status(500).json({ success: true, data: { ok: false, mensagem: e?.message ?? "Erro no teste" } });
  }
}

// ── templates ─────────────────────────────────────────────────────────────────

export async function listarTemplatesWABA(req: Request, res: Response) {
  const { id } = req.params;

  try {
    const conexao = await prisma.conexaoWABA.findUnique({ where: { id } });
    if (!conexao) return res.status(404).json({ success: false, error: "Conexão não encontrada" });

    const templates = await wabaService.listarTemplates(conexao.wabaId, conexao.accessToken);
    res.json({ success: true, data: templates });
  } catch (err: unknown) {
    const e = err as { message?: string };
    res.status(500).json({ success: false, error: e?.message ?? "Erro ao listar templates" });
  }
}
