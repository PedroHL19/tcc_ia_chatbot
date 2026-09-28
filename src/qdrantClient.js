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
 * @param {number[]} queryVector 
 * @param {number} limit 
 * @returns {Promise<Array<{id: string | number, score: number, payload: object}>>}
 */
export async function searchSimilar(queryVector, limit = 5) {
  const response = await qdrant.query(COLLECTION_NAME, {
    query: queryVector,
    limit,
    with_payload: true
  });
  return response.points || [];
}
