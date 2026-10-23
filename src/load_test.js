/**
 * Teste de carga — simula vários usuários perguntando ao mesmo tempo
 * Chatbot Acadêmico RAG - IFMG Campus Sabará
 *
 * Uso:
 *   npm run test:carga              (5 usuários simultâneos)
 *   npm run test:carga -- 10        (10 usuários simultâneos)
 *   npm run test:carga -- 10 2      (10 usuários, 2 rodadas)
 *
 * Mede o tempo de cada resposta e quantas passariam do limite de espera
 * (LOAD_TIMEOUT_S no .env, padrão 30s — ajuste para o timeout configurado no Blip).
 */

import dotenv from "dotenv";
import os from "os";

dotenv.config();

const BASE_URL = process.env.TEST_URL || "http://localhost:3000";
const rawKey = process.env.API_KEY || process.env.API_TOKEN;
if (!rawKey) {
  console.error("Defina API_KEY no arquivo .env para rodar o teste de carga.");
  process.exit(1);
}
const TOKEN = rawKey.replace(/^(Key|Bearer)\s+/i, "").trim();

const USUARIOS = parseInt(process.argv[2], 10) || 5;
const RODADAS = parseInt(process.argv[3], 10) || 1;
const TIMEOUT_S = parseFloat(process.env.LOAD_TIMEOUT_S) || 30;

// Perguntas variadas para não favorecer cache e cobrir perfis diferentes
const PERGUNTAS = [
  { mensagem: "Como faço para trancar a matrícula?", curso: "BSI", ano: "2023" },
  { mensagem: "Quantas horas de atividades complementares preciso?", curso: "BSI", ano: "2021" },
  { mensagem: "Quais documentos preciso para começar o estágio?", curso: "LOGISTICA", ano: "2024" },
  { mensagem: "Como peço a ficha catalográfica do meu TCC?", curso: "ADMINISTRACAO", ano: "2022" },
  { mensagem: "Qual o prazo para pedir segunda chamada de prova?", curso: "ENG_AUTOMACAO", ano: "2025" },
  { mensagem: "Como funciona o aproveitamento de estudos?", curso: "PROCESSOS_GERENCIAIS", ano: "2020" },
  { mensagem: "Quando é a renovação de matrícula?", curso: "BSI", ano: "2026" },
  { mensagem: "Como acesso a Biblioteca Virtual Pearson?", curso: "TODOS", ano: "TODOS" },
  { mensagem: "O estágio é obrigatório no meu curso?", curso: "ENG_AUTOMACAO", ano: "2019" },
  { mensagem: "Como solicito a segunda via do diploma?", curso: "ADMINISTRACAO", ano: "2018" }
];

async function perguntar(idx) {
  const p = PERGUNTAS[idx % PERGUNTAS.length];
  const inicio = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/agente`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Key ${TOKEN}` },
      body: JSON.stringify(p)
    });
    await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, segundos: (Date.now() - inicio) / 1000 };
  } catch (err) {
    return { ok: false, status: "erro", segundos: (Date.now() - inicio) / 1000, erro: err.message };
  }
}

function resumo(resultados) {
  const tempos = resultados.map((r) => r.segundos).sort((a, b) => a - b);
  const media = tempos.reduce((s, t) => s + t, 0) / tempos.length;
  const mediana = tempos[Math.floor(tempos.length / 2)];
  return {
    ok: resultados.filter((r) => r.ok).length,
    falhas: resultados.filter((r) => !r.ok).length,
    acimaTimeout: resultados.filter((r) => r.segundos > TIMEOUT_S).length,
    min: tempos[0],
    mediana,
    media,
    max: tempos[tempos.length - 1]
  };
}

async function main() {
  console.log("=== TESTE DE CARGA — CHATBOT IFMG SABARÁ ===");
  console.log(`Máquina   : ${os.hostname()} | ${os.cpus()[0]?.model?.trim()} | ${Math.round(os.totalmem() / 1024 ** 3)} GB RAM`);
  console.log(`API       : ${BASE_URL}`);
  console.log(`Usuários  : ${USUARIOS} simultâneos x ${RODADAS} rodada(s) | limite de espera: ${TIMEOUT_S}s\n`);

  try {
    const h = await fetch(`${BASE_URL}/health`).then((r) => r.json());
    console.log(`Modelo LLM: ${h.config?.llm} | Embeddings: ${h.config?.embeddings}\n`);
  } catch {
    console.error("API não respondeu em /health. Suba o servidor com npm start.");
    process.exit(1);
  }

  // Aquecimento: a primeira chamada carrega os modelos na memória (cold start) e não entra na média
  process.stdout.write("Aquecendo modelos (cold start)... ");
  const aquecimento = await perguntar(0);
  console.log(`${aquecimento.segundos.toFixed(1)}s\n`);

  const todos = [];
  for (let r = 1; r <= RODADAS; r++) {
    const resultados = await Promise.all(
      Array.from({ length: USUARIOS }, (_, i) => perguntar(i + (r - 1) * USUARIOS))
    );
    resultados
      .map((res, i) => ({ ...res, i }))
      .sort((a, b) => a.segundos - b.segundos)
      .forEach((res) => {
        const flag = !res.ok ? `FALHA (${res.status}${res.erro ? ": " + res.erro : ""})` : res.segundos > TIMEOUT_S ? "ACIMA DO LIMITE" : "ok";
        console.log(`  Rodada ${r} | usuário ${String(res.i + 1).padStart(2)} | ${res.segundos.toFixed(1).padStart(6)}s | ${flag}`);
      });
    todos.push(...resultados);
    console.log("");
  }

  const s = resumo(todos);
  console.log("=== RESUMO ===");
  console.log(`Respostas ok        : ${s.ok}/${todos.length}`);
  console.log(`Falhas              : ${s.falhas}`);
  console.log(`Acima de ${TIMEOUT_S}s       : ${s.acimaTimeout}`);
  console.log(`Tempo (s) min/med/máx: ${s.min.toFixed(1)} / ${s.mediana.toFixed(1)} / ${s.max.toFixed(1)} (média ${s.media.toFixed(1)})`);
  console.log(`Cold start          : ${aquecimento.segundos.toFixed(1)}s`);
}

main();
