/**
 * Utilitário de divisão de texto em Chunks para RAG
 * Padrão: 500 tokens por chunk com 100 tokens de overlap (a ingestão usa 500/80).
 * 
 * Em modelos de NLP/LLM, 1 token equivale em média a ~4 caracteres (ou ~0.75 palavras).
 */

const CHARS_PER_TOKEN = 4;

/**
 * Divide um texto em pedaços (chunks) respeitando limites naturais de frases e parágrafos.
 * @param {string} text - Texto completo a ser dividido
 * @param {number} chunkSizeTokens - Tamanho de cada chunk em tokens (padrão: 500)
 * @param {number} overlapTokens - Sobreposição entre chunks adjacentes em tokens (padrão: 100)
 * @returns {string[]} Lista de chunks de texto
 */
export function splitIntoChunks(text, chunkSizeTokens = 500, overlapTokens = 100) {
  if (!text || typeof text !== "string") return [];

  const cleanText = text.replace(/\r\n/g, "\n").trim();
  if (!cleanText) return [];

  const chunkSizeChars = chunkSizeTokens * CHARS_PER_TOKEN; // ~2000 caracteres
  const overlapChars = overlapTokens * CHARS_PER_TOKEN;     // ~400 caracteres

  const chunks = [];
  let startIndex = 0;

  while (startIndex < cleanText.length) {
    let endIndex = startIndex + chunkSizeChars;

    // Se já alcançou o fim do texto
    if (endIndex >= cleanText.length) {
      const remainingChunk = cleanText.slice(startIndex).trim();
      if (remainingChunk.length > 0) {
        chunks.push(remainingChunk);
      }
      break;
    }

    // Tenta encontrar um ponto de corte natural (parágrafo duplo, quebra de linha ou fim de frase)
    let breakPoint = cleanText.lastIndexOf("\n\n", endIndex);
    if (breakPoint <= startIndex) {
      breakPoint = cleanText.lastIndexOf("\n", endIndex);
    }
    if (breakPoint <= startIndex) {
      breakPoint = cleanText.lastIndexOf(". ", endIndex);
      if (breakPoint > startIndex) breakPoint += 1; // Mantém o ponto final
    }
    if (breakPoint <= startIndex) {
      breakPoint = cleanText.lastIndexOf(" ", endIndex);
    }
    if (breakPoint <= startIndex) {
      breakPoint = endIndex;
    }

    const chunk = cleanText.slice(startIndex, breakPoint).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    // Desliza a janela mantendo o overlap solicitado
    const nextStart = breakPoint - overlapChars;
    startIndex = nextStart > startIndex ? nextStart : startIndex + 1;
  }

  return chunks;
}
