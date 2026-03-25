import { PrismaClient, Perfil, Tom, StatusResposta, EventoLog, Severidade } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const agentesBase = [
  {
    nome: "Agente Vendas Premium",
    promptSistema:
      "Você é especialista em vendas premium via WhatsApp. Qualifique leads, identifique dores e conduza fechamento com elegância.",
    contextoProdutos: "Planos premium com onboarding dedicado, SLA prioritário e consultoria mensal.",
    tom: Tom.PROFISSIONAL,
  },
  {
    nome: "Suporte Técnico",
    promptSistema: "Resolva dúvidas técnicas com precisão, passo a passo curto e linguagem clara.",
    contextoProdutos: "Plataforma de automação com integrações ManyChat e n8n.",
    tom: Tom.FORMAL,
  },
  {
    nome: "Captação de Leads",
    promptSistema: "Conduza primeira abordagem, faça perguntas de qualificação e agende demonstrações.",
    contextoProdutos: "Soluções para e-commerce e varejo com IA conversacional.",
    tom: Tom.AMIGAVEL,
  },
  {
    nome: "Agente Jurídico",
    promptSistema: "Ofereça respostas conservadoras, sem aconselhamento legal definitivo.",
    contextoProdutos: "Produtos com contratos empresariais e LGPD.",
    tom: Tom.FORMAL,
  },
  {
    nome: "Agente Recuperação",
    promptSistema: "Atue em recuperação de clientes inativos com abordagem cordial e oferta contextual.",
    contextoProdutos: "Campanhas de winback e upgrades por segmento.",
    tom: Tom.CASUAL,
  },
  {
    nome: "Agente Cross-Sell",
    promptSistema: "Identifique oportunidades de venda cruzada e recomende combinações relevantes.",
    contextoProdutos: "Módulos adicionais de analytics, CRM e atendimento omnichannel.",
    tom: Tom.PROFISSIONAL,
  },
  {
    nome: "Agente Pós-venda",
    promptSistema: "Monitore satisfação, previna churn e registre necessidades de expansão.",
    contextoProdutos: "Rotinas de NPS, health score e acompanhamento trimestral.",
    tom: Tom.AMIGAVEL,
  },
  {
    nome: "Agente SDR Inbound",
    promptSistema: "Faça triagem inbound rápida com foco em velocidade e qualidade.",
    contextoProdutos: "Leads originados de campanhas Meta Ads e landing pages.",
    tom: Tom.CASUAL,
  },
];

const campanhas = ["Black Friday", "Follow-up", "Recuperação", "Inbound", "Lançamento Q2"];
const modelos = ["gpt-4o", "gpt-4o-mini", "claude-3-5-sonnet", "claude-3-haiku"];
const providers = ["openai", "anthropic"];
const categoriasErro = ["INTEGRACAO", "AUTENTICACAO", "IA", "DATABASE", "WEBHOOK"];

async function main() {
  await prisma.refreshToken.deleteMany();
  await prisma.monitoramento.deleteMany();
  await prisma.custoIA.deleteMany();
  await prisma.logAtividade.deleteMany();
  await prisma.erroSistema.deleteMany();
  await prisma.documento.deleteMany();
  await prisma.orientacaoGlobal.deleteMany();
  await prisma.usuario.deleteMany();
  await prisma.agente.deleteMany();

  const senhaAdmin = await bcrypt.hash("Admin@123", 12);
  const admin = await prisma.usuario.create({
    data: {
      nome: "Administrador Beta Admin IA",
      email: "admin@betaadminia.com",
      senha: senhaAdmin,
      perfil: Perfil.ADMIN,
      status: true,
    },
  });

  const usuarios = [admin];
  for (let i = 1; i <= 10; i += 1) {
    const senha = await bcrypt.hash(`Senha@${100 + i}`, 12);
    const perfil = i <= 3 ? Perfil.SUPERVISOR : Perfil.VENDEDOR;
    const user = await prisma.usuario.create({
      data: {
        nome: `Usuário ${i}`,
        email: `usuario${i}@betaadminia.com`,
        senha,
        perfil,
        status: i % 5 !== 0,
      },
    });
    usuarios.push(user);
  }

  const agentes = [];
  for (const [idx, a] of agentesBase.entries()) {
    const agente = await prisma.agente.create({
      data: {
        nome: a.nome,
        promptSistema: a.promptSistema,
        contextoProdutos: a.contextoProdutos,
        tom: a.tom,
        modelo: idx % 2 === 0 ? "gpt-4o" : "gpt-4o-mini",
        temperatura: Number((0.4 + (idx % 5) * 0.1).toFixed(1)),
        tokensMaximos: 500 + idx * 100,
        ativo: idx !== 6,
        todosVendedores: idx % 3 === 0,
      },
    });
    agentes.push(agente);
  }

  await prisma.orientacaoGlobal.create({
    data: {
      conteudo:
        "Diretriz global Beta Admin IA: priorize clareza, objetividade e empatia. Sempre confirme entendimento da necessidade do lead, ofereça a solução mais aderente ao contexto e finalize com CTA específico para próximo passo.",
    },
  });

  const monitoramentos = [];
  for (let i = 0; i < 130; i += 1) {
    const usuario = usuarios[(i % (usuarios.length - 1)) + 1];
    const agente = agentes[i % agentes.length];
    const statusList = [
      StatusResposta.SUGESTAO,
      StatusResposta.AUTO_RESPOSTA,
      StatusResposta.EDITADA,
      StatusResposta.IGNORADA,
    ];

    monitoramentos.push(
      prisma.monitoramento.create({
        data: {
          usuarioId: usuario.id,
          agenteId: agente.id,
          campanha: campanhas[i % campanhas.length],
          telefone: `+55 11 9${String(10000000 + i).slice(0, 8)}`,
          mensagemOriginal: `Lead ${i + 1}: gostaria de saber valores e prazos.`,
          respostaIA: `Olá! Posso te ajudar com valores e prazos. Você procura solução para qual volume de atendimento?`,
          statusResposta: statusList[i % statusList.length],
          criadoEm: new Date(Date.now() - i * 1000 * 60 * 47),
        },
      }),
    );
  }
  await Promise.all(monitoramentos);

  const custos = [];
  for (let i = 0; i < 240; i += 1) {
    const usuario = usuarios[(i % (usuarios.length - 1)) + 1];
    const agente = agentes[i % agentes.length];
    const modelo = modelos[i % modelos.length];
    const input = 80 + (i % 700);
    const output = 50 + (i % 600);
    const custo = Number(((input + output) * 0.0000025).toFixed(6));

    custos.push(
      prisma.custoIA.create({
        data: {
          usuarioId: usuario.id,
          agenteId: agente.id,
          modelo,
          provider: providers[i % providers.length],
          inputTokens: input,
          outputTokens: output,
          custoUsd: custo,
          duracao: 300 + (i % 2000),
          criadoEm: new Date(Date.now() - i * 1000 * 60 * 60 * 3),
        },
      }),
    );
  }
  await Promise.all(custos);

  const logs = [];
  for (let i = 0; i < 70; i += 1) {
    const usuario = usuarios[i % usuarios.length];
    const evento = i % 3 === 0 ? EventoLog.DESCONECTOU : i % 4 === 0 ? EventoLog.ERRO : EventoLog.CONECTOU;
    logs.push(
      prisma.logAtividade.create({
        data: {
          usuarioId: usuario.id,
          evento,
          ip: `192.168.0.${(i % 20) + 10}`,
          duracaoSessao: evento === EventoLog.DESCONECTOU ? 1200 + i * 3 : null,
          criadoEm: new Date(Date.now() - i * 1000 * 60 * 30),
        },
      }),
    );
  }
  await Promise.all(logs);

  const erros = [];
  for (let i = 0; i < 40; i += 1) {
    erros.push(
      prisma.erroSistema.create({
        data: {
          severidade: i % 10 === 0 ? Severidade.CRITICAL : i % 3 === 0 ? Severidade.WARNING : Severidade.ERROR,
          categoria: categoriasErro[i % categoriasErro.length],
          mensagem: `Erro simulado ${i + 1}: falha na etapa de processamento do fluxo.`,
          usuarioId: i % 2 === 0 ? usuarios[i % usuarios.length].id : null,
          origem: i % 2 === 0 ? "n8n" : "manychat",
          criadoEm: new Date(Date.now() - i * 1000 * 60 * 90),
        },
      }),
    );
  }
  await Promise.all(erros);

  console.log("Seed concluído com sucesso.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

