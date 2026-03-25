/**
 * Seed dos modelos de IA com preços oficiais de cada provedor.
 *
 * Preços em USD por 1.000 tokens (convertido das tabelas oficiais que usam /1M).
 * Fontes:
 *   OpenAI  → platform.openai.com/docs/models  (pricing/overview)
 *   Anthropic → docs.anthropic.com/en/docs/about-claude/models
 *   Google  → ai.google.dev/gemini-api/docs/models/gemini
 *
 * Última revisão: março/2026
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const modelos = [
  // ── OpenAI ──────────────────────────────────────────────────────────────────
  {
    nome: "GPT-4.1",
    modelId: "gpt-4.1",
    provider: "openai",
    descricao:
      "Modelo flagship da OpenAI. Melhor desempenho em codificação, instrução e raciocínio. Contexto de 1M tokens.",
    ativo: true,
    custoInputPorMilToken: 0.002,    // $2.00 / 1M
    custoOutputPorMilToken: 0.008,   // $8.00 / 1M
  },
  {
    nome: "GPT-4.1 mini",
    modelId: "gpt-4.1-mini",
    provider: "openai",
    descricao:
      "Versão eficiente do GPT-4.1. Equilíbrio ideal entre capacidade e custo para alto volume.",
    ativo: true,
    custoInputPorMilToken: 0.0004,   // $0.40 / 1M
    custoOutputPorMilToken: 0.0016,  // $1.60 / 1M
  },
  {
    nome: "GPT-4.1 nano",
    modelId: "gpt-4.1-nano",
    provider: "openai",
    descricao:
      "Modelo mais rápido e econômico da família GPT-4.1. Ideal para tarefas simples de alto volume.",
    ativo: true,
    custoInputPorMilToken: 0.0001,   // $0.10 / 1M
    custoOutputPorMilToken: 0.0004,  // $0.40 / 1M
  },
  {
    nome: "GPT-4o",
    modelId: "gpt-4o",
    provider: "openai",
    descricao:
      "Modelo multimodal da OpenAI. Suporta texto, imagens e áudio. Contexto de 128k tokens.",
    ativo: true,
    custoInputPorMilToken: 0.0025,   // $2.50 / 1M
    custoOutputPorMilToken: 0.01,    // $10.00 / 1M
  },
  {
    nome: "GPT-4o mini",
    modelId: "gpt-4o-mini",
    provider: "openai",
    descricao:
      "Versão compacta e econômica do GPT-4o. Ideal para tarefas de alto volume com boa qualidade.",
    ativo: true,
    custoInputPorMilToken: 0.00015,  // $0.15 / 1M
    custoOutputPorMilToken: 0.0006,  // $0.60 / 1M
  },
  {
    nome: "GPT-4 Turbo",
    modelId: "gpt-4-turbo",
    provider: "openai",
    descricao:
      "GPT-4 com contexto ampliado (128k) e melhorias de instrução. Geração de código e raciocínio avançado.",
    ativo: true,
    custoInputPorMilToken: 0.01,     // $10.00 / 1M
    custoOutputPorMilToken: 0.03,    // $30.00 / 1M
  },
  {
    nome: "o4-mini",
    modelId: "o4-mini",
    provider: "openai",
    descricao:
      "Modelo de raciocínio compacto de última geração. Alta eficiência para STEM e código com custo reduzido.",
    ativo: true,
    custoInputPorMilToken: 0.0011,   // $1.10 / 1M
    custoOutputPorMilToken: 0.0044,  // $4.40 / 1M
  },
  {
    nome: "o3",
    modelId: "o3",
    provider: "openai",
    descricao:
      "Modelo de raciocínio de alto desempenho. Ideal para problemas científicos, matemáticos e de engenharia complexos.",
    ativo: true,
    custoInputPorMilToken: 0.01,     // $10.00 / 1M
    custoOutputPorMilToken: 0.04,    // $40.00 / 1M
  },
  {
    nome: "o3-mini",
    modelId: "o3-mini",
    provider: "openai",
    descricao:
      "Modelo de raciocínio compacto com performance superior ao o1-mini e custo acessível.",
    ativo: true,
    custoInputPorMilToken: 0.0011,   // $1.10 / 1M
    custoOutputPorMilToken: 0.0044,  // $4.40 / 1M
  },
  {
    nome: "o1",
    modelId: "o1",
    provider: "openai",
    descricao:
      "Modelo de raciocínio profundo da OpenAI. Pensa passo a passo antes de responder. Ideal para matemática, ciência e código complexo.",
    ativo: true,
    custoInputPorMilToken: 0.015,    // $15.00 / 1M
    custoOutputPorMilToken: 0.06,    // $60.00 / 1M
  },
  {
    nome: "o1-mini",
    modelId: "o1-mini",
    provider: "openai",
    descricao:
      "Versão compacta do o1. Raciocínio avançado com custo reduzido. Contexto de 128k tokens.",
    ativo: true,
    custoInputPorMilToken: 0.003,    // $3.00 / 1M
    custoOutputPorMilToken: 0.012,   // $12.00 / 1M
  },
  {
    nome: "o1-pro",
    modelId: "o1-pro",
    provider: "openai",
    descricao:
      "Versão premium do o1 com mais capacidade de raciocínio. Para os problemas mais difíceis.",
    ativo: true,
    custoInputPorMilToken: 0.15,     // $150.00 / 1M
    custoOutputPorMilToken: 0.6,     // $600.00 / 1M
  },
  {
    nome: "GPT-3.5 Turbo",
    modelId: "gpt-3.5-turbo",
    provider: "openai",
    descricao:
      "Modelo rápido e econômico para conversas simples. Contexto de 16k tokens.",
    ativo: false,
    custoInputPorMilToken: 0.0005,   // $0.50 / 1M
    custoOutputPorMilToken: 0.0015,  // $1.50 / 1M
  },

  // ── Anthropic ───────────────────────────────────────────────────────────────
  {
    nome: "Claude Opus 4.6",
    modelId: "claude-opus-4-6",
    provider: "anthropic",
    descricao:
      "Modelo mais poderoso da família Claude 4. Máxima capacidade de raciocínio e análise complexa. Contexto de 200k tokens.",
    ativo: true,
    custoInputPorMilToken: 0.015,    // $15.00 / 1M
    custoOutputPorMilToken: 0.075,   // $75.00 / 1M
  },
  {
    nome: "Claude Sonnet 4.6",
    modelId: "claude-sonnet-4-6",
    provider: "anthropic",
    descricao:
      "Equilíbrio ideal entre inteligência e velocidade. Melhor custo-benefício da família Claude 4. Contexto de 200k tokens.",
    ativo: true,
    custoInputPorMilToken: 0.003,    // $3.00 / 1M
    custoOutputPorMilToken: 0.015,   // $15.00 / 1M
  },
  {
    nome: "Claude Haiku 4.5",
    modelId: "claude-haiku-4-5-20251001",
    provider: "anthropic",
    descricao:
      "Modelo mais rápido e econômico da Anthropic. Ideal para tarefas de classificação, sumarização e respostas curtas.",
    ativo: true,
    custoInputPorMilToken: 0.0008,   // $0.80 / 1M
    custoOutputPorMilToken: 0.004,   // $4.00 / 1M
  },
  {
    nome: "Claude 3.5 Sonnet",
    modelId: "claude-3-5-sonnet-20241022",
    provider: "anthropic",
    descricao:
      "Versão anterior do Sonnet. Excelente capacidade de codificação e análise. Contexto de 200k tokens.",
    ativo: true,
    custoInputPorMilToken: 0.003,    // $3.00 / 1M
    custoOutputPorMilToken: 0.015,   // $15.00 / 1M
  },
  {
    nome: "Claude 3.5 Haiku",
    modelId: "claude-3-5-haiku-20241022",
    provider: "anthropic",
    descricao:
      "Haiku mais recente: mais rápido que o 3 Haiku com melhor qualidade. Bom para interações em tempo real.",
    ativo: true,
    custoInputPorMilToken: 0.0008,   // $0.80 / 1M
    custoOutputPorMilToken: 0.004,   // $4.00 / 1M
  },
  {
    nome: "Claude 3 Opus",
    modelId: "claude-3-opus-20240229",
    provider: "anthropic",
    descricao:
      "Modelo anterior topo de linha da Anthropic. Alto desempenho em análise e tarefas complexas.",
    ativo: false,
    custoInputPorMilToken: 0.015,    // $15.00 / 1M
    custoOutputPorMilToken: 0.075,   // $75.00 / 1M
  },
  {
    nome: "Claude 3 Haiku",
    modelId: "claude-3-haiku-20240307",
    provider: "anthropic",
    descricao:
      "Modelo compacto e rápido da geração anterior. Ótimo custo para volume elevado.",
    ativo: false,
    custoInputPorMilToken: 0.00025,  // $0.25 / 1M
    custoOutputPorMilToken: 0.00125, // $1.25 / 1M
  },

  // ── Google Gemini ────────────────────────────────────────────────────────────
  {
    nome: "Gemini 2.0 Flash",
    modelId: "gemini-2.0-flash",
    provider: "google",
    descricao:
      "Modelo rápido de próxima geração da Google. Multimodal nativo (texto, imagem, áudio, vídeo). Contexto de 1M tokens.",
    ativo: true,
    custoInputPorMilToken: 0.0001,   // $0.10 / 1M
    custoOutputPorMilToken: 0.0004,  // $0.40 / 1M
  },
  {
    nome: "Gemini 2.0 Flash Lite",
    modelId: "gemini-2.0-flash-lite",
    provider: "google",
    descricao:
      "Versão mais econômica do Flash 2.0. Alta eficiência para tarefas simples e volume elevado.",
    ativo: true,
    custoInputPorMilToken: 0.000075, // $0.075 / 1M
    custoOutputPorMilToken: 0.0003,  // $0.30 / 1M
  },
  {
    nome: "Gemini 1.5 Pro",
    modelId: "gemini-1.5-pro",
    provider: "google",
    descricao:
      "Modelo Pro com janela de contexto de 2M tokens. Excelente para análise de documentos longos e tarefas complexas.",
    ativo: true,
    custoInputPorMilToken: 0.00125,  // $1.25 / 1M (até 128k ctx)
    custoOutputPorMilToken: 0.005,   // $5.00 / 1M
  },
  {
    nome: "Gemini 1.5 Flash",
    modelId: "gemini-1.5-flash",
    provider: "google",
    descricao:
      "Modelo Flash equilibrado, contexto de 1M tokens. Ótima relação custo-desempenho para chatbots.",
    ativo: true,
    custoInputPorMilToken: 0.000075, // $0.075 / 1M (até 128k ctx)
    custoOutputPorMilToken: 0.0003,  // $0.30 / 1M
  },
  {
    nome: "Gemini 1.5 Flash-8B",
    modelId: "gemini-1.5-flash-8b",
    provider: "google",
    descricao:
      "Modelo ultra-compacto de 8B parâmetros. Mais barato da linha Gemini para tarefas de baixa complexidade.",
    ativo: false,
    custoInputPorMilToken: 0.0000375, // $0.0375 / 1M
    custoOutputPorMilToken: 0.00015,  // $0.15 / 1M
  },
];

async function main() {
  console.log(`Iniciando seed de ${modelos.length} modelos de IA...`);

  let criados = 0;
  let atualizados = 0;

  for (const modelo of modelos) {
    const existing = await prisma.modeloIA.findUnique({
      where: { modelId: modelo.modelId },
    });

    if (existing) {
      await prisma.modeloIA.update({
        where: { modelId: modelo.modelId },
        data: modelo,
      });
      atualizados++;
    } else {
      await prisma.modeloIA.create({ data: modelo });
      criados++;
    }
  }

  console.log(`✓ Criados: ${criados} | Atualizados: ${atualizados}`);
  console.log("Seed de modelos concluído.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
