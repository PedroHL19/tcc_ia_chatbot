import { Ollama } from "ollama";
import dotenv from "dotenv";

dotenv.config();

const host = process.env.OLLAMA_HOST || "http://localhost:11434";
export const ollama = new Ollama({ host });

export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "bge-m3";
export const LLM_MODEL = process.env.LLM_MODEL || "llama3.1:8b";

/**
 * Gera o vetor de embedding para um texto usando o modelo configurado (padrão bge-m3, 1024 dimensões)
 * @param {string} text 
 * @returns {Promise<number[]>}
 */
export async function generateEmbedding(text) {
  const response = await ollama.embeddings({
    model: EMBEDDING_MODEL,
    prompt: text,
    keep_alive: "1h"
  });
  return response.embedding;
}

/**
 * Envia mensagens para o modelo de chat (LLM_MODEL, padrão llama3.1:8b) e retorna o texto da resposta
 * @param {Array<{role: string, content: string}>} messages 
 * @returns {Promise<string>}
 */
export async function generateChat(messages) {
  const response = await ollama.chat({
    model: LLM_MODEL,
    messages,
    stream: false,
    keep_alive: "1h",
    options: {
      temperature: 0.2, // Respostas determinísticas e fundamentadas
      num_predict: 512, // Folga para listas longas (ex.: matriz curricular) sem cortar a resposta
      num_ctx: 4096     // Contexto expandido para comportar todos os chunks sem truncar instruções
    }
  });
  return response.message.content;
}
