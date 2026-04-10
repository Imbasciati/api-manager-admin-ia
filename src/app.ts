import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import compression from "compression";
import { router } from "./routes";
import { webhookRouter } from "./routes/webhook.route";
import { agentAdminRouter } from "./routes/agent-admin.route";
import { authMiddleware } from "./middlewares/auth.middleware";
import { errorHandlerMiddleware } from "./middlewares/errorHandler.middleware";
import { fail } from "./utils/response";
import { prisma } from "./prisma/client";
import { iniciarMonitoramentoConexoes, pararMonitoramentoConexoes } from "./services/conexao-health.service";

// ── Validação de variáveis de ambiente obrigatórias ───────────────────────────
const REQUIRED_ENV = ["DATABASE_URL", "JWT_SECRET"] as const;
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    // eslint-disable-next-line no-console
    console.error(`[startup] Variável de ambiente obrigatória ausente: ${key}`);
    process.exit(1);
  }
}

const app = express();

// Necessário quando o Express está atrás de proxy/nginx (produção)
app.set("trust proxy", 1);

// ── Segurança e performance ───────────────────────────────────────────────────
app.use(helmet());
app.use(compression());

app.use(
  cors({
    origin: (origin, callback) => {
      const allowedOrigins = (process.env.CORS_ORIGIN ?? "http://localhost:5173,http://localhost:5174,https://front-manager-ia-dev.betaonline.com.br,https://front-manager-ia.betaonline.com.br,https://api-ia.betaonline.com.br")
        .split(",")
        .map((o) => o.trim());

      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS bloqueado para origem: ${origin}`));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get("/health", (_req, res) => {
  return res.json({ success: true, data: { status: "ok" } });
});

// Webhook público (sem JWT) — recebe mensagens do ManyChat
app.use("/webhook", webhookRouter);

// Rotas protegidas por JWT
app.use("/api/agents", authMiddleware, agentAdminRouter);

app.use("/api", router);

app.use((_req, res) => fail(res, 404, "Rota não encontrada", "NOT_FOUND"));
app.use(errorHandlerMiddleware);

// ── Inicialização ─────────────────────────────────────────────────────────────
const port = Number(process.env.PORT ?? 3001);
const server = app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Beta Admin IA API executando na porta ${port}`);
  iniciarMonitoramentoConexoes();
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
async function shutdown(signal: string) {
  // eslint-disable-next-line no-console
  console.log(`[shutdown] Sinal ${signal} recebido. Encerrando servidor...`);
  pararMonitoramentoConexoes();
  server.close(async () => {
    await prisma.$disconnect();
    // eslint-disable-next-line no-console
    console.log("[shutdown] Servidor encerrado com sucesso.");
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

