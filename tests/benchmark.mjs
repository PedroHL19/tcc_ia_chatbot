// Benchmark do bot em uma máquina: qualidade (as 98 perguntas do orientador, uma por vez) e carga
// (5, 10, 20 e 40 perguntas simultâneas). Os resultados vão para tests/resultados/ e o relatório comparando
// as máquinas sai com tests/relatorio_benchmark.mjs.
//
// Uso: node tests/benchmark.mjs <rotulo> [url] [modo]
//   rotulo: nome da máquina nos arquivos (ex.: pc, notebook)
//   url:    padrão http://localhost:3000/agente
//   modo:   tudo (padrão) | qualidade | carga
// Variáveis opcionais: CURSO (padrão BSI), ANO (padrão 2025), NIVEIS (padrão "5,10,20,40")
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const [, , rotulo, url = "http://localhost:3000/agente", modo = "tudo"] = process.argv;
if (!rotulo || !["tudo", "qualidade", "carga"].includes(modo)) {
  console.error("Uso: node tests/benchmark.mjs <rotulo> [url] [tudo|qualidade|carga]");
  process.exit(1);
}
const env = fs.readFileSync(path.join(DIR, "..", ".env"), "utf8");
const key = env.match(/^(?:API_KEY|API_TOKEN)=(.*)$/m)[1].trim().replace(/^"|"$/g, "");
const CURSO = process.env.CURSO || "BSI";
const ANO = process.env.ANO || "2025";
const NIVEIS = (process.env.NIVEIS || "5,10,20,40").split(",").map(Number);
const SAIDA = path.join(DIR, "resultados");
fs.mkdirSync(SAIDA, { recursive: true });

// CSV do orientador (separador ";", campos com aspas)
function lerCsv(arquivo) {
  const t = fs.readFileSync(arquivo, "utf8").replace(/^﻿/, "");
  const linhas = [];
  let linha = [], campo = "", aspas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c === '"' && t[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ";") { linha.push(campo); campo = ""; }
    else if (c === "\n") { linha.push(campo.replace(/\r$/, "")); linhas.push(linha); linha = []; campo = ""; }
    else campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  const [cab, ...dados] = linhas.filter((l) => l.length > 1);
  return { cab, dados: dados.map((l) => Object.fromEntries(cab.map((k, i) => [k, l[i] ?? ""]))) };
}
const celula = (v) => /[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);

async function perguntar(mensagem) {
  const inicio = Date.now();
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Key ${key}`, "ngrok-skip-browser-warning": "1" },
      body: JSON.stringify({ mensagem, curso: CURSO, ano: ANO }),
      signal: AbortSignal.timeout(300000)
    });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok && j.sucesso !== false, status: r.status, s: (Date.now() - inicio) / 1000, fora: j.fora_de_escopo, resposta: j.resposta ?? j.erro ?? `(HTTP ${r.status})` };
  } catch (e) {
    return { ok: false, status: 0, s: (Date.now() - inicio) / 1000, fora: null, resposta: `ERRO: ${e.message}` };
  }
}

const { cab, dados } = lerCsv(path.join(DIR, "perguntas_orientador.csv"));
const info = { rotulo, url, curso: CURSO, ano: ANO, inicio: new Date().toISOString() };
console.log(`Benchmark "${rotulo}" em ${url} (perfil ${CURSO}/${ANO}), modo ${modo}`);

// Aquecimento: a primeira chamada carrega os modelos na memória e não deve contar no tempo
process.stdout.write("Aquecendo... ");
console.log(`${(await perguntar("Como renovo um livro?")).s.toFixed(1)}s`);

if (modo !== "carga") {
  console.log(`\n== Qualidade: ${dados.length} perguntas, uma por vez ==`);
  const resultados = [];
  for (const p of dados) {
    const r = await perguntar(p.pergunta);
    resultados.push({ id: p.id, categoria: p.categoria, pergunta: p.pergunta, ...r });
    console.log(`${p.id} ${r.s.toFixed(1)}s ${r.ok ? "" : "FALHOU "}| ${p.pergunta.slice(0, 60)}`);
  }
  // CSV no formato do orientador, com a resposta nova e as colunas de nota em branco para avaliar
  const colunas = [...cab.filter((k) => k !== "status"), "tempo_s", "fora_de_escopo"];
  const linhas = dados.map((p, i) => colunas.map((k) => celula(
    k === "resposta_bot" ? resultados[i].resposta
    : k === "tempo_s" ? resultados[i].s.toFixed(2).replace(".", ",")
    : k === "fora_de_escopo" ? resultados[i].fora
    : k === "nota_0_a_2" || k === "observacoes_avaliador" ? ""
    : p[k])).join(";"));
  fs.writeFileSync(path.join(SAIDA, `${rotulo}_qualidade.csv`), "﻿" + [colunas.join(";"), ...linhas].join("\n"));
  fs.writeFileSync(path.join(SAIDA, `${rotulo}_qualidade.json`), JSON.stringify({ ...info, resultados }, null, 2));
}

if (modo !== "qualidade") {
  // Só perguntas que passam pela busca e pelo modelo (as categorias dos setores): as respostas prontas
  // (saudação, calendário) levam milissegundos e não medem a carga
  const pool = dados.filter((p) => ["Estágio", "Biblioteca", "Registro Acadêmico", "Identificação do setor"].includes(p.categoria));
  const niveis = [];
  let proxima = 0;
  for (const n of NIVEIS) {
    console.log(`\n== Carga: ${n} perguntas simultâneas ==`);
    const lote = Array.from({ length: n }, () => pool[proxima++ % pool.length]);
    const inicio = Date.now();
    const respostas = await Promise.all(lote.map(async (p) => ({ id: p.id, pergunta: p.pergunta, ...(await perguntar(p.pergunta)) })));
    const totalS = (Date.now() - inicio) / 1000;
    const ok = respostas.filter((r) => r.ok).length;
    console.log(`${ok}/${n} ok em ${totalS.toFixed(1)}s | mais lenta ${Math.max(...respostas.map((r) => r.s)).toFixed(1)}s`);
    niveis.push({ simultaneas: n, totalS, respostas: respostas.map(({ resposta, ...r }) => ({ ...r, resposta: resposta.slice(0, 200) })) });
    await new Promise((r) => setTimeout(r, 5000)); // pausa entre níveis para o servidor esvaziar a fila
  }
  fs.writeFileSync(path.join(SAIDA, `${rotulo}_carga.json`), JSON.stringify({ ...info, niveis }, null, 2));
}
console.log(`\nResultados em tests/resultados/${rotulo}_*`);
