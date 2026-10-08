import fs from "fs";
import path from "path";
import crypto from "crypto";
import dotenv from "dotenv";
import { PDFParse } from "pdf-parse";
import { recreateCollection, upsertPoints, COLLECTION_NAME } from "./qdrantClient.js";
import { generateEmbedding, EMBEDDING_MODEL } from "./ollamaClient.js";
import { splitIntoChunks } from "./chunker.js";

dotenv.config();

const DOCS_DIR = fs.existsSync("./docs/base_conhecimento")
  ? "./docs/base_conhecimento"
  : "./docs";

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

/**
 * Coleta recursivamente arquivos (.md, .pdf, .txt)
 * @param {string} dir
 * @returns {string[]}
 */
function getAllFilesRecursively(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const item of list) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllFilesRecursively(fullPath));
    } else {
      const ext = path.extname(item).toLowerCase();
      if ([".md", ".pdf", ".txt"].includes(ext)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

/**
 * Extrai metadados de Curso e Ano de forma inteligente:
 * 1. Frontmatter/cabeçalho no arquivo (ex.: curso: BSI, ano: 2023)
 * 2. Nomes de subpastas (ex.: docs/base_conhecimento/BSI/2023/)
 * 3. Convenção no nome do arquivo (ex.: bsi_matriz_curricular_nova.md, ppc_logistica_2022.pdf)
 * 4. Padrão "TODOS" para documentos institucionais gerais
 * @param {string} filePath
 * @param {string} fileContent
 * @returns {{ curso: string, ano: string }}
 */
function extractDocumentMetadata(filePath, fileContent) {
  let curso = "TODOS";
  let ano = "TODOS";

  const normPath = filePath.replace(/\\/g, "/");
  const fileName = path.basename(filePath).toLowerCase();

  // 1. Tenta extrair de Frontmatter ou comentários no início do texto
  const frontmatterMatch = fileContent.match(/^(?:---|\/\*|<!--)([\s\S]*?)(?:---|\*\/|-->)/);
  if (frontmatterMatch) {
    const header = frontmatterMatch[1];
    const cursoMatch = header.match(/curso\s*:\s*([^\r\n,]+)/i);
    const anoMatch = header.match(/ano\s*:\s*([^\r\n,]+)/i);
    if (cursoMatch) curso = cursoMatch[1].trim().toUpperCase();
    if (anoMatch) ano = anoMatch[1].trim();
  }

  // 2. Extração por subpastas (ex: /BSI/2023/)
  const pathParts = normPath.split("/");
  for (let i = 0; i < pathParts.length - 1; i++) {
    const part = pathParts[i].toUpperCase();
    if (["BSI", "LOGISTICA", "ADMINISTRACAO", "PEDAGOGIA"].includes(part)) {
      curso = part;
    }
    if (/^(19|20)\d{2}$/.test(part)) {
      ano = part;
    }
  }

  // 3. Fallback inteligente por nome do arquivo se ainda for TODOS
  if (curso === "TODOS") {
    if (fileName.includes("bsi")) {
      curso = "BSI";
    } else if (fileName.includes("logistica") || fileName.includes("log_")) {
      curso = "LOGISTICA";
    } else if (fileName.includes("admin") || fileName.includes("adm_")) {
      curso = "ADMINISTRACAO";
    }
  }

  if (ano === "TODOS") {
    const yearMatch = fileName.match(/(19|20\d{2})/);
    if (yearMatch) {
      ano = yearMatch[0];
    }
  }

  return { curso, ano };
}

async function runIngestion() {
  console.log("=== INICIANDO INGESTÃO DE DOCUMENTOS PARA O QDRANT ===");
  console.log(`Modelo de embeddings: ${EMBEDDING_MODEL}`);
  console.log(`Coleção de destino: ${COLLECTION_NAME}`);

  if (!fs.existsSync(DOCS_DIR)) {
    console.error(`Diretório ${DOCS_DIR} não encontrado.`);
    return;
  }

  const files = getAllFilesRecursively(DOCS_DIR);

  if (files.length === 0) {
    console.log(`Nenhum documento (.md, .pdf, .txt) encontrado na pasta ${DOCS_DIR}.`);
    return;
  }

  console.log(`Encontrados ${files.length} documento(s) para indexação.`);

  // 1. Recria a coleção no Qdrant limpando versões antigas/duplicadas
  await recreateCollection();

  const allPoints = [];

  // 2. Processa cada documento
  for (const filePath of files) {
    const relativeName = path.relative(DOCS_DIR, filePath);
    console.log(`\nLendo documento: ${relativeName}...`);
    
    const text = await extractTextFromFile(filePath);
    if (!text || text.trim().length === 0) {
      console.log(`Arquivo vazio ou sem texto extraível: ${relativeName}`);
      continue;
    }

    const { curso, ano } = extractDocumentMetadata(filePath, text);
    console.log(`  -> Metadados atribuídos: [Curso: ${curso}] | [Ano: ${ano}]`);

    // 3. Divide em chunks (500 tokens / 100 overlap)
    const chunks = splitIntoChunks(text, 500, 100);
    console.log(`  -> Gerados ${chunks.length} chunks.`);

    // 4. Gera embeddings para cada chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      process.stdout.write(`  Vetorizando chunk ${i + 1}/${chunks.length}...\r`);
      
      const vector = await generateEmbedding(chunk);

      allPoints.push({
        id: crypto.randomUUID(),
        vector,
        payload: {
          text: chunk,
          source: relativeName,
          curso,
          ano,
          chunkIndex: i,
          totalChunks: chunks.length
        }
      });
    }
    console.log(`\n  Concluído processamento de ${relativeName}.`);
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
