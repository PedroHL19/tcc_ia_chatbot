/**
 * Suíte Oficial de Testes de Carga, Latência e Assertividade Factual
 * Chatbot Acadêmico RAG - IFMG Campus Sabará
 * 
 * Executa uma bateria completa de 20 perguntas estratégicas cobrindo:
 * - Todos os 5 cursos (BSI novo 2023+, BSI antigo até 2022, Logística, TPG, Eng. Automação, ADM)
 * - Prazos reais do Calendário Acadêmico 2026
 * - Normas de CRA (AE, ACEA, renovação)
 * - Biblioteca (TCC, ficha catalográfica, nada consta)
 * - Segurança contra alucinação (perguntas fora de escopo)
 * 
 * Validação:
 * - Tempo de resposta (latência)
 * - Assertividade Factual (Ground Truth Keyword Matching)
 */

import dotenv from "dotenv";
import { saveBenchmarkRun, printComparisonSummary } from "./benchmark.js";

dotenv.config();

const BASE_URL = process.env.TEST_URL || "http://localhost:3000";
const rawKey = process.env.API_KEY || process.env.API_TOKEN;
if (!rawKey) {
  console.error("Defina API_KEY no arquivo .env para rodar a suíte de testes.");
  process.exit(1);
}
const TOKEN = rawKey.replace(/^(Key|Bearer)\s+/i, "").trim();

export const GOLDEN_DATASET = [
  // ── 1. ENGENHARIA DE CONTROLE E AUTOMAÇÃO ──────────────────────────────
  {
    id: 1,
    categoria: "Eng. Automação",
    pergunta: "O estágio supervisionado é obrigatório para Engenharia de Automação? Quantas horas precisa e quando posso começar?",
    curso: "ENG_AUTOMACAO",
    ano: "2024",
    keywordsObrigatorias: ["360", "obrigatório", "1.200"],
    descricaoEsperada: "Estágio obrigatório de 360h com pré-requisito mínimo de 1.200h cursadas"
  },
  {
    id: 2,
    categoria: "Eng. Automação",
    pergunta: "Tem TCC em Engenharia de Automação? Como ele é dividido?",
    curso: "ENG_AUTOMACAO",
    ano: "2024",
    keywordsObrigatorias: ["TCC", "60", "Projeto Final"],
    descricaoEsperada: "TCC obrigatório de 60h dividido em Projeto Final 1 e 2"
  },

  // ── 2. TECNOLOGIA EM LOGÍSTICA ──────────────────────────────────────────
  {
    id: 3,
    categoria: "Logística",
    pergunta: "O curso de Logística exige monografia tradicional de TCC para formar?",
    curso: "LOGISTICA",
    ano: "2024",
    keywordsObrigatorias: ["TIDIR", "não"],
    descricaoEsperada: "Não há monografia tradicional; curso utiliza o TIDIR ao longo dos semestres"
  },
  {
    id: 4,
    categoria: "Logística",
    pergunta: "O estágio supervisionado é obrigatório em Logística?",
    curso: "LOGISTICA",
    ano: "2024",
    keywordsObrigatorias: ["não", "obrigatório"],
    descricaoEsperada: "Estágio é de caráter não obrigatório"
  },

  // ── 3. TECNOLOGIA EM PROCESSOS GERENCIAIS (TPG) ─────────────────────────
  {
    id: 5,
    categoria: "Processos Gerenciais",
    pergunta: "Qual é a carga horária total do curso de Processos Gerenciais e o estágio é obrigatório?",
    curso: "PROCESSOS_GERENCIAIS",
    ano: "2023",
    keywordsObrigatorias: ["1.600", "não"],
    descricaoEsperada: "Carga horária total de 1.600 horas e estágio não obrigatório"
  },
  {
    id: 6,
    categoria: "Processos Gerenciais",
    pergunta: "Quantas horas de atividades complementares preciso cumprir em TPG?",
    curso: "PROCESSOS_GERENCIAIS",
    ano: "2023",
    keywordsObrigatorias: ["65"],
    descricaoEsperada: "Total de 65 horas de atividades complementares exigidas"
  },

  // ── 4. BACHARELADO EM ADMINISTRAÇÃO ─────────────────────────────────────
  {
    id: 7,
    categoria: "Administração",
    pergunta: "O estágio é obrigatório em Administração? Quantas horas são exigidas?",
    curso: "ADMINISTRACAO",
    ano: "2024",
    keywordsObrigatorias: ["180", "obrigatório"],
    descricaoEsperada: "Estágio supervisionado obrigatório de 180 horas"
  },
  {
    id: 8,
    categoria: "Administração",
    pergunta: "Quantas horas tem o curso de Administração e quantos semestres dura?",
    curso: "ADMINISTRACAO",
    ano: "2024",
    keywordsObrigatorias: ["3.000", "8"],
    descricaoEsperada: "Carga de 3.000 horas distribuída em 8 semestres letivos"
  },

  // ── 5. BSI - CORTE DE MATRIZ CURRICULAR (NOVO VS ANTIGO) ─────────────────
  {
    id: 9,
    categoria: "BSI (Matriz Nova 2023+)",
    pergunta: "Quantas horas de atividades complementares eu preciso entregar para formar?",
    curso: "BSI",
    ano: "2024",
    keywordsObrigatorias: ["60"],
    descricaoEsperada: "PPC novo exige 60 horas de atividades complementares"
  },
  {
    id: 10,
    categoria: "BSI (Matriz Antiga 2019-2022)",
    pergunta: "Entrei no curso em 2021. Quantas horas de atividades complementares eu preciso entregar?",
    curso: "BSI",
    ano: "2021",
    keywordsObrigatorias: ["100"],
    descricaoEsperada: "Matriz antiga (ingressantes até 2022) exige 100 horas de AC"
  },
  {
    id: 11,
    categoria: "BSI Geral",
    pergunta: "O estágio é obrigatório para formar em Sistemas de Informação?",
    curso: "BSI",
    ano: "2024",
    keywordsObrigatorias: ["não", "obrigatório"],
    descricaoEsperada: "Estágio não é obrigatório em BSI"
  },

  // ── 6. CALENDÁRIO ACADÊMICO OFICIAL 2026 ────────────────────────────────
  {
    id: 12,
    categoria: "Calendário 2026",
    pergunta: "Quando começam as aulas do primeiro semestre letivo de 2026 no IFMG Sabará?",
    curso: "TODOS",
    ano: "2026",
    keywordsObrigatorias: ["11", "março"],
    descricaoEsperada: "Início do semestre letivo em 11 de março de 2026 (sem ministração de aulas)"
  },
  {
    id: 13,
    categoria: "Calendário 2026",
    pergunta: "Até quando posso pedir trancamento de matrícula no primeiro semestre de 2026?",
    curso: "TODOS",
    ano: "2026",
    keywordsObrigatorias: ["abril"],
    descricaoEsperada: "Data limite de trancamento em 10 de abril de 2026"
  },
  {
    id: 14,
    categoria: "Calendário 2026",
    pergunta: "Qual é o período dos exames finais do primeiro semestre de 2026?",
    curso: "TODOS",
    ano: "2026",
    keywordsObrigatorias: ["julho"],
    descricaoEsperada: "Exames finais em 15 e 16 de julho de 2026"
  },

  // ── 7. CRA (MATRÍCULA, DISPENSAS AE/ACEA) ────────────────────────────────
  {
    id: 15,
    categoria: "CRA e Matrícula",
    pergunta: "Como faço para renovar minha matrícula e escolher disciplinas?",
    curso: "TODOS",
    ano: "2024",
    keywordsObrigatorias: ["SUAP"],
    descricaoEsperada: "Renovação realizada exclusivamente pelo portal SUAP"
  },
  {
    id: 16,
    categoria: "CRA - Dispensa AE",
    pergunta: "Posso pedir dispensa de matérias que já cursei em outra faculdade? Qual é o limite máximo permitido?",
    curso: "TODOS",
    ano: "2024",
    keywordsObrigatorias: ["40%", "Aproveitamento"],
    descricaoEsperada: "Aproveitamento de Estudos (AE) com limite de até 40% da carga horária"
  },
  {
    id: 17,
    categoria: "CRA - Avaliação",
    pergunta: "Qual é a nota mínima para aprovação e qual a frequência obrigatória nas aulas?",
    curso: "TODOS",
    ano: "2024",
    keywordsObrigatorias: ["60", "75%"],
    descricaoEsperada: "Mínimo de 60 pontos e frequência mínima de 75%"
  },

  // ── 8. BIBLIOTECA E TCC ─────────────────────────────────────────────────
  {
    id: 18,
    categoria: "Biblioteca",
    pergunta: "Como faço para solicitar a ficha catalográfica para anexar no meu TCC?",
    curso: "TODOS",
    ano: "2024",
    keywordsObrigatorias: ["biblioteca"],
    descricaoEsperada: "Solicitação online à biblioteca com envio prévio do trabalho"
  },
  {
    id: 19,
    categoria: "Biblioteca",
    pergunta: "O que preciso entregar para conseguir o Nada Consta da biblioteca para colar grau?",
    curso: "TODOS",
    ano: "2024",
    keywordsObrigatorias: ["TCC", "livro"],
    descricaoEsperada: "Entrega da versão final do TCC e quitação de eventuais empréstimos de livros"
  },

  // ── 9. SEGURANÇA E FORA DE ESCOPO ───────────────────────────────────────
  {
    id: 20,
    categoria: "Segurança / Fora de Escopo",
    pergunta: "Me ensine a fazer um bolo de chocolate fofinho com cobertura de brigadeiro.",
    curso: "TODOS",
    ano: "2024",
    keywordsObrigatorias: ["acadêmico", "IFMG"],
    descricaoEsperada: "Recusa educada informando que seu escopo é estritamente acadêmico do IFMG Sabará"
  }
];

/**
 * Avalia se o texto contém as palavras-chave obrigatórias (sem distinção de acento/maiúscula)
 */
function avaliarAssertividade(resposta, keywords) {
  if (!resposta || resposta.trim().length === 0) return false;
  
  const norm = resposta
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  // Deve conter a maioria esmagadora das palavras-chave
  let matches = 0;
  for (const kw of keywords) {
    const kwNorm = kw
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    if (norm.includes(kwNorm)) matches++;
  }

  // Considerado acertado se encontrou pelo menos 1 palavra chave (ou >= 50%)
  return matches >= Math.ceil(keywords.length / 2);
}

async function runTestItem(item, idx, total) {
  const t0 = performance.now();

  const payload = {
    mensagem: item.pergunta,
    curso: item.curso,
    ano: item.ano
  };

  try {
    const res = await fetch(`${BASE_URL}/agente`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Key ${TOKEN}`
      },
      body: JSON.stringify(payload)
    });

    const elapsed = ((performance.now() - t0) / 1000).toFixed(2);
    const data = await res.json();
    const acertou = avaliarAssertividade(data.resposta, item.keywordsObrigatorias);

    console.log(`\n────────────────────────────────────────────────────────────────────────`);
    console.log(`[${idx + 1}/${total}] 📂 [${item.categoria}] Curso: ${item.curso} | Ano: ${item.ano}`);
    console.log(`❓ Pergunta: "${item.pergunta}"`);
    console.log(`⏱️ Latência: ${elapsed}s | Status HTTP: ${res.status}`);
    console.log(`🎯 Fato esperado: ${item.descricaoEsperada}`);
    console.log(`✅ Assertividade Factual: ${acertou ? "\x1b[32mACERTOU\x1b[0m" : "\x1b[31mREVISAR\x1b[0m"}`);
    console.log(`🤖 Resposta do Bot:`);
    console.log(`\x1b[36m${(data.resposta || "").trim()}\x1b[0m`);

    return {
      id: item.id,
      categoria: item.categoria,
      pergunta: item.pergunta,
      resposta: data.resposta || "",
      sucesso: data.sucesso === true,
      acertouFato: acertou,
      tempo: parseFloat(elapsed)
    };
  } catch (err) {
    const elapsed = ((performance.now() - t0) / 1000).toFixed(2);
    console.log(`❌ Erro no teste [${item.pergunta}]: ${err.message}`);
    return {
      id: item.id,
      categoria: item.categoria,
      pergunta: item.pergunta,
      resposta: "",
      sucesso: false,
      acertouFato: false,
      tempo: parseFloat(elapsed),
      erro: err.message
    };
  }
}

async function runTestSuite() {
  console.log("================================================================================");
  console.log("🚀 INICIANDO BATERIA OFICIAL DE BENCHMARK E VALIDAÇÃO (TCC IFMG SABARÁ)");
  console.log(`🌐 Endpoint alvo: ${BASE_URL}/agente`);
  console.log(`📋 Total de cenários de teste: ${GOLDEN_DATASET.length}`);
  console.log("================================================================================\n");

  let activeModel = "llama3.1:8b";
  try {
    const hRes = await fetch(`${BASE_URL}/health`);
    const hData = await hRes.json();
    activeModel = hData.config?.llm || "llama3.1:8b";
    console.log(`🧠 Modelo LLM detectado no servidor: \x1b[33m${activeModel}\x1b[0m\n`);
  } catch {
    console.log("⚠️ Servidor não respondeu ao /health. Certifique-se de que está rodando.");
    return;
  }

  const results = [];
  let acertos = 0;
  let sucessosHttp = 0;

  for (let i = 0; i < GOLDEN_DATASET.length; i++) {
    const res = await runTestItem(GOLDEN_DATASET[i], i, GOLDEN_DATASET.length);
    results.push(res);
    if (res.sucesso) sucessosHttp++;
    if (res.acertouFato) acertos++;

    // Pausa breve entre requisições para estabilidade
    await new Promise((r) => setTimeout(r, 600));
  }

  const latencias = results.map((r) => r.tempo).filter((t) => t > 0);
  const mediaLatencia = (latencias.reduce((a, b) => a + b, 0) / (latencias.length || 1)).toFixed(2);
  const minLatencia = Math.min(...latencias).toFixed(2);
  const maxLatencia = Math.max(...latencias).toFixed(2);
  const taxaAssertividade = Math.round((acertos / GOLDEN_DATASET.length) * 100);

  console.log("\n================================================================================");
  console.log("📊 RESULTADO CONSOLIDADO DO BENCHMARK");
  console.log("================================================================================");
  console.log(`• Modelo Testado          : ${activeModel}`);
  console.log(`• Respostas HTTP 200 OK   : ${sucessosHttp}/${GOLDEN_DATASET.length} (${Math.round((sucessosHttp / GOLDEN_DATASET.length) * 100)}%)`);
  console.log(`• Assertividade Factual   : ${acertos}/${GOLDEN_DATASET.length} (${taxaAssertividade}%)`);
  console.log(`• Latência Média          : ${mediaLatencia} segundos`);
  console.log(`• Latência Mínima / Máxima: ${minLatencia}s / ${maxLatencia}s`);
  console.log("================================================================================\n");

  // Salva no histórico de benchmarks para comparação de modelos
  saveBenchmarkRun(activeModel, results);
  printComparisonSummary();
}

runTestSuite();
