import { QdrantClient } from "@qdrant/js-client-rest";
import dotenv from "dotenv";

dotenv.config();

const url = process.env.QDRANT_URL || "http://localhost:6333";
const apiKey = process.env.QDRANT_API_KEY || undefined;

export const qdrant = new QdrantClient({ 
  url, 
  apiKey,
  checkCompatibility: false 
});

export const COLLECTION_NAME = process.env.QDRANT_COLLECTION || "ifmg_estagios";
export const VECTOR_SIZE = 1024; // Dimensão do modelo BGE-M3

/**
 * Garante que a coleção existe no Qdrant com a configuração de 1024 dimensões e similaridade de Cosseno
 */
export async function ensureCollection() {
  const result = await qdrant.getCollections();
  const exists = result.collections.some((c) => c.name === COLLECTION_NAME);

  if (!exists) {
    console.log(`Criando coleção '${COLLECTION_NAME}' no Qdrant (dimensões: ${VECTOR_SIZE}, métrica: Cosine)...`);
    await qdrant.createCollection(COLLECTION_NAME, {
      vectors: {
        size: VECTOR_SIZE,
        distance: "Cosine"
      }
    });
    console.log(`Coleção '${COLLECTION_NAME}' criada com sucesso.`);
  }

  // Cria índices de payload para acelerar filtros
  try {
    await qdrant.createPayloadIndex(COLLECTION_NAME, {
      field_name: "curso",
      field_schema: "keyword"
    });
    // ano_min e ano_max são inteiros — usados no filtro de range
    await qdrant.createPayloadIndex(COLLECTION_NAME, {
      field_name: "ano_min",
      field_schema: "integer"
    });
    await qdrant.createPayloadIndex(COLLECTION_NAME, {
      field_name: "ano_max",
      field_schema: "integer"
    });
  } catch (_) {
    // Índices já existem ou coleção recém-criada — ignorar
  }
}

/**
 * Constrói filtro Qdrant para Curso e Ano de ingresso.
 *
 * Lógica:
 *   - curso: aceita o curso exato OU "TODOS" (documentos gerais).
 *   - ano  : o ponto é retornado se anoAluno >= ano_min  E  anoAluno <= ano_max.
 *            Documentos gerais têm ano_min=0 e ano_max=9999 → sempre incluídos.
 *
 * @param {string} [curso]  - ex.: "BSI", "LOGISTICA", "TODOS"
 * @param {string|number} [ano] - ano de ingresso, ex.: "2023" ou 2023.
 *                                Passar "TODOS" ou omitir para não filtrar por ano.
 * @returns {object|null}
 */
export function buildCourseYearFilter(curso, ano) {
  const must = [];

  // ── Filtro de curso ───────────────────────────────────────────────────────
  if (curso && String(curso).trim().length > 0) {
    const cursoFmt = String(curso).trim().toUpperCase();
    if (cursoFmt !== "TODOS") {
      must.push({
        should: [
          { key: "curso", match: { value: cursoFmt } },
          { key: "curso", match: { value: "TODOS" } },
          { is_empty: { key: "curso" } }
        ]
      });
    }
    // Se cursoFmt === "TODOS" não adicionamos filtro → retorna tudo.
  }

  // ── Filtro de ano de ingresso (range numérico) ────────────────────────────
  if (ano && String(ano).trim() !== "" && String(ano).trim().toUpperCase() !== "TODOS") {
    const anoNum = parseInt(String(ano).trim(), 10);
    if (!isNaN(anoNum)) {
      // O ponto deve cobrir este ano: ano_min <= anoAluno <= ano_max
      must.push({ key: "ano_min", range: { lte: anoNum } });
      must.push({ key: "ano_max", range: { gte: anoNum } });
    }
  }

  if (must.length === 0) return null;
  return { must };
}

/**
 * Recria a coleção do zero para evitar acúmulo e duplicação de dados antigos
 */
export async function recreateCollection() {
  const result = await qdrant.getCollections();
  const exists = result.collections.some((c) => c.name === COLLECTION_NAME);

  if (exists) {
    console.log(`Limpando coleção existente '${COLLECTION_NAME}' para evitar duplicados...`);
    await qdrant.deleteCollection(COLLECTION_NAME);
    console.log(`Coleção '${COLLECTION_NAME}' removida.`);
  }

  await ensureCollection();
}

/**
 * Insere ou atualiza pontos (chunks vetorizados) no Qdrant
 * @param {Array<{id: string | number, vector: number[], payload: object}>} points
 */
export async function upsertPoints(points) {
  return await qdrant.upsert(COLLECTION_NAME, {
    wait: true,
    points
  });
}

/**
 * Busca os trechos mais similares ao vetor de consulta (Top-K = 5 por padrão)
 * Suporta filtro opcional por metadados (curso, ano, etc.)
 * @param {number[]} queryVector 
 * @param {number} limit 
 * @param {object|null} [filter]
 * @returns {Promise<Array<{id: string | number, score: number, payload: object}>>}
 */
export async function searchSimilar(queryVector, limit = 5, filter = null) {
  const queryParams = {
    query: queryVector,
    limit,
    with_payload: true
  };

  if (filter) {
    queryParams.filter = filter;
  }

  const response = await qdrant.query(COLLECTION_NAME, queryParams);
  return response.points || [];
}
