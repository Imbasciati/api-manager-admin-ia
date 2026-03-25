import axios from "axios";

const BASE_URL = "https://unnichat.com.br/api";

function headers(apiKey: string) {
  // Remove "Bearer " prefix if the user pasted the full header value
  const token = apiKey.replace(/^Bearer\s+/i, "").trim();
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

/** Envia uma mensagem de texto via WhatsApp para um número. */
export async function enviarMensagem(apiKey: string, phone: string, messageText: string) {
  // O Unnichat aceita tanto /messages quanto /meta/messages dependendo da versão
  // Tentamos /messages primeiro (padrão mais comum) com fallback para /meta/messages
  try {
    const { data } = await axios.post(
      `${BASE_URL}/messages`,
      { phone, messageText },
      { headers: headers(apiKey), timeout: 15_000 },
    );
    return data;
  } catch (err: any) {
    // Se /messages falhar com 404, tenta /meta/messages
    if (err?.response?.status === 404) {
      const { data } = await axios.post(
        `${BASE_URL}/meta/messages`,
        { phone, messageText },
        { headers: headers(apiKey), timeout: 15_000 },
      );
      return data;
    }
    throw err;
  }
}

/** Busca um contato pelo telefone. Retorna null se não encontrado. */
export async function buscarContatoPorTelefone(apiKey: string, phone: string) {
  try {
    const { data } = await axios.post(
      `${BASE_URL}/contact/search`,
      { phone },
      { headers: headers(apiKey), timeout: 10_000 },
    );
    return data?.data ?? data ?? null;
  } catch {
    return null;
  }
}

/** Cria um contato no Unnichat. */
export async function criarContato(apiKey: string, name: string, phone: string) {
  const { data } = await axios.post(
    `${BASE_URL}/contact`,
    { name, phone },
    { headers: headers(apiKey), timeout: 10_000 },
  );
  return data?.data ?? data;
}

/**
 * Testa a conexão com o Unnichat validando a API Key.
 * Faz uma chamada simples de busca — se retornar 401/403 a key é inválida,
 * qualquer outro status (200, 404, etc.) confirma que a chave é válida.
 */
export async function testarConexao(apiKey: string): Promise<{ ok: boolean; mensagem: string }> {
  try {
    await axios.post(
      `${BASE_URL}/contact/search`,
      { phone: "5500000000000" },
      { headers: headers(apiKey), timeout: 10_000, validateStatus: () => true },
    ).then((r) => {
      if (r.status === 401 || r.status === 403) {
        throw new Error("API Key inválida ou sem permissão (HTTP " + r.status + ")");
      }
    });
    return { ok: true, mensagem: "Conexão estabelecida com sucesso" };
  } catch (err: any) {
    return { ok: false, mensagem: err?.message ?? "Erro ao conectar com o Unnichat" };
  }
}
