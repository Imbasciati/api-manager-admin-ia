import { Request, Response } from "express";
import { supabase, parseMensagem, type MensagemParsed } from "../services/supabase.service";
import { contarTokens } from "../services/tokenizer.service";
import { asyncHandler } from "../utils/asyncHandler";
import { AppError } from "../utils/errors";
import { ok, fail } from "../utils/response";

const PROFISSOES = [
  "administrador",
  "advogado",
  "arquiteto",
  "assistente_social",
  "contador",
  "corretor",
  "dentista",
  "engenheiro_civil",
  "farmaceutico",
  "fisioterapeuta",
  "pedagogo",
  "professor",
  "psicologo",
  "veterinario",
] as const;

function assertSupabase(res: Response): boolean {
  if (!supabase) {
    fail(res, 503, "Supabase não configurado. Defina SUPABASE_URL e SUPABASE_KEY no servidor.", "SUPABASE_NOT_CONFIGURED");
    return false;
  }
  return true;
}

/** Lista todas as profissões com total de sessões em cada tabela. */
export const listProfissoes = asyncHandler(async (_req: Request, res: Response) => {
  if (!assertSupabase(res)) return;

  // Busca o count de sessões distintas em paralelo para todas as tabelas
  const resultados = await Promise.allSettled(
    PROFISSOES.map(async (prof) => {
      const { data, error } = await supabase!
        .from(prof)
        .select("session_id")
        .limit(5000);

      if (error) return { profissao: prof, totalSessoes: 0, totalMensagens: 0 };

      const sessoes = new Set((data ?? []).map((r: { session_id: string }) => r.session_id));
      return {
        profissao: prof,
        totalSessoes: sessoes.size,
        totalMensagens: data?.length ?? 0,
      };
    }),
  );

  const dados = resultados.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : { profissao: PROFISSOES[i], totalSessoes: 0, totalMensagens: 0 },
  );

  return ok(res, dados);
});

/** Lista as sessões de uma profissão, com contagem de mensagens. */
export const listSessoes = asyncHandler(async (req: Request, res: Response) => {
  if (!assertSupabase(res)) return;

  const profissao = String(req.params.profissao);
  if (!PROFISSOES.includes(profissao as (typeof PROFISSOES)[number])) {
    throw new AppError("Profissão inválida", 400);
  }

  const { data, error } = await supabase!
    .from(profissao)
    .select("id, session_id, message, created_at")
    .order("created_at", { ascending: true });

  if (error) throw new AppError(`Erro ao consultar Supabase: ${error.message}`, 500);

  // Agrupa por session_id
  const mapa = new Map<string, {
    totalMensagens: number;
    primeiraMensagem: string;
    ultimaAtividade: string | null;
  }>();

  for (const row of data ?? []) {
    const parsed = parseMensagem(row.message);
    const preview = parsed?.conteudo?.slice(0, 80) ?? "";

    if (!mapa.has(row.session_id)) {
      mapa.set(row.session_id, {
        totalMensagens: 1,
        primeiraMensagem: preview,
        ultimaAtividade: row.created_at ?? null,
      });
    } else {
      const entry = mapa.get(row.session_id)!;
      entry.totalMensagens += 1;
      entry.ultimaAtividade = row.created_at ?? entry.ultimaAtividade;
    }
  }

  // Ordena sessões pela última atividade (mais recente primeiro)
  const sessoes = Array.from(mapa.entries())
    .map(([sessionId, meta]) => ({
      sessionId,
      totalMensagens: meta.totalMensagens,
      primeiraMensagem: meta.primeiraMensagem,
      ultimaAtividade: meta.ultimaAtividade,
    }))
    .sort((a, b) => {
      if (!a.ultimaAtividade && !b.ultimaAtividade) return 0;
      if (!a.ultimaAtividade) return 1;
      if (!b.ultimaAtividade) return -1;
      return new Date(b.ultimaAtividade).getTime() - new Date(a.ultimaAtividade).getTime();
    });

  return ok(res, sessoes);
});

/** Retorna estatísticas agregadas de todas as profissões para o Dashboard. */
export const getStatsDashboard = asyncHandler(async (_req: Request, res: Response) => {
  if (!assertSupabase(res)) return;

  const resultados = await Promise.allSettled(
    PROFISSOES.map(async (prof) => {
      const { data, error } = await supabase!
        .from(prof)
        .select("session_id")
        .limit(10000);

      if (error || !data) return { profissao: prof, totalSessoes: 0, totalMensagens: 0 };

      const sessoes = new Set(data.map((r: { session_id: string }) => r.session_id));
      return {
        profissao: prof,
        totalSessoes: sessoes.size,
        totalMensagens: data.length,
      };
    }),
  );

  const porProfissao = resultados.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : { profissao: PROFISSOES[i], totalSessoes: 0, totalMensagens: 0 },
  );

  const totalConversas = porProfissao.reduce((s, p) => s + p.totalSessoes, 0);
  const totalMensagens = porProfissao.reduce((s, p) => s + p.totalMensagens, 0);
  const mediaMsgPorConversa = totalConversas > 0 ? +(totalMensagens / totalConversas).toFixed(1) : 0;
  const maisAtiva = [...porProfissao].sort((a, b) => b.totalSessoes - a.totalSessoes)[0] ?? null;

  return ok(res, {
    totalConversas,
    totalMensagens,
    mediaMsgPorConversa,
    maisAtiva: maisAtiva ? { profissao: maisAtiva.profissao, totalSessoes: maisAtiva.totalSessoes } : null,
    porProfissao,
  });
});

/** Retorna todas as mensagens de uma sessão específica, prontas para o chat. */
export const getMensagens = asyncHandler(async (req: Request, res: Response) => {
  if (!assertSupabase(res)) return;

  const profissao = String(req.params.profissao);
  const sessionId = String(req.params.sessionId);

  if (!PROFISSOES.includes(profissao as (typeof PROFISSOES)[number])) {
    throw new AppError("Profissão inválida", 400);
  }

  const { data, error } = await supabase!
    .from(profissao)
    .select("id, session_id, message, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error) throw new AppError(`Erro ao consultar Supabase: ${error.message}`, 500);

  const mensagens: MensagemParsed[] = [];

  for (const row of data ?? []) {
    const parsed = parseMensagem(row.message);
    if (parsed) {
      mensagens.push({ id: row.id, criadoEm: row.created_at ?? null, ...parsed });
    }
  }

  return ok(res, mensagens);
});

// ── Custos de Atendimentos (GPT-4.1-mini) ────────────────────────────────────

const MODELO = "gpt-4.1-mini";
const PRECO_INPUT_POR_TOKEN  = 0.40  / 1_000_000; // $0.40 por 1M tokens
const PRECO_OUTPUT_POR_TOKEN = 1.60  / 1_000_000; // $1.60 por 1M tokens

/**
 * Calcula o custo real das conversas do Supabase com base no modelo GPT-4.1-mini.
 * Aceita filtros: ?dataInicio=YYYY-MM-DD&dataFim=YYYY-MM-DD
 * Mensagens "human" = input tokens | mensagens "ai" = output tokens.
 */
export const getCustosAtendimentos = asyncHandler(async (req: Request, res: Response) => {
  if (!assertSupabase(res)) return;

  const dataInicio = req.query.dataInicio ? String(req.query.dataInicio) : null;
  const dataFim    = req.query.dataFim    ? String(req.query.dataFim)    : null;

  type DiaCusto = { inputTokens: number; outputTokens: number; mensagens: number };

  const porProfissao: {
    profissao: string;
    inputTokens: number;
    outputTokens: number;
    custoUsd: number;
    totalConversas: number;
    totalMensagens: number;
  }[] = [];

  const porDiaMap = new Map<string, DiaCusto>();

  let totalInput  = 0;
  let totalOutput = 0;

  await Promise.allSettled(
    PROFISSOES.map(async (prof) => {
      let query = supabase!
        .from(prof)
        .select("session_id, message, created_at")
        .order("created_at", { ascending: true });

      if (dataInicio) query = query.gte("created_at", `${dataInicio}T00:00:00`);
      if (dataFim)    query = query.lte("created_at", `${dataFim}T23:59:59`);

      const { data, error } = await query;

      if (error || !data) {
        porProfissao.push({ profissao: prof, inputTokens: 0, outputTokens: 0, custoUsd: 0, totalConversas: 0, totalMensagens: 0 });
        return;
      }

      let profInput = 0;
      let profOutput = 0;
      const sessoes = new Set<string>();

      for (const row of data) {
        const parsed = parseMensagem(row.message);
        if (!parsed) continue;

        sessoes.add(row.session_id);
        const tokens = contarTokens(parsed.conteudo);

        if (parsed.tipo === "human") {
          profInput += tokens;
        } else {
          profOutput += tokens;
        }

        // agrupa por dia
        if (row.created_at) {
          const dia = String(row.created_at).slice(0, 10); // "YYYY-MM-DD"
          const atual = porDiaMap.get(dia) ?? { inputTokens: 0, outputTokens: 0, mensagens: 0 };
          if (parsed.tipo === "human") atual.inputTokens += tokens;
          else atual.outputTokens += tokens;
          atual.mensagens += 1;
          porDiaMap.set(dia, atual);
        }
      }

      totalInput  += profInput;
      totalOutput += profOutput;

      const custoUsd =
        profInput  * PRECO_INPUT_POR_TOKEN +
        profOutput * PRECO_OUTPUT_POR_TOKEN;

      porProfissao.push({
        profissao: prof,
        inputTokens: profInput,
        outputTokens: profOutput,
        custoUsd: +custoUsd.toFixed(6),
        totalConversas: sessoes.size,
        totalMensagens: data.length,
      });
    }),
  );

  const totalCustoUsd =
    totalInput  * PRECO_INPUT_POR_TOKEN +
    totalOutput * PRECO_OUTPUT_POR_TOKEN;

  const totalConversas = porProfissao.reduce((s, p) => s + p.totalConversas, 0);
  const totalMensagens = porProfissao.reduce((s, p) => s + p.totalMensagens, 0);

  const porDia = [...porDiaMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dia, v]) => ({
      dia,
      inputTokens:  v.inputTokens,
      outputTokens: v.outputTokens,
      custoUsd: +(v.inputTokens * PRECO_INPUT_POR_TOKEN + v.outputTokens * PRECO_OUTPUT_POR_TOKEN).toFixed(6),
      mensagens: v.mensagens,
    }));

  return ok(res, {
    modelo: MODELO,
    precoInputPorMilhao:  0.40,
    precoOutputPorMilhao: 1.60,
    totalInputTokens:  totalInput,
    totalOutputTokens: totalOutput,
    totalTokens:       totalInput + totalOutput,
    totalCustoUsd:     +totalCustoUsd.toFixed(6),
    totalConversas,
    totalMensagens,
    mediaCustoPorConversa: totalConversas > 0
      ? +(totalCustoUsd / totalConversas).toFixed(6)
      : 0,
    porProfissao: porProfissao.sort((a, b) => b.custoUsd - a.custoUsd),
    porDia,
  });
});
