import { chat } from "../services/openai.service";
import type { Classificacao } from "../types/agent.types";

const SYSTEM_PROMPT = `Você é um classificador de mensagens de WhatsApp para um time de vendas.

Sua tarefa: analisar a mensagem recebida e determinar se é de um lead real ou uma resposta automática.

Classifique como "RESPOSTA_AUTOMATICA" quando:
- Parece texto gerado por bot ou fluxo automático do ManyChat
- É uma confirmação automática ("Sua mensagem foi recebida", "Obrigado por entrar em contato")
- É uma resposta de opt-in/opt-out
- É um número isolado que aciona um menu ("1", "2", "sim", "não", "menu")
- Contém linguagem genérica e impessoal típica de automações
- É claramente uma saudação automática sem contexto real

Classifique como "LEAD_REAL" quando:
- Há uma pergunta genuína sobre produto, serviço ou preço
- A pessoa demonstra interesse ou curiosidade real
- A mensagem tem contexto e personalidade humana
- É uma resposta que continua uma conversa de forma natural
- Contém dúvidas ou objeções específicas

Responda APENAS com JSON válido, sem texto adicional:
{"classificacao": "LEAD_REAL" | "RESPOSTA_AUTOMATICA", "motivo": "breve explicação em português"}`;

export async function classify(text: string): Promise<Classificacao> {
  try {
    const result = await chat(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Mensagem: "${text}"` },
      ],
      "gpt-4.1-mini",
      100,
    );

    const parsed = JSON.parse(result.content) as { classificacao: string };
    return parsed.classificacao === "LEAD_REAL" ? "LEAD_REAL" : "RESPOSTA_AUTOMATICA";
  } catch {
    // Em caso de falha no parse/chamada, assume lead real para não perder leads
    return "LEAD_REAL";
  }
}
