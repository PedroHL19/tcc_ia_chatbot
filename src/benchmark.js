import fs from "fs";
import path from "path";

/**
 * Utilitário de Benchmark e Comparação de Modelos para RAG
 * Salva métricas de tempo e respostas por modelo e gera relatórios comparativos.
 */

const BENCHMARK_FILE = "benchmark_runs.json";

export function saveBenchmarkRun(modelName, results) {
  let runs = {};
  if (fs.existsSync(BENCHMARK_FILE)) {
    try {
      runs = JSON.parse(fs.readFileSync(BENCHMARK_FILE, "utf-8"));
    } catch {
      runs = {};
    }
  }

  const avgLatency = (
    results.reduce((acc, r) => acc + parseFloat(r.tempo || 0), 0) / (results.length || 1)
  ).toFixed(2);

  const successCount = results.filter((r) => r.sucesso).length;

  // Execuções em que nenhuma requisição funcionou (servidor fora do ar) não entram no histórico
  if (successCount === 0) {
    console.log("⚠️ Nenhuma requisição teve sucesso; execução não salva no histórico de benchmark.");
    return { avgLatency, totalRuns: runs[modelName]?.length || 0 };
  }

  const timestamp = new Date().toISOString();
  if (!runs[modelName]) runs[modelName] = [];

  runs[modelName].push({
    timestamp,
    avgLatencySeconds: parseFloat(avgLatency),
    totalTests: results.length,
    successCount,
    factualCount: results.filter((r) => r.acertouFato).length,
    details: results
  });

  fs.writeFileSync(BENCHMARK_FILE, JSON.stringify(runs, null, 2), "utf-8");
  return { avgLatency, totalRuns: runs[modelName].length };
}

export function printComparisonSummary() {
  if (!fs.existsSync(BENCHMARK_FILE)) {
    console.log("Nenhum dado de benchmark registrado ainda.");
    return;
  }

  const runs = JSON.parse(fs.readFileSync(BENCHMARK_FILE, "utf-8"));
  console.log("\n================================================================================");
  console.log("📊 COMPARATIVO DE DESEMPENHO ENTRE MODELOS");
  console.log("================================================================================");
  console.log("| Modelo              | Execuções | Latência Média (s) | HTTP OK | Acerto Factual |");
  console.log("|---------------------|-----------|--------------------|---------|----------------|");

  for (const [model, entries] of Object.entries(runs)) {
    if (!entries.length) continue;
    const latest = entries[entries.length - 1];
    const totalRuns = entries.length;
    const modelPadded = model.padEnd(19).substring(0, 19);
    const runsPadded = String(totalRuns).padEnd(9);
    const latPadded = `${latest.avgLatencySeconds}s`.padEnd(18);
    const httpRate = `${Math.round((latest.successCount / latest.totalTests) * 100)}%`.padEnd(7);
    // Execuções antigas não tinham factualCount salvo; recalcula a partir dos detalhes
    const factual = latest.factualCount ?? latest.details.filter((r) => r.acertouFato).length;
    const factualRate = `${Math.round((factual / latest.totalTests) * 100)}%`.padEnd(14);

    console.log(`| ${modelPadded} | ${runsPadded} | ${latPadded} | ${httpRate} | ${factualRate} |`);
  }
  console.log("================================================================================\n");
}
