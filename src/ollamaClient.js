import { Ollama } from "ollama";
import dotenv from "dotenv";

dotenv.config();

const host = process.env.OLLAMA_HOST || "http://localhost:11434";
export const ollama = new Ollama({ host });

export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "bge-m3";
export const LLM_MODEL = process.env.LLM_MODEL || "llama3.1:8b";

// Tempo que os modelos ficam carregados na memória após o último uso.
// Aceita duração do Ollama ("1h", "30m") ou número em segundos; -1 mantém carregado indefinidamente (sem cold start).
const rawKeepAlive = (process.env.OLLAMA_KEEP_ALIVE || "1h").trim();
const KEEP_ALIVE = /^-?\d+$/.test(rawKeepAlive) ? parseInt(rawKeepAlive, 10) : rawKeepAlive;

// Executa o modelo de embeddings na CPU, liberando a memória da GPU para o LLM.
// Útil em GPUs com pouca VRAM: vetorizar uma pergunta curta na CPU leva frações de segundo.
const EMBEDDING_ON_CPU = /^(1|true|sim)$/i.test(process.env.EMBEDDING_ON_CPU || "");

// Limite de tokens gerados por resposta. 512 cobre com folga as respostas mais longas da base (ex.: estágios)
const NUM_PREDICT = parseInt(process.env.LLM_NUM_PREDICT, 10) || 512;

// Tamanho do contexto do LLM. Prompt que passa desse valor é cortado pelo Ollama pela metade, perdendo as instruções
const NUM_CTX = parseInt(process.env.LLM_NUM_CTX, 10) || 4096;

// Máximo de caracteres de trechos no prompt: desconta o que o system prompt e as instruções ocupam (~2400 tokens)
// e uma folga para a resposta (256), e converte com 3,2 caracteres por token, estimativa conservadora para português
export const MAX_CONTEXT_CHARS = Math.max(0, NUM_CTX - 2400 - 256) * 3.2;

/**
 * Gera o vetor de embedding para um texto usando o modelo configurado (padrão bge-m3, 1024 dimensões)
 * @param {string} text
 * @returns {Promise<number[]>}
 */
export async function generateEmbedding(text) {
  const response = await ollama.embeddings({
    model: EMBEDDING_MODEL,
    prompt: text,
    keep_alive: KEEP_ALIVE,
    ...(EMBEDDING_ON_CPU ? { options: { num_gpu: 0 } } : {})
  });
  return response.embedding;
}

/**
 * Envia mensagens para o modelo de chat (LLM_MODEL, padrão llama3.1:8b) e retorna o texto da resposta
 * @param {Array<{role: string, content: string}>} messages
 * @param {{num_predict?: number}} [overrides]
 * @returns {Promise<string>}
 */
export async function generateChat(messages, overrides = {}) {
  const response = await ollama.chat({
    model: LLM_MODEL,
    messages,
    stream: false,
    keep_alive: KEEP_ALIVE,
    options: {
      temperature: 0.2, // Respostas determinísticas e fundamentadas
      num_predict: NUM_PREDICT,
      num_ctx: NUM_CTX,
      ...overrides
    }
  });
  // Consumo de tokens de cada resposta, para avaliar se o prompt e o limite de resposta estão bem dimensionados
  if (!overrides.num_predict) {
    console.log(`[Tokens] prompt=${response.prompt_eval_count ?? "?"} resposta=${response.eval_count ?? "?"} | num_ctx=${NUM_CTX}`);
    if (response.done_reason === "length") console.log("[Aviso] Resposta cortada no limite de tokens");
  }
  return response.message.content;
}

/**
 * Carrega os dois modelos na memória ao iniciar a API, para que a primeira pergunta
 * de um usuário não pague o tempo de carregamento (cold start).
 * @returns {Promise<number>} tempo de aquecimento em segundos
 */
export async function warmUpModels() {
  const inicio = Date.now();
  await generateEmbedding("aquecimento");
  await generateChat([{ role: "user", content: "ok" }], { num_predict: 1 });
  return (Date.now() - inicio) / 1000;
}

export const OLLAMA_CONFIG = { keepAlive: KEEP_ALIVE, embeddingOnCpu: EMBEDDING_ON_CPU, numPredict: NUM_PREDICT, numCtx: NUM_CTX };
