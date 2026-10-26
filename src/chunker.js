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

/**
 * Divide documentos de perguntas e respostas (seções "### ") em um chunk por pergunta,
 * evitando que várias respostas diferentes caiam no mesmo trecho e confundam a busca e o modelo.
 * Cada chunk recebe o título do documento ("# ...") como contexto.
 * Documentos sem seções "### " (ou seções muito longas) seguem a divisão por tamanho.
 * @param {string} text - Conteúdo do documento (sem frontmatter)
 * @param {number} chunkSizeTokens
 * @param {number} overlapTokens
 * @returns {string[]}
 */
export function splitMarkdownSections(text, chunkSizeTokens = 500, overlapTokens = 100) {
  if (!text || typeof text !== "string") return [];

  const cleanText = text.replace(/\r\n/g, "\n").trim();

  // Só documentos de perguntas e respostas (maioria dos títulos "### " é pergunta) são divididos por seção;
  // matrizes curriculares e calendário usam "###" para períodos/meses e precisam manter o contexto geral junto
  const headings = cleanText.match(/^### .+$/gm) || [];
  const perguntas = headings.filter((h) => h.includes("?")).length;
  if (headings.length === 0 || perguntas < headings.length / 2) {
    return splitIntoChunks(cleanText, chunkSizeTokens, overlapTokens);
  }

  const titleMatch = cleanText.match(/^# .+$/m);
  const title = titleMatch ? titleMatch[0].replace(/^#\s+/, "").trim() : "";
  const maxChars = chunkSizeTokens * CHARS_PER_TOKEN * 1.5;

  const [intro, ...sections] = cleanText.split(/\n(?=### )/);
  const chunks = [];

  // Texto antes da primeira pergunta (apresentação, contatos) vira um chunk próprio
  const introBody = intro.replace(/^# .+$/m, "").replace(/^-{3,}\s*$/gm, "").trim();
  if (introBody.length > 0) chunks.push(title ? `${title}\n\n${introBody}` : introBody);

  for (const section of sections) {
    const body = section.replace(/\n-{3,}\s*$/g, "").trim();
    if (!body) continue;
    const parts = body.length > maxChars ? splitIntoChunks(body, chunkSizeTokens, overlapTokens) : [body];
    for (const part of parts) chunks.push(title ? `${title}\n\n${part}` : part);
  }

  return chunks;
}
