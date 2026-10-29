// Junta os resultados de tests/benchmark.mjs de todas as máquinas em tests/resultados/relatorio.md
// Uso: node tests/relatorio_benchmark.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "resultados");
const ler = (sufixo) => fs.readdirSync(DIR).filter((f) => f.endsWith(sufixo)).map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")));
const num = (v) => v.toFixed(1).replace(".", ",");
function estat(tempos) {
  const v = [...tempos].sort((a, b) => a - b);
  const q = (p) => v[Math.min(v.length - 1, Math.ceil(p * v.length) - 1)];
  return { media: v.reduce((a, b) => a + b, 0) / v.length, mediana: q(0.5), p95: q(0.95), min: v[0], max: v[v.length - 1] };
}

const md = ["# Relatório de benchmark do chatbot\n"];

const cargas = ler("_carga.json");
if (cargas.length) {
  md.push("## Teste de carga (perguntas simultâneas)\n");
  md.push("Tempo de cada resposta, em segundos, com N perguntas enviadas ao mesmo tempo. Vazão = respostas por minuto no lote.\n");
  md.push("| Máquina | Simultâneas | Sucesso | Média | Mediana | P95 | Mín | Máx | Tempo do lote | Vazão (resp/min) |");
  md.push("|---|---|---|---|---|---|---|---|---|---|");
  for (const c of cargas) for (const n of c.niveis) {
    const ok = n.respostas.filter((r) => r.ok);
    const e = ok.length ? estat(ok.map((r) => r.s)) : null;
    md.push(`| ${c.rotulo} | ${n.simultaneas} | ${ok.length}/${n.respostas.length} | ${e ? [e.media, e.mediana, e.p95, e.min, e.max].map(num).join(" | ") : "– | – | – | – | –"} | ${num(n.totalS)} | ${num(ok.length / n.totalS * 60)} |`);
  }
  md.push("");
}

const qualidades = ler("_qualidade.json");
if (qualidades.length) {
  md.push("## Perguntas do orientador (uma por vez)\n");
  md.push("| Máquina | Perguntas | Sucesso | Média (s) | Mediana (s) | P95 (s) | Máx (s) | Fora de escopo |");
  md.push("|---|---|---|---|---|---|---|---|");
  for (const q of qualidades) {
    const ok = q.resultados.filter((r) => r.ok);
    const e = estat(ok.map((r) => r.s));
    md.push(`| ${q.rotulo} | ${q.resultados.length} | ${ok.length} | ${num(e.media)} | ${num(e.mediana)} | ${num(e.p95)} | ${num(e.max)} | ${q.resultados.filter((r) => r.fora).length} |`);
  }
  md.push("\n### Tempo médio por categoria (s)\n");
  const categorias = [...new Set(qualidades.flatMap((q) => q.resultados.map((r) => r.categoria)))];
  md.push(`| Categoria | ${qualidades.map((q) => q.rotulo).join(" | ")} |`);
  md.push(`|---|${qualidades.map(() => "---").join("|")}|`);
  for (const cat of categorias) {
    md.push(`| ${cat} | ${qualidades.map((q) => {
      const t = q.resultados.filter((r) => r.categoria === cat && r.ok).map((r) => r.s);
      return t.length ? num(estat(t).media) : "–";
    }).join(" | ")} |`);
  }
  md.push("\nA avaliação das respostas (nota 0 a 2) é feita nos arquivos `<maquina>_qualidade.csv`.");
}

fs.writeFileSync(path.join(DIR, "relatorio.md"), md.join("\n") + "\n");
console.log(md.join("\n"));
