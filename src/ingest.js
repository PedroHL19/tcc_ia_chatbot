import fs from "fs";
import path from "path";
import crypto from "crypto";
import dotenv from "dotenv";
import { PDFParse } from "pdf-parse";
import { ensureCollection, upsertPoints, COLLECTION_NAME } from "./qdrantClient.js";
import { generateEmbedding, EMBEDDING_MODEL } from "./ollamaClient.js";
import { splitIntoChunks } from "./chunker.js";

dotenv.config();

const DOCS_DIR = "./docs";

/**
 * Lê o texto de um arquivo (.md ou .pdf)
 * @param {string} filePath 
 * @returns {Promise<string>}
 */
async function extractTextFromFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".md" || ext === ".txt") {
    return fs.readFileSync(filePath, "utf-8");
  }

  if (ext === ".pdf") {
    const dataBuffer = fs.readFileSync(filePath);
    try {
      if (typeof PDFParse === "function") {
        const parser = new PDFParse({ data: dataBuffer });
        const result = await parser.getText();
        return result.text || "";
      }
    } catch (err) {
      console.warn(`Aviso ao ler PDF com classe PDFParse (${filePath}): ${err.message}.`);
    }
  }

  return "";
}

async function runIngestion() {
  console.log("=== INICIANDO INGESTÃO DE DOCUMENTOS PARA O QDRANT ===");
  console.log(`Modelo de embeddings: ${EMBEDDING_MODEL}`);
  console.log(`Coleção de destino: ${COLLECTION_NAME}`);

  if (!fs.existsSync(DOCS_DIR)) {
    console.error(`Diretório ${DOCS_DIR} não encontrado.`);
    return;
  }

  const files = fs
    .readdirSync(DOCS_DIR)
    .filter((file) => [".md", ".pdf", ".txt"].includes(path.extname(file).toLowerCase()));

  if (files.length === 0) {
    console.log(`Nenhum documento (.md, .pdf, .txt) encontrado na pasta ${DOCS_DIR}.`);
    return;
  }

  console.log(`Encontrados ${files.length} documento(s): ${files.join(", ")}`);

  // 1. Garante que a coleção exista no Qdrant
  await ensureCollection();

  const allPoints = [];

  // 2. Processa cada documento
  for (const fileName of files) {
    const filePath = path.join(DOCS_DIR, fileName);
    console.log(`\nLendo documento: ${fileName}...`);
    
    const text = await extractTextFromFile(filePath);
    if (!text || text.trim().length === 0) {
      console.log(`Arquivo vazio ou sem texto extraível: ${fileName}`);
      continue;
    }

    // 3. Divide em chunks (500 tokens / 100 overlap)
    const chunks = splitIntoChunks(text, 500, 100);
    console.log(`Gerados ${chunks.length} chunks para ${fileName}.`);

    // 4. Gera embeddings para cada chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      process.stdout.write(`Vetorizando chunk ${i + 1}/${chunks.length}...\r`);
      
      const vector = await generateEmbedding(chunk);

      allPoints.push({
        id: crypto.randomUUID(),
        vector,
        payload: {
          text: chunk,
          source: fileName,
          chunkIndex: i,
          totalChunks: chunks.length
        }
      });
    }
    console.log(`\nConcluído processamento de ${fileName}.`);
  }

  // 5. Salva os pontos no Qdrant
  if (allPoints.length > 0) {
    console.log(`\nEnviando ${allPoints.length} pontos para o Qdrant...`);
    // Envia em lotes de 50 para garantir estabilidade
    const batchSize = 50;
    for (let i = 0; i < allPoints.length; i += batchSize) {
      const batch = allPoints.slice(i, i + batchSize);
      await upsertPoints(batch);
      console.log(`Lote ${Math.floor(i / batchSize) + 1}/${Math.ceil(allPoints.length / batchSize)} inserido com sucesso.`);
    }

    console.log("\n=== INGESTÃO FINALIZADA COM SUCESSO! ===");
    console.log(`Total de chunks indexados: ${allPoints.length}`);
    console.log(`Coleção pronta para consultas: ${COLLECTION_NAME}`);
  }
}

runIngestion().catch((err) => {
  console.error("Erro fatal durante a ingestão:", err);
  process.exit(1);
});
