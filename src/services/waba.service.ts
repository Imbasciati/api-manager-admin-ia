import axios from "axios";

const GRAPH_URL = "https://graph.facebook.com/v20.0";

const APP_ID     = process.env.META_APP_ID     ?? "";
const APP_SECRET = process.env.META_APP_SECRET ?? "";

// ── tipos ─────────────────────────────────────────────────────────────────────

interface TokenResponse {
  access_token: string;
  token_type:   string;
}

export interface WABAInfo {
  wabaId:        string;
  phoneNumberId: string;
  displayPhone:  string | null;
  qualidade:     string | null;
}

export interface TesteConexaoResult {
  ok:       boolean;
  mensagem: string;
}

export interface WABATemplate {
  id:         string;
  name:       string;
  status:     string;
  language:   string;
  category:   string;
  components: unknown[];
}

// ── helpers ───────────────────────────────────────────────────────────────────

function graphHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
}

// ── service ───────────────────────────────────────────────────────────────────

export const wabaService = {
  /**
   * Troca o código OAuth (retornado pelo Embedded Signup) por um access_token.
   * Requer META_APP_ID, META_APP_SECRET e META_REDIRECT_URI no .env.
   */
  async exchangeCode(code: string): Promise<TokenResponse> {
    const redirectUri = process.env.META_REDIRECT_URI ?? "";
    const { data } = await axios.get<TokenResponse>(`${GRAPH_URL}/oauth/access_token`, {
      params: {
        client_id:     APP_ID,
        client_secret: APP_SECRET,
        code,
        redirect_uri:  redirectUri,
      },
    });
    return data;
  },

  /**
   * Busca o WABA ID e o primeiro número de telefone vinculado ao token.
   */
  async getWABAInfo(accessToken: string): Promise<WABAInfo> {
    // Descobre quais WABA IDs foram concedidos via granular_scopes
    const meRes = await axios.get(`${GRAPH_URL}/me`, {
      params: { fields: "granular_scopes", access_token: accessToken },
    });

    const wabaScope = (meRes.data.granular_scopes as { scope: string; target_ids?: string[] }[])
      ?.find((s) => s.scope === "whatsapp_business_management");

    const wabaId = wabaScope?.target_ids?.[0] ?? "";
    if (!wabaId) throw new Error("Nenhuma WABA encontrada nas permissões concedidas.");

    // Busca números vinculados à WABA
    const phoneRes = await axios.get(`${GRAPH_URL}/${wabaId}/phone_numbers`, {
      params: {
        fields:       "id,display_phone_number,quality_rating,status",
        access_token: accessToken,
      },
    });

    const phones: { id: string; display_phone_number?: string; quality_rating?: string }[] =
      phoneRes.data.data ?? [];

    if (phones.length === 0) throw new Error("Nenhum número de telefone encontrado na WABA.");

    const phone = phones[0];
    return {
      wabaId,
      phoneNumberId: phone.id,
      displayPhone:  phone.display_phone_number ?? null,
      qualidade:     phone.quality_rating       ?? null,
    };
  },

  /**
   * Valida se o número de telefone e o token ainda estão ativos.
   */
  async testarConexao(phoneNumberId: string, accessToken: string): Promise<TesteConexaoResult> {
    try {
      const { data } = await axios.get(`${GRAPH_URL}/${phoneNumberId}`, {
        params: {
          fields:       "display_phone_number,quality_rating,status",
          access_token: accessToken,
        },
      });
      return {
        ok:       true,
        mensagem: `Número ${data.display_phone_number} ativo. Qualidade: ${data.quality_rating ?? "-"}. Status: ${data.status ?? "OK"}.`,
      };
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
      const msg = axiosErr?.response?.data?.error?.message ?? axiosErr?.message ?? "Erro na conexão";
      return { ok: false, mensagem: msg };
    }
  },

  /**
   * Envia mensagem de texto livre (apenas dentro da janela de 24h de conversa ativa).
   */
  async enviarMensagemTexto(
    phoneNumberId: string,
    accessToken:   string,
    to:            string,
    text:          string,
  ): Promise<void> {
    await axios.post(
      `${GRAPH_URL}/${phoneNumberId}/messages`,
      {
        messaging_product: "whatsapp",
        recipient_type:    "individual",
        to,
        type:              "text",
        text:              { preview_url: false, body: text },
      },
      { headers: graphHeaders(accessToken) },
    );
  },

  /**
   * Envia mensagem de template aprovado pela Meta (HSM).
   * Use components = [] para templates sem variáveis.
   */
  async enviarTemplate(
    phoneNumberId: string,
    accessToken:   string,
    to:            string,
    templateName:  string,
    languageCode:  string,
    components:    unknown[] = [],
  ): Promise<void> {
    await axios.post(
      `${GRAPH_URL}/${phoneNumberId}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name:       templateName,
          language:   { code: languageCode },
          components,
        },
      },
      { headers: graphHeaders(accessToken) },
    );
  },

  /**
   * Lista todos os templates cadastrados na WABA.
   */
  async listarTemplates(wabaId: string, accessToken: string): Promise<WABATemplate[]> {
    const { data } = await axios.get(`${GRAPH_URL}/${wabaId}/message_templates`, {
      params: {
        fields:       "id,name,status,language,category,components",
        access_token: accessToken,
        limit:        100,
      },
    });
    return data.data ?? [];
  },
};
