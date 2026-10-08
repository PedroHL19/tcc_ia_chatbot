/**
 * Script de Testes Automatizados da API RAG do Chatbot
 * Endpoint: POST /agente (compatível com ngrok ou local)
 * 
 * Uso:
 *   node test_suite.js               (roda contra http://localhost:3000)
 *   node test_suite.js --ngrok       (roda contra a URL pública do ngrok)
 *   node test_suite.js --health      (apenas checa a saúde da API)
 */

const NGROK_URL = "https://pokiest-glossless-oakley.ngrok-free.dev";
const LOCAL_URL = "http://localhost:3000";

// Detecta se passa flag --ngrok ou usa LOCAL por padrão
const isNgrok = process.argv.includes("--ngrok");
const BASE_URL = isNgrok ? NGROK_URL : LOCAL_URL;
const TOKEN = process.env.API_TOKEN || "REMOVIDO";

// Bateria de Perguntas de Teste categorizadas
const TEST_CASES = [
  {
    categoria: "1. CRA e Matrícula",
    pergunta: "Como faço para renovar minha matrícula no SUAP e escolher disciplinas?",
    esperado: "Menção ao SUAP, etapas de renovação/ajuste e envio de tutoriais ou e-mail do CRA"
  },
  {
    categoria: "1. CRA e Calendário",
    pergunta: "Onde vejo o calendário acadêmico com as datas de 2026?",
    esperado: "Envio do link oficial do calendário acadêmico no site do IFMG"
  },
  {
    categoria: "2. Dispensa de Matérias (AE)",
    pergunta: "Posso pedir dispensa de matérias feitas em outra faculdade? Qual é o limite de horas?",
    esperado: "Explicar Aproveitamento de Estudos (AE) e limite máximo de 40% da carga horária"
  },
  {
    categoria: "2. Dispensa de Matérias (ACEA)",
    pergunta: "Fui reprovado em uma matéria, mas já integralizei mais de 80% do curso. Posso tentar ACEA nela?",
    esperado: "Confirmar a exceção de 80% ou mais da carga horária para discentes reprovados"
  },
  {
    categoria: "3. Atividades Complementares (BSI)",
    pergunta: "Quantas horas de atividades complementares preciso para formar em BSI?",
    esperado: "Informar a obrigatoriedade de 60 horas no total"
  },
  {
    categoria: "3. Atividades Complementares (Cursos)",
    pergunta: "Fiz um curso online com certificado de 20 horas. Quantas horas de AC eu ganho?",
    esperado: "Cálculo de 20% da carga horária (4 horas de AC)"
  },
  {
    categoria: "4. Avaliação e Frequência",
    pergunta: "Qual é a média e a presença mínima para ser aprovado em uma disciplina?",
    esperado: "Mínimo de 60 pontos (60%) e frequência mínima de 75%"
  },
  {
    categoria: "4. Segunda Chamada",
    pergunta: "Faltei na prova por motivo de doença. Qual o prazo para pedir segunda chamada?",
    esperado: "Prazo de até 2 dias úteis com atestado médico/justificativa"
  },
  {
    categoria: "5. Estágio",
    pergunta: "Consegui um estágio, com quantos dias de antecedência preciso preencher a Ficha Cadastral?",
    esperado: "Mínimo de 7 dias úteis e menção ao e-mail estagio.sabara@ifmg.edu.br"
  },
  {
    categoria: "6. PPC e Matriz com Perfil (BSI 2023)",
    pergunta: "Quais disciplinas tenho no 1º período do curso?",
    curso: "BSI",
    ano: "2023",
    esperado: "Programação I, Fundamentos de SI, Matemática Discreta, Fundamentos de Matemática, Fundamentos de Administração, Metodologia de Pesquisa"
  },
  {
    categoria: "7. Fora de Escopo / Segurança",
    pergunta: "Qual a receita para fazer um bolo de chocolate fofinho?",
    esperado: "Recusa educada informando que só atende dúvidas acadêmicas do IFMG Sabará"
  }
];

async function checkHealth() {
  console.log(`\n🔍 Verificando saúde da API em: ${BASE_URL}/health`);
  try {
    const res = await fetch(`${BASE_URL}/health`);
    const data = await res.json();
    console.log("✅ API está ONLINE!");
    console.log("Configurações ativas:", JSON.stringify(data.config || data, null, 2));
    return true;
  } catch (err) {
    console.error(`❌ Não foi possível conectar a ${BASE_URL}/health: ${err.message}`);
    console.error("Dica: verifique se o servidor Node e o ngrok estão rodando.");
    return false;
  }
}

async function runSingleTest(test, index, total) {
  const url = `${BASE_URL}/agente`;
  const t0 = performance.now();

  try {
    const payload = {
      mensagem: test.pergunta,
      ...(test.curso ? { curso: test.curso } : {}),
      ...(test.ano ? { ano: test.ano } : {})
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Key ${TOKEN}`
      },
      body: JSON.stringify(payload)
    });

    const elapsed = ((performance.now() - t0) / 1000).toFixed(2);
    const status = res.status;
    const body = await res.json();

    console.log(`\n--------------------------------------------------------------------------------`);
    console.log(`[${index + 1}/${total}] 📂 Categoria: ${test.categoria}`);
    console.log(`❓ Pergunta: "${test.pergunta}"`);
    console.log(`⏱️ Tempo: ${elapsed}s | HTTP Status: ${status}`);
    console.log(`🎯 Esperado: ${test.esperado}`);
    console.log(`🤖 Resposta do Agente:`);
    console.log(`\x1b[36m${body.resposta || JSON.stringify(body)}\x1b[0m`);
    
    return { 
      categoria: test.categoria,
      pergunta: test.pergunta,
      resposta: body.resposta || "",
      sucesso: body.sucesso === true, 
      tempo: elapsed 
    };
  } catch (err) {
    console.log(`❌ Erro no teste [${test.pergunta}]: ${err.message}`);
    return { 
      categoria: test.categoria,
      pergunta: test.pergunta,
      resposta: "",
      sucesso: false, 
      erro: err.message,
      tempo: "0.00"
    };
  }
}

async function main() {
  console.log("================================================================================");
  console.log("🚀 SUÍTE DE TESTES E BENCHMARK - AGENTE RAG IFMG SABARÁ");
  console.log(`🌐 Alvo: ${BASE_URL}`);
  console.log(`🔑 Token utilizado: Key ${TOKEN.substring(0, 10)}...`);
  console.log("================================================================================");

  let activeModel = "desconhecido";
  try {
    const hRes = await fetch(`${BASE_URL}/health`);
    const hData = await hRes.json();
    activeModel = hData.config?.llm || process.env.LLM_MODEL || "modelo_padrao";
    console.log(`🧠 Modelo detectado: \x1b[33m${activeModel}\x1b[0m`);
  } catch {
    console.log("⚠️ Não foi possível obter o modelo via /health.");
  }

  const isHealthy = await checkHealth();
  if (process.argv.includes("--health")) return;

  if (process.argv.includes("--comparar")) {
    const { printComparisonSummary } = await import("./benchmark.js");
    printComparisonSummary();
    return;
  }

  if (!isHealthy) {
    console.log("\n⚠️ Abortando bateria de testes pois a API não respondeu.");
    return;
  }

  console.log(`\nIniciando execução de ${TEST_CASES.length} cenários de teste...\n`);

  const runResults = [];
  let sucessos = 0;

  for (let i = 0; i < TEST_CASES.length; i++) {
    const res = await runSingleTest(TEST_CASES[i], i, TEST_CASES.length);
    runResults.push(res);
    if (res.sucesso) sucessos++;
    await new Promise((r) => setTimeout(r, 1000));
  }

  const { saveBenchmarkRun, printComparisonSummary } = await import("./benchmark.js");
  const meta = saveBenchmarkRun(activeModel, runResults);

  console.log(`\n================================================================================`);
  console.log(`📊 RESULTADO DA RODADA - MODELO: ${activeModel}`);
  console.log(`• Sucessos: ${sucessos}/${TEST_CASES.length}`);
  console.log(`• Latência média: ${meta.avgLatency}s por resposta`);
  console.log(`• Registrado em: benchmark_runs.json`);
  console.log("================================================================================");

  printComparisonSummary();
}

main();
