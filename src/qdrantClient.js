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

  // Cria índices de payload para curso e ano para acelerar filtros
  try {
    await qdrant.createPayloadIndex(COLLECTION_NAME, {
      field_name: "curso",
      field_schema: "keyword"
    });
    await qdrant.createPayloadIndex(COLLECTION_NAME, {
      field_name: "ano",
      field_schema: "keyword"
    });
  } catch (err) {
    // Índices podem já existir ou coleção recém-criada
  }
}

/**
 * Constrói filtro Qdrant compatível para Curso e Ano
 * Permite buscar documentos do curso específico OU documentos gerais/comuns (TODOS).
 * Se nenhum filtro for passado, retorna null (busca tudo).
 * @param {string} [curso] 
 * @param {string|number} [ano] 
 * @returns {object|null}
 */
export function buildCourseYearFilter(curso, ano) {
  const must = [];

  if (curso && String(curso).trim().length > 0) {
    const cursoFormatado = String(curso).trim().toUpperCase();
    must.push({
      should: [
        { key: "curso", match: { value: cursoFormatado } },
        { key: "curso", match: { value: "TODOS" } },
        { key: "curso", match: { value: "GERAL" } },
        { is_empty: { key: "curso" } }
      ]
    });
  }

  if (ano && String(ano).trim().length > 0) {
    const anoFormatado = String(ano).trim();
    must.push({
      should: [
        { key: "ano", match: { value: anoFormatado } },
        { key: "ano", match: { value: "TODOS" } },
        { key: "ano", match: { value: "GERAL" } },
        { is_empty: { key: "ano" } }
      ]
    });
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
