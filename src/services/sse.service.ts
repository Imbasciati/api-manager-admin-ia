import { Response } from "express";

/**
 * Gerencia as conexões SSE (Server-Sent Events) ativas.
 * Utilizado para transmitir eventos de atendimento em tempo real ao frontend.
 */

const clients = new Set<Response>();

/** Registra uma conexão SSE e remove ao fechar. */
export function addSseClient(res: Response) {
  clients.add(res);
  res.on("close", () => clients.delete(res));
}

/** Transmite um evento para todos os clientes conectados. */
export function broadcast(evento: string, dados: unknown) {
  const payload = `event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`;
  for (const res of clients) {
    try {
      res.write(payload);
    } catch {
      clients.delete(res);
    }
  }
}

/** Número de clientes SSE atualmente conectados. */
export function clientCount(): number {
  return clients.size;
}
