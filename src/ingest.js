import fs from "fs";
import path from "path";
import crypto from "crypto";
import dotenv from "dotenv";
import { recreateCollection, upsertPoints, COLLECTION_NAME } from "./qdrantClient.js";
import { generateEmbedding, EMBEDDING_MODEL } from "./ollamaClient.js";
import { splitIntoChunks } from "./chunker.js";

dotenv.config();

const BASE_CONHEC_DIR = "./docs/base_conhecimento";

/**
 * Lê arquivos de texto (.md, .txt)
 */
function readText(filePath) {
  return fs.readFileSync(filePath, "utf-8");
}

/**
 * Extrai metadados do cabeçalho YAML (Frontmatter) do Markdown
 * Suporta:
 *   curso: BSI | LOGISTICA | PROCESSOS_GERENCIAIS | ENG_AUTOMACAO | ADMINISTRACAO | TODOS
 *   ano_min: 2023 (ou 0 para geral)
 *   ano_max: 9999 (ou ano limite)
 *   tipo: normativo_curso | institucional_geral
 */
function extractFrontmatter(filePath, content) {
  let curso = "TODOS";
  let ano_min = 0;
  let ano_max = 9999;
  let tipo = "geral";
  let descricao = path.basename(filePath, path.extname(filePath));

  const fmMatch = content.match(/^---[\s\S]*?---/);
  if (fmMatch) {
    const fm = fmMatch[0];

    const cursoMatch = fm.match(/curso\s*:\s*([^\r\n]+)/i);
    if (cursoMatch) curso = cursoMatch[1].trim().toUpperCase();

    const minMatch = fm.match(/ano_min\s*:\s*(\d+)/i);
    if (minMatch) ano_min = parseInt(minMatch[1], 10);

    const maxMatch = fm.match(/ano_max\s*:\s*(\d+)/i);
    if (maxMatch) ano_max = parseInt(maxMatch[1], 10);

    const tipoMatch = fm.match(/tipo\s*:\s*([^\r\n]+)/i);
    if (tipoMatch) tipo = tipoMatch[1].trim();

    // Remove o frontmatter do texto indexado para evitar ruído no chunk
    content = content.replace(/^---[\s\S]*?---\s*/, "");
  } else {
    // Fallback inteligente pelo nome do arquivo se não tiver frontmatter
    const lower = filePath.toLowerCase();
    if (lower.includes("bsi")) {
      curso = "BSI";
    } else if (lower.includes("logistica") || lower.includes("log_")) {
      curso = "LOGISTICA";
    } else if (lower.includes("processos") || lower.includes("tpg")) {
      curso = "PROCESSOS_GERENCIAIS";
    } else if (lower.includes("eng_automacao") || lower.includes("automacao")) {
      curso = "ENG_AUTOMACAO";
    } else if (lower.includes("administracao") || lower.includes("adm_")) {
      curso = "ADMINISTRACAO";
    }
  }

  return { curso, ano_min, ano_max, tipo, descricao, cleanContent: content };
}

/**
 * Coleta recursivamente arquivos (.md, .txt)
 */
function collectFiles(dir) {
  const EXTS = [".md", ".txt"];
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    if (fs.statSync(full).isDirectory()) {
      results.push(...collectFiles(full));
    } else if (EXTS.includes(path.extname(item).toLowerCase())) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Executa a ingestão focada dos documentos estruturados em Markdown
 */
async function runIngestion() {
  console.log("=== INICIANDO INGESTÃO DE BASE DE CONHECIMENTO (.MD) NO QDRANT ===");
  console.log(`Modelo de embeddings : ${EMBEDDING_MODEL}`);
  console.log(`Coleção de destino   : ${COLLECTION_NAME}`);
  console.log(`Diretório de base    : ${BASE_CONHEC_DIR}\n`);

  const files = collectFiles(BASE_CONHEC_DIR);

  if (files.length === 0) {
    console.error(`Nenhum arquivo .md encontrado em ${BASE_CONHEC_DIR}.`);
    return;
  }

  console.log(`Encontrados ${files.length} documentos Markdown curados para indexação.\n`);

  // Recria a coleção garantindo limpeza de resíduos anteriores e índices numéricos
  await recreateCollection();

  const allPoints = [];

  for (const filePath of files) {
    const fileName = path.basename(filePath);
    const rawContent = readText(filePath);

    if (!rawContent || rawContent.trim().length === 0) {
      console.log(`Aviso: Arquivo vazio ignorado (${fileName})`);
      continue;
    }

    const { curso, ano_min, ano_max, tipo, descricao, cleanContent } = extractFrontmatter(filePath, rawContent);

    const anoLabel = ano_min === 0 && ano_max === 9999 
      ? "TODOS" 
      : `${ano_min} a ${ano_max === 9999 ? "atual" : ano_max}`;

    console.log(`Processando: ${fileName}`);
    console.log(`  -> Metadados: Curso=[${curso}] | Anos=[${anoLabel}] | Tipo=[${tipo}]`);

    // Chunks menores e precisos (500 tokens / 80 overlap)
    const chunks = splitIntoChunks(cleanContent, 500, 80);
    console.log(`  -> ${chunks.length} chunks gerados.`);

    for (let i = 0; i < chunks.length; i++) {
      process.stdout.write(`     Vetorizando chunk ${i + 1}/${chunks.length}...\r`);
      const vector = await generateEmbedding(chunks[i]);

      allPoints.push({
        id: crypto.randomUUID(),
        vector,
        payload: {
          text: chunks[i],
          source: fileName,
          curso,
          ano_min,
          ano_max,
          tipo,
          descricao,
          chunkIndex: i,
          totalChunks: chunks.length
        }
      });
    }
    console.log(`\n  Concluído: ${fileName}\n`);
  }

  if (allPoints.length === 0) {
    console.log("Nenhum chunk foi gerado.");
    return;
  }

  console.log(`Enviando ${allPoints.length} pontos para o Qdrant em lotes...`);
  const BATCH_SIZE = 50;
  for (let i = 0; i < allPoints.length; i += BATCH_SIZE) {
    const batch = allPoints.slice(i, i + BATCH_SIZE);
    await upsertPoints(batch);
    console.log(`  Lote ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allPoints.length / BATCH_SIZE)} inserido com sucesso.`);
  }

  console.log("\n=== INGESTÃO FINALIZADA COM SUCESSO! ===");
  console.log(`Total de chunks de alta precisão indexados: ${allPoints.length}`);
  console.log(`Coleção ativa no Qdrant: ${COLLECTION_NAME}`);
}

runIngestion().catch((err) => {
  console.error("Erro fatal durante a ingestão:", err);
  process.exit(1);
});
