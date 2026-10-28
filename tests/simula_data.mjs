// Simula outra data de "hoje" e mostra como o calendário responde, sem chamar a API
// Uso: node tests/simula_data.mjs 2026-11-06 [2026-12-20 ...]
const RealDate = Date;
const perguntas = process.env.PERGUNTAS?.split("|") ?? ["qual o próximo feriado?", "amanhã tem aula?", "quando são as férias?", "próximo recesso?", "posso fazer estágio nas férias?"];
for (const dia of process.argv.slice(2)) {
  const fixo = new RealDate(`${dia}T15:00:00Z`).getTime();
  globalThis.Date = class extends RealDate {
    constructor(...a) { super(...(a.length ? a : [fixo])); }
    static now() { return fixo; }
  };
  const { resolverDatas } = await import(`../src/datas.js?d=${dia}`);
  console.log(`\n=== Hoje = ${dia} ===`);
  for (const p of perguntas) {
    const r = resolverDatas(p);
    console.log(`${p}\n  -> ${r?.respostaDireta ?? "(vai para o LLM) " + (r?.texto.replace(/\n/g, " | ") ?? "sem datas")}`);
  }
}
