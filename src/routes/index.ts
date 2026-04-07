import { Perfil } from "@prisma/client";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  login,
  logout,
  me,
  refresh,
} from "../controllers/auth.controller";
import {
  changeSenha,
  changeStatus,
  createUsuario,
  deleteUsuario,
  listUsuarios,
  reenviarAcesso,
  updateUsuario,
} from "../controllers/usuarios.controller";
import {
  changeAgenteStatus,
  chatAgente,
  transcribeAudio,
  createAgente,
  deleteAgente,
  duplicarAgente,
  getAgente,
  listAgentes,
  removeDocumento,
  updateAgente,
  testarConexaoUnnichat,
} from "../controllers/agentes.controller";
import { receberMensagemUnnichat } from "../controllers/webhook-unnichat.controller";
import {
  historicoVendedor,
  statsVendedor,
  vendedoresOnline,
  agentesStatus,
  logsAgente,
  eventosAgente,
  errosAgente,
  conexoesStatus,
  verificarConexaoAgente,
} from "../controllers/monitoramento.controller";
import { usoPorHora, usoResumo, usoMetricas, usoPorDia, usoQualidade } from "../controllers/uso.controller";
import {
  custosLog,
  custosPorModelo,
  custosPorVendedor,
  custosPorProvedor,
  custosPorAgente,
  custosPorCanal,
  custosResumo,
  custosTendencia,
} from "../controllers/custos.controller";
import {
  getOrientacoes,
  restoreOrientacoes,
  updateOrientacoes,
} from "../controllers/orientacoes.controller";
import { logsAtivos, logsHistorico, logsPorUsuario, logsDetalheUsuario } from "../controllers/logs.controller";
import { errosList, errosResumo } from "../controllers/erros.controller";
import {
  changeModeloStatus,
  createModelo,
  deleteModelo,
  getModelo,
  listModelos,
  updateModelo,
} from "../controllers/modelos.controller";
import {
  listProvedores,
  saveProvedor,
  testarProvedor,
  toggleProvedor,
} from "../controllers/provedores.controller";
import {
  deleteAtendimento,
  getAtendimento,
  getMensagensAtendimento,
  listAtendimentos,
  sseAtendimentos,
  updateStatus,
} from "../controllers/atendimentos.controller";
import {
  createWebhook,
  deleteWebhook,
  listWebhooks,
  regenerarToken,
  updateWebhook,
} from "../controllers/webhook-config.controller";
import { receberEvento } from "../controllers/webhook.controller";
import { getCustosAtendimentos, getMensagens, getStatsDashboard, listProfissoes, listSessoes } from "../controllers/conversas.controller";
import { listAgenteConfigs, updateAgenteConfig, deleteAgenteConfig } from "../controllers/agente-config.controller";
import {
  listConexoes,
  createConexao,
  updateConexao,
  deleteConexao,
  testarConexaoUnnichat as testarConexaoUnnichatConfig,
} from "../controllers/conexao-unnichat.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { roleMiddleware } from "../middlewares/role.middleware";
import { upload, memUpload } from "../middlewares/upload.middleware";

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Muitas tentativas. Tente novamente em 1 minuto." },
});

export const router = Router();

router.post("/auth/login", authLimiter, login);
router.post("/auth/refresh", authLimiter, refresh);
router.post("/auth/logout", authMiddleware, logout);
router.get("/auth/me", authMiddleware, me);

router.get("/usuarios", authMiddleware, roleMiddleware(Perfil.ADMIN, Perfil.SUPERVISOR), listUsuarios);
router.post("/usuarios", authMiddleware, roleMiddleware(Perfil.ADMIN, Perfil.SUPERVISOR), createUsuario);
router.put("/usuarios/:id", authMiddleware, roleMiddleware(Perfil.ADMIN, Perfil.SUPERVISOR), updateUsuario);
router.patch("/usuarios/:id/senha", authMiddleware, roleMiddleware(Perfil.ADMIN, Perfil.SUPERVISOR), changeSenha);
router.patch("/usuarios/:id/status", authMiddleware, roleMiddleware(Perfil.ADMIN, Perfil.SUPERVISOR), changeStatus);
router.post(
  "/usuarios/:id/reenviar-acesso",
  authMiddleware,
  roleMiddleware(Perfil.ADMIN, Perfil.SUPERVISOR),
  reenviarAcesso,
);
router.delete("/usuarios/:id", authMiddleware, roleMiddleware(Perfil.ADMIN), deleteUsuario);

router.get("/agentes", authMiddleware, listAgentes);
router.post("/agentes", authMiddleware, upload.array("documentos"), createAgente);
router.get("/agentes/:id", authMiddleware, getAgente);
router.put("/agentes/:id", authMiddleware, updateAgente);
router.post("/agentes/:id/duplicar", authMiddleware, duplicarAgente);
router.patch("/agentes/:id/status", authMiddleware, changeAgenteStatus);
router.delete("/agentes/:id", authMiddleware, roleMiddleware(Perfil.ADMIN, Perfil.SUPERVISOR), deleteAgente);
router.post("/agentes/:id/chat", authMiddleware, memUpload.single("imagem"), chatAgente);
router.post("/agentes/:id/transcribe", authMiddleware, memUpload.single("audio"), transcribeAudio);
router.delete("/agentes/:id/documentos/:docId", authMiddleware, removeDocumento);
router.post("/agentes/:id/unnichat/testar", authMiddleware, testarConexaoUnnichat);

// Webhook Unnichat — público (sem JWT)
router.post("/webhook/unnichat/:agenteId", receberMensagemUnnichat);

router.get("/monitoramento/vendedores", authMiddleware, vendedoresOnline);
router.get("/monitoramento/agentes", authMiddleware, agentesStatus);
router.get("/monitoramento/agentes/:agenteId/logs", authMiddleware, logsAgente);
router.get("/monitoramento/agentes/:agenteId/eventos", authMiddleware, eventosAgente);
router.get("/monitoramento/agentes/:agenteId/erros", authMiddleware, errosAgente);
router.post("/monitoramento/agentes/:agenteId/verificar", authMiddleware, verificarConexaoAgente);
router.get("/monitoramento/conexoes", authMiddleware, conexoesStatus);
router.get("/monitoramento/:usuarioId", authMiddleware, historicoVendedor);
router.get("/monitoramento/:usuarioId/stats", authMiddleware, statsVendedor);

router.get("/uso", authMiddleware, usoResumo);
router.get("/uso/por-hora", authMiddleware, usoPorHora);
router.get("/uso/metricas", authMiddleware, usoMetricas);
router.get("/uso/por-dia",  authMiddleware, usoPorDia);
router.get("/uso/qualidade", authMiddleware, usoQualidade);

router.get("/custos/resumo",       authMiddleware, custosResumo);
router.get("/custos/por-provedor", authMiddleware, custosPorProvedor);
router.get("/custos/por-modelo",   authMiddleware, custosPorModelo);
router.get("/custos/por-agente",   authMiddleware, custosPorAgente);
router.get("/custos/por-canal",    authMiddleware, custosPorCanal);
router.get("/custos/por-vendedor", authMiddleware, custosPorVendedor);
router.get("/custos/tendencia",    authMiddleware, custosTendencia);
router.get("/custos/log",          authMiddleware, custosLog);

router.get("/orientacoes", authMiddleware, getOrientacoes);
router.put("/orientacoes", authMiddleware, roleMiddleware(Perfil.ADMIN, Perfil.SUPERVISOR), updateOrientacoes);
router.post(
  "/orientacoes/restaurar",
  authMiddleware,
  roleMiddleware(Perfil.ADMIN, Perfil.SUPERVISOR),
  restoreOrientacoes,
);

router.get("/logs/ativos", authMiddleware, logsAtivos);
router.get("/logs/por-usuario", authMiddleware, logsPorUsuario);
router.get("/logs/usuario/:usuarioId", authMiddleware, logsDetalheUsuario);
router.get("/logs", authMiddleware, logsHistorico);

router.get("/erros/resumo", authMiddleware, errosResumo);
router.get("/erros", authMiddleware, errosList);

// Configurações — somente ADMIN
router.get("/configuracoes/modelos", authMiddleware, roleMiddleware(Perfil.ADMIN), listModelos);
router.post("/configuracoes/modelos", authMiddleware, roleMiddleware(Perfil.ADMIN), createModelo);
router.get("/configuracoes/modelos/:id", authMiddleware, roleMiddleware(Perfil.ADMIN), getModelo);
router.put("/configuracoes/modelos/:id", authMiddleware, roleMiddleware(Perfil.ADMIN), updateModelo);
router.patch("/configuracoes/modelos/:id/status", authMiddleware, roleMiddleware(Perfil.ADMIN), changeModeloStatus);
router.delete("/configuracoes/modelos/:id", authMiddleware, roleMiddleware(Perfil.ADMIN), deleteModelo);

// Configurações — Provedores de IA (somente ADMIN)
router.get("/configuracoes/provedores", authMiddleware, roleMiddleware(Perfil.ADMIN), listProvedores);
router.put("/configuracoes/provedores/:provider", authMiddleware, roleMiddleware(Perfil.ADMIN), saveProvedor);
router.patch("/configuracoes/provedores/:provider/toggle", authMiddleware, roleMiddleware(Perfil.ADMIN), toggleProvedor);
router.post("/configuracoes/provedores/:provider/testar", authMiddleware, roleMiddleware(Perfil.ADMIN), testarProvedor);

// Webhook público — recebe eventos do n8n (sem autenticação JWT)
router.post("/webhook/atendimento", receberEvento);

// Atendimentos
router.get("/atendimentos/live", authMiddleware, sseAtendimentos);
router.get("/atendimentos", authMiddleware, listAtendimentos);
router.get("/atendimentos/:id", authMiddleware, getAtendimento);
router.get("/atendimentos/:id/mensagens", authMiddleware, getMensagensAtendimento);
router.patch("/atendimentos/:id/status", authMiddleware, updateStatus);
router.delete("/atendimentos/:id", authMiddleware, roleMiddleware(Perfil.ADMIN, Perfil.SUPERVISOR), deleteAtendimento);

// Configurações — Webhooks (somente ADMIN)
router.get("/configuracoes/webhooks", authMiddleware, roleMiddleware(Perfil.ADMIN), listWebhooks);
router.post("/configuracoes/webhooks", authMiddleware, roleMiddleware(Perfil.ADMIN), createWebhook);
router.put("/configuracoes/webhooks/:id", authMiddleware, roleMiddleware(Perfil.ADMIN), updateWebhook);
router.post("/configuracoes/webhooks/:id/regenerar-token", authMiddleware, roleMiddleware(Perfil.ADMIN), regenerarToken);
router.delete("/configuracoes/webhooks/:id", authMiddleware, roleMiddleware(Perfil.ADMIN), deleteWebhook);

// Configurações — Agente de Vendas IA / ManyChat (somente ADMIN)
router.get("/configuracoes/agente", authMiddleware, roleMiddleware(Perfil.ADMIN), listAgenteConfigs);
router.put("/configuracoes/agente/:chave", authMiddleware, roleMiddleware(Perfil.ADMIN), updateAgenteConfig);
router.delete("/configuracoes/agente/:chave", authMiddleware, roleMiddleware(Perfil.ADMIN), deleteAgenteConfig);

// Configurações — Conexões Unnichat (ADMIN e SUPERVISOR)
router.get("/configuracoes/unnichat/conexoes", authMiddleware, roleMiddleware(Perfil.ADMIN, Perfil.SUPERVISOR), listConexoes);
router.post("/configuracoes/unnichat/conexoes", authMiddleware, roleMiddleware(Perfil.ADMIN, Perfil.SUPERVISOR), createConexao);
router.put("/configuracoes/unnichat/conexoes/:id", authMiddleware, roleMiddleware(Perfil.ADMIN, Perfil.SUPERVISOR), updateConexao);
router.delete("/configuracoes/unnichat/conexoes/:id", authMiddleware, roleMiddleware(Perfil.ADMIN, Perfil.SUPERVISOR), deleteConexao);
router.post("/configuracoes/unnichat/conexoes/:id/testar", authMiddleware, roleMiddleware(Perfil.ADMIN, Perfil.SUPERVISOR), testarConexaoUnnichatConfig);

// Conversas Supabase — profissões / sessões / mensagens / stats / custos
router.get("/conversas/stats", authMiddleware, getStatsDashboard);
router.get("/conversas/custos", authMiddleware, getCustosAtendimentos);
router.get("/conversas/profissoes", authMiddleware, listProfissoes);
router.get("/conversas/:profissao/sessoes", authMiddleware, listSessoes);
router.get("/conversas/:profissao/sessoes/:sessionId/mensagens", authMiddleware, getMensagens);

