export type TipoMidia = "text" | "audio" | "image";

export type Classificacao = "LEAD_REAL" | "RESPOSTA_AUTOMATICA";

export interface ManyChatPayload {
  subscriber_id: string;
  page_id?: string;
  first_name?: string;
  last_name?: string;
  type?: TipoMidia;
  text?: string;
  media_url?: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
}
