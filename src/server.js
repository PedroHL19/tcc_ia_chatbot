import express from "express";
import dotenv from "dotenv";
import { SYSTEM_PROMPT, buildUserPromptWithContext } from "./prompt.js";
import { generateEmbedding, generateChat, LLM_MODEL, EMBEDDING_MODEL } from "./ollamaClient.js";
import { searchSimilar, COLLECTION_NAME } from "./qdrantClient.js";

dotenv.config();

const app = express();
app.use(express.json());

// Middleware de autenticação
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization;
  // O token esperado pode vir do .env, usando um valor padrão por segurança temporária
  const expectedToken = process.env.API_TOKEN || "MEU_TOKEN_SECRETO";
  
  // Suporta o formato "Key <token>" (padrão Blip), "Bearer <token>" ou o token direto
  const isValid =
    token === `Key ${expectedToken}` ||
    token === `Bearer ${expectedToken}` ||
    token === expectedToken;

  if (!token || !isValid) {
    return res.status(401).json({ 
      sucesso: false, 
      erro: "Acesso negado. Token inválido ou ausente." 
    });
  }
  next();
};

// Endpoint de verificação de saúde da API
app.get("/health", (req, res) => {
  return res.status(200).json({
    sucesso: true,
    status: "ok",
    mensagem: "API RAG (IFMG Sabará) ativa e operando",
    config: {
      llm: LLM_MODEL,
      embeddings: EMBEDDING_MODEL,
      colecao: COLLECTION_NAME
    }
  });
});

// Endpoint principal consultado pelo Blip ou frontend
app.post("/agente", authMiddleware, async (req, res) => {
  try {
    // Suporta { mensagem: "..." } ou variações comuns do Blip
    const pergunta =
      req.body.mensagem || req.body.message || req.body.text || req.body.content;

    if (!pergunta || typeof pergunta !== "string" || pergunta.trim().length === 0) {
      return res.status(400).json({
        sucesso: false,
        erro: "Campo 'mensagem' é obrigatório e não pode ser vazio."
      });
    }

    console.log(`\n[${new Date().toLocaleTimeString()}] Nova pergunta recebida: "${pergunta}"`);

    console.time("[Tempo] 1. Embedding");
    // 1. Gera embedding da pergunta com o BGE-M3 (1024 dimensões)
    const queryVector = await generateEmbedding(pergunta.trim());
    console.timeEnd("[Tempo] 1. Embedding");

    console.time("[Tempo] 2. Qdrant Search");
    // 2. Busca os Top-3 chunks mais relevantes no Qdrant (similaridade Cosseno)
    const searchResults = await searchSimilar(queryVector, 3);
    console.timeEnd("[Tempo] 2. Qdrant Search");

    // Filtra apenas trechos com relevância mínima (48%) para evitar alucinações com perguntas fora do escopo ou nomes isolados
    const MIN_RELEVANCE_SCORE = 0.48;
    const relevantResults = searchResults.filter((r) => r.score >= MIN_RELEVANCE_SCORE);

    const contextChunks = relevantResults.map((result) => ({
      text: result.payload?.text || "",
      source: result.payload?.source || "Oficial",
      score: result.score
    }));

    console.log(`Recuperados ${searchResults.length} trechos do Qdrant (${contextChunks.length} acima do score mínimo de ${(MIN_RELEVANCE_SCORE * 100)}%):`);
    searchResults.forEach((c, idx) => {
      const status = c.score >= MIN_RELEVANCE_SCORE ? "[USADO]" : "[IGNORADO - SCORE BAIXO]";
      console.log(`  [Trecho ${idx + 1}] Score: ${(c.score * 100).toFixed(1)}% | ${status} | Fonte: ${c.payload?.source || "Oficial"}`);
    });

    // 3. Monta o prompt contextualizado
    const userPrompt = buildUserPromptWithContext(contextChunks, pergunta.trim());

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt }
    ];

    console.time("[Tempo] 3. LLM Generate");
    // 4. Executa a inferência local no Llama 3.1 8B
    const resposta = await generateChat(messages);
    console.timeEnd("[Tempo] 3. LLM Generate");

    return res.json({
      sucesso: true,
      resposta
    });
  } catch (error) {
    console.error("Erro ao processar consulta no agente RAG:", error);

    return res.status(500).json({
      sucesso: false,
      erro: "Erro interno ao processar a consulta.",
      detalhes: error.message
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`Servidor RAG rodando na porta ${PORT}`);
  console.log(`Coleção Qdrant: ${COLLECTION_NAME}`);
  console.log(`Modelo LLM: ${LLM_MODEL} | Embeddings: ${EMBEDDING_MODEL}`);
  console.log(`======================================================\n`);
});