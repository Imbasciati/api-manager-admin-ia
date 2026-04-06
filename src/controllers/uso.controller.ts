import { Prisma } from "@prisma/client";
import { Request, Response } from "express";
import { format, subDays } from "date-fns";
import { prisma } from "../prisma/client";
import { asyncHandler } from "../utils/asyncHandler";
import { parseDateRange } from "../utils/query";
import { ok } from "../utils/response";

/** Monta filtro de data para AgentExecution / Atendimento */
function filtroData(req: Request) {
  const di = req.query.dataInicio ? new Date(String(req.query.dataInicio)) : undefined;
  const df = req.query.dataFim    ? new Date(String(req.query.dataFim) + "T23:59:59") : undefined;
  if (!di && !df) return undefined;
  return { ...(di ? { gte: di } : {}), ...(df ? { lte: df } : {}) };
}

export const usoResumo = asyncHandler(async (req: Request, res: Response) => {
  const { gte, lte } = parseDateRange(req);

  const where: Prisma.MonitoramentoWhereInput = {
    ...(req.query.vendedorId ? { usuarioId: String(req.query.vendedorId) } : {}),
    ...(gte || lte ? { criadoEm: { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) } } : {}),
  };

  const [total, grouped] = await Promise.all([
    prisma.monitoramento.count({ where }),
    prisma.monitoramento.groupBy({ by: ["statusResposta"], where, _count: { _all: true } }),
  ]);

  return ok(res, {
    total,
    sugestoes: grouped.find((g) => g.statusResposta === "SUGESTAO")?._count._all ?? 0,
    autoRespostas: grouped.find((g) => g.statusResposta === "AUTO_RESPOSTA")?._count._all ?? 0,
    editadas: grouped.find((g) => g.statusResposta === "EDITADA")?._count._all ?? 0,
    ignoradas: grouped.find((g) => g.statusResposta === "IGNORADA")?._count._all ?? 0,
  });
});

export const usoPorHora = asyncHandler(async (req: Request, res: Response) => {
  const { gte, lte } = parseDateRange(req);
  const rows = await prisma.monitoramento.findMany({
    where: {
      ...(req.query.vendedorId ? { usuarioId: String(req.query.vendedorId) } : {}),
      ...(gte || lte ? { criadoEm: { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) } } : {}),
    },
    select: { criadoEm: true, statusResposta: true },
  });

  const map = new Map<string, { hora: string; total: number; auto: number }>();

  rows.forEach((row) => {
    const key = format(row.criadoEm, "HH:00");
    const item = map.get(key) ?? { hora: key, total: 0, auto: 0 };
    item.total += 1;
    if (row.statusResposta === "AUTO_RESPOSTA") {
      item.auto += 1;
    }
    map.set(key, item);
  });

  return ok(res, [...map.values()].sort((a, b) => a.hora.localeCompare(b.hora)));
});

// ── Métricas operacionais ────────────────────────────────────────────────────

export const usoMetricas = asyncHandler(async (req: Request, res: Response) => {
  const criadoEm = filtroData(req);
  const agenteId = req.query.agenteId ? String(req.query.agenteId) : undefined;

  const execWhere: Record<string, unknown> = {};
  if (criadoEm) execWhere.criadoEm = criadoEm;
  if (agenteId) execWhere.agenteId = agenteId;

  const atendWhere: Record<string, unknown> = {};
  if (criadoEm) atendWhere.criadoEm = criadoEm;
  if (agenteId) atendWhere.agenteId = agenteId;

  // Filtro de mensagens: filtra pelo atendimento relacionado (agenteId via relação)
  const msgWhere: Record<string, unknown> = {};
  if (criadoEm) msgWhere.criadoEm = criadoEm;
  if (agenteId) msgWhere.atendimento = { agenteId };

  const [execAgg, execErros, totalAtend, atendStatus, msgStats, atendDuracoes] = await Promise.all([
    prisma.agentExecution.aggregate({
      where: execWhere,
      _count: { _all: true },
      _avg:   { duracao: true },
      _min:   { duracao: true },
      _max:   { duracao: true },
    }),
    prisma.agentExecution.count({ where: { ...execWhere, erro: { not: null } } }),
    prisma.atendimento.count({ where: atendWhere }),
    prisma.atendimento.groupBy({ by: ["status"], where: atendWhere, _count: { _all: true } }),
    prisma.mensagemAtendimento.groupBy({ by: ["origem"], where: msgWhere, _count: { _all: true } }),
    prisma.atendimento.findMany({
      where: atendWhere,
      select: { criadoEm: true, atualizadoEm: true },
      take: 2000,
    }),
  ]);

  const total = execAgg._count._all;

  // Duração média dos atendimentos (ms)
  const duracoes = atendDuracoes
    .map(a => a.atualizadoEm.getTime() - a.criadoEm.getTime())
    .filter(d => d > 5000); // ignora menos de 5s (provavelmente sem interação real)
  const duracaoMediaAtendMs = duracoes.length > 0
    ? Math.round(duracoes.reduce((a, b) => a + b, 0) / duracoes.length)
    : 0;

  const mensagensIA       = msgStats.find(m => m.origem === "AGENTE_IA")?._count._all ?? 0;
  const mensagensCliente  = msgStats.find(m => m.origem === "CLIENTE")?._count._all   ?? 0;
  const mensagensVendedor = msgStats.find(m => m.origem === "VENDEDOR")?._count._all  ?? 0;
  const totalMsgs         = mensagensIA + mensagensCliente + mensagensVendedor;

  return ok(res, {
    totalExecucoes:       total,
    execucoesOk:          total - execErros,
    execucoesErro:        execErros,
    taxaErrosPct:         total > 0 ? parseFloat(((execErros / total) * 100).toFixed(2)) : 0,
    slaMediaMs:           Math.round(execAgg._avg.duracao ?? 0),
    slaMinMs:             execAgg._min.duracao ?? 0,
    slaMaxMs:             execAgg._max.duracao ?? 0,
    totalAtendimentos:    totalAtend,
    duracaoMediaAtendMs,
    atendPorStatus:       atendStatus.map(s => ({ status: s.status, total: s._count._all })),
    mensagensCliente,
    mensagensIA,
    mensagensVendedor,
    totalMensagens:       totalMsgs,
    mediaMsgsPorAtend:    totalAtend > 0 ? parseFloat((totalMsgs / totalAtend).toFixed(1)) : 0,
  });
});

// ── Tendência diária ─────────────────────────────────────────────────────────

export const usoPorDia = asyncHandler(async (req: Request, res: Response) => {
  const criadoEm = filtroData(req) ?? { gte: subDays(new Date(), 29) };
  const agenteId = req.query.agenteId ? String(req.query.agenteId) : undefined;

  const where: Record<string, unknown> = { criadoEm };
  if (agenteId) where.agenteId = agenteId;

  const rows = await prisma.agentExecution.findMany({
    where,
    select: { criadoEm: true, duracao: true, erro: true },
  });

  const map = new Map<string, { dia: string; execucoes: number; totalDuracao: number; erros: number }>();
  for (const r of rows) {
    const dia = format(r.criadoEm, "yyyy-MM-dd");
    const acc = map.get(dia) ?? { dia, execucoes: 0, totalDuracao: 0, erros: 0 };
    acc.execucoes++;
    acc.totalDuracao += r.duracao;
    if (r.erro) acc.erros++;
    map.set(dia, acc);
  }

  return ok(res, [...map.values()]
    .map(v => ({
      dia:       v.dia,
      execucoes: v.execucoes,
      slaMedia:  v.execucoes > 0 ? Math.round(v.totalDuracao / v.execucoes) : 0,
      erros:     v.erros,
    }))
    .sort((a, b) => a.dia.localeCompare(b.dia)),
  );
});

// ── Qualidade por agente ─────────────────────────────────────────────────────
// Score 0–100: 50% confiabilidade (sem erros) + 30% velocidade (SLA) + 20% profundidade (interações por contato)
// Usa $queryRaw para evitar dependência dos tipos Prisma gerados (compatível com qualquer versão do cliente)

interface QualidadeRow {
  agenteId:            string | null;
  total_execucoes:     bigint;
  avg_duracao:         number | null;
  total_erros:         bigint;
  contatos_unicos:     bigint;
  media_interacoes:    number;
}

export const usoQualidade = asyncHandler(async (req: Request, res: Response) => {
  const criadoEm = filtroData(req);

  // Monta cláusulas WHERE dinâmicas
  const conds: Prisma.Sql[] = [];
  if (criadoEm?.gte) conds.push(Prisma.sql`ae."criadoEm" >= ${criadoEm.gte}`);
  if (criadoEm?.lte) conds.push(Prisma.sql`ae."criadoEm" <= ${criadoEm.lte}`);
  const whereClause = conds.length > 0
    ? Prisma.sql`WHERE ${Prisma.join(conds, " AND ")}`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<QualidadeRow[]>`
    SELECT
      ae."agenteId",
      COUNT(*)                                                         AS total_execucoes,
      AVG(ae."duracao")                                                AS avg_duracao,
      COUNT(CASE WHEN ae."erro" IS NOT NULL THEN 1 END)                AS total_erros,
      COUNT(DISTINCT ae."contactId")                                   AS contatos_unicos,
      ROUND(
        COUNT(*)::numeric / NULLIF(COUNT(DISTINCT ae."contactId"), 0), 1
      )                                                                AS media_interacoes
    FROM "AgentExecution" ae
    ${whereClause}
    GROUP BY ae."agenteId"
  `;

  // Busca nomes dos agentes
  const ids = rows.map(r => r.agenteId).filter(Boolean) as string[];
  const agentes = await prisma.agente.findMany({
    where:  { id: { in: ids } },
    select: { id: true, nome: true, atuacao: true, modelo: true },
  });
  const agenteMap = new Map(agentes.map(a => [a.id, a]));

  const MAX_SLA_MS = 5000;

  return ok(res, rows.map(r => {
    const total      = Number(r.total_execucoes);
    const erros      = Number(r.total_erros);
    const slaMs      = Number(r.avg_duracao ?? 0);
    const contatos   = Number(r.contatos_unicos);
    const mediaInt   = Number(r.media_interacoes ?? 0);
    const taxaErro   = total > 0 ? erros / total : 0;
    const slaScore   = 1 - Math.min(slaMs / MAX_SLA_MS, 1);
    const depthScore = Math.min((mediaInt || 1) / 5, 1);
    const qualidade  = Math.round((1 - taxaErro) * 50 + slaScore * 30 + depthScore * 20);
    const agente     = r.agenteId ? agenteMap.get(r.agenteId) : null;

    return {
      agenteId:    r.agenteId ?? "sem-agente",
      nomeAgente:  agente?.nome    ?? "ManyChat / Sem agente",
      atuacao:     agente?.atuacao ?? null,
      modelo:      agente?.modelo  ?? "—",
      totalExecucoes:   total,
      execucoesErro:    erros,
      taxaErrosPct:     parseFloat((taxaErro * 100).toFixed(2)),
      slaMediaMs:       Math.round(slaMs),
      contatosUnicos:   contatos,
      mediaInteracoesPorContato: parseFloat(mediaInt.toFixed(1)),
      qualidade,
    };
  }).sort((a, b) => b.qualidade - a.qualidade));
});

