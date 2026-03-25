import OpenAI from "openai";
import axios from "axios";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { prisma } from "../prisma/client";
import type { ChatMessage, ChatResult } from "../types/agent.types";

/** Lê a chave OpenAI: ConfiguracaoProvedor (DB) → .env */
async function getApiKey(): Promise<string> {
  const config = await prisma.configuracaoProvedor.findUnique({ where: { provider: "openai" } });
  if (config?.apiKey && config.ativo) return config.apiKey;

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error(
      "OPENAI_API_KEY não configurado. Acesse Configurações → Provedores de IA.",
    );
  }
  return key;
}

async function createClient(): Promise<OpenAI> {
  return new OpenAI({ apiKey: await getApiKey() });
}

/** Transcreve áudio .ogg via Whisper-1. */
export async function transcribeAudio(mediaUrl: string): Promise<string> {
  const client = await createClient();

  const response = await axios.get<ArrayBuffer>(mediaUrl, { responseType: "arraybuffer" });
  const tmpFile = path.join(os.tmpdir(), `audio-${Date.now()}.ogg`);
  fs.writeFileSync(tmpFile, Buffer.from(response.data));

  try {
    const result = await client.audio.transcriptions.create({
      file: fs.createReadStream(tmpFile),
      model: "whisper-1",
      language: "pt",
    });
    return result.text;
  } finally {
    fs.unlink(tmpFile, () => undefined);
  }
}

/** Descreve uma imagem via GPT-4o-mini vision. */
export async function analyzeImage(mediaUrl: string): Promise<string> {
  const client = await createClient();

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: mediaUrl } },
          {
            type: "text",
            text: "Descreva o que está nessa imagem de forma objetiva e concisa, em português.",
          },
        ],
      },
    ],
    max_tokens: 500,
  });

  return response.choices[0]?.message?.content ?? "Não foi possível analisar a imagem.";
}

/** Chat genérico com qualquer modelo OpenAI. */
export async function chat(
  messages: ChatMessage[],
  model = "gpt-4.1-mini",
  maxTokens = 1024,
): Promise<ChatResult> {
  const client = await createClient();

  const response = await client.chat.completions.create({
    model,
    messages,
    max_tokens: maxTokens,
    temperature: 0.7,
  });

  return {
    content: response.choices[0]?.message?.content ?? "",
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
  };
}
