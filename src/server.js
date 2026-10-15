import express from "express";
import dotenv from "dotenv";
import { SYSTEM_PROMPT, buildUserPromptWithContext } from "./prompt.js";
import { generateEmbedding, generateChat, LLM_MODEL, EMBEDDING_MODEL } from "./ollamaClient.js";
import { searchSimilar, buildCourseYearFilter, COLLECTION_NAME } from "./qdrantClient.js";

dotenv.config();

const app = express();
app.use(express.json());

// Middleware de autenticação tolerante a prefixos (Key/Bearer)
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const rawExpected = process.env.API_KEY || process.env.API_TOKEN || "MEU_TOKEN_SECRETO";

  if (!authHeader) {
    return res.status(401).json({ 
      sucesso: false, 
      erro: "Acesso negado. Chave de autorização ausente." 
    });
  }

  // Normaliza removendo prefixos 'Key ' ou 'Bearer ' para comparar o valor real da chave
  const cleanReceived = authHeader.replace(/^(Key|Bearer)\s+/i, "").trim();
  const cleanExpected = rawExpected.replace(/^(Key|Bearer)\s+/i, "").trim();

  if (cleanReceived !== cleanExpected) {
    return res.status(401).json({ 
      sucesso: false, 
      erro: "Acesso negado. Chave de autorização inválida." 
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

    // Parâmetros opcionais de perfil do aluno (curso e ano de ingresso/matriz)
    const rawCurso = req.body.curso || req.body.course || null;
    const rawAno = req.body.ano || req.body.year || req.body.ano_ingresso || null;

    const curso = rawCurso && typeof rawCurso === "string" && rawCurso.trim().length > 0
      ? rawCurso.trim()
      : null;
    const ano = rawAno ? String(rawAno).trim() : null;

    const perfilLog = [
      curso ? `Curso: ${curso}` : null,
      ano ? `Ano: ${ano}` : null
    ].filter(Boolean).join(" | ");

    console.log(`\n[${new Date().toLocaleTimeString()}] Nova pergunta recebida: "${pergunta}" ${perfilLog ? `(${perfilLog})` : ""}`);

    console.time("[Tempo] 1. Embedding");
    // 1. Gera embedding da pergunta com o BGE-M3 (1024 dimensões)
    const queryVector = await generateEmbedding(pergunta.trim());
    console.timeEnd("[Tempo] 1. Embedding");

    // Monta filtro por metadados no Qdrant se curso ou ano foram informados
    const filter = buildCourseYearFilter(curso, ano);

    console.time("[Tempo] 2. Qdrant Search");
    // 2. Busca os Top-3 chunks mais relevantes no Qdrant
    let searchResults = await searchSimilar(queryVector, 3, filter);

    // Fallback inteligente: se o filtro estrito não retornou nada, busca sem restrição
    if (searchResults.length === 0 && filter) {
      console.log("Aviso: Nenhum documento retornado com filtro restrito. Realizando busca ampla...");
      searchResults = await searchSimilar(queryVector, 3);
    }
    console.timeEnd("[Tempo] 2. Qdrant Search");

    // Filtra apenas trechos com relevância mínima (48%) para evitar alucinações com perguntas fora do escopo ou nomes isolados
    const MIN_RELEVANCE_SCORE = 0.48;
    const relevantResults = searchResults.filter((r) => r.score >= MIN_RELEVANCE_SCORE);

    const contextChunks = relevantResults.map((result) => ({
      text:       result.payload?.text       || "",
      source:     result.payload?.source     || "Oficial",
      curso:      result.payload?.curso      || "TODOS",
      tipo:       result.payload?.tipo       || "geral",
      descricao:  result.payload?.descricao  || "",
      ano_min:    result.payload?.ano_min    ?? 0,
      ano_max:    result.payload?.ano_max    ?? 9999,
      score:      result.score
    }));

    console.log(`Recuperados ${searchResults.length} trechos do Qdrant (${contextChunks.length} acima do score mínimo de ${(MIN_RELEVANCE_SCORE * 100)}%):`);
    searchResults.forEach((c, idx) => {
      const status = c.score >= MIN_RELEVANCE_SCORE ? "[USADO]" : "[IGNORADO - SCORE BAIXO]";
      const anoLabel = c.payload?.tipo === "ppc"
        ? `${c.payload?.ano_min ?? "?"}–${c.payload?.ano_max === 9999 ? "atual" : c.payload?.ano_max ?? "?"}`
        : "GERAL";
      console.log(`  [Trecho ${idx + 1}] Score: ${(c.score * 100).toFixed(1)}% | ${status} | Curso: ${c.payload?.curso || "TODOS"} | Anos: ${anoLabel} | ${c.payload?.source || "?"}`);
    });

    // 3. Monta o prompt contextualizado incluindo perfil do aluno
    const userPrompt = buildUserPromptWithContext(contextChunks, pergunta.trim(), { curso, ano });

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt }
    ];

    console.time("[Tempo] 3. LLM Generate");
    // 4. Executa a inferência local no Llama
    const resposta = await generateChat(messages);
    console.timeEnd("[Tempo] 3. LLM Generate");

    // Identifica se a pergunta foi fora de escopo (score baixo ou recusa padrão)
    const isForaDeEscopo =
      contextChunks.length === 0 ||
      resposta.includes("Não consegui identificar uma dúvida relacionada");

    const encontrouResposta = !isForaDeEscopo;

    return res.json({
      sucesso: true,
      encontrou_resposta: encontrouResposta,
      fora_de_escopo: isForaDeEscopo,
      resposta,
      perfil: {
        curso,
        ano
      }
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