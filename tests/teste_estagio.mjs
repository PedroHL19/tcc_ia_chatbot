// Perguntas do FAQ da Seção de Estágios contra a API, com perfil por pergunta e fatos-chave esperados
import fs from "fs";

const env = Object.fromEntries(
  fs.readFileSync(process.argv[2], "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])
);
const URL = "http://localhost:3000/agente";

// [pergunta, curso, ano, fatos obrigatórios, fatos proibidos]
const T = [
  ["Consegui uma vaga de estágio, o que preciso fazer agora?", "BSI", "2024", ["orientador", "Ficha Cadastral", "7 dias úteis"], []],
  ["Posso usar o Termo de Compromisso e o Plano de Atividades no modelo da empresa?", "BSI", "2024", ["Seção de Estágios"], []],
  ["Qual a diferença entre estágio obrigatório e não obrigatório?", "BSI", "2024", ["PPC", "Atividade Complementar"], []],
  ["Quais são as exigências para eu poder fazer um estágio?", "BSI", "2024", ["matrícula", "frequência"], []],
  ["Como sei qual modalidade de estágio devo fazer, obrigatório ou não obrigatório?", "BSI", "2024", ["PPC"], []],
  ["Onde encontro o PPC do meu curso?", "BSI", "2024", ["ifmg.edu.br/sabara", "Nossos Cursos"], []],
  ["Quais os requisitos de estágio no curso técnico integrado ao ensino médio?", "TODOS", "TODOS", ["16 anos", "NAE"], []],
  ["Quais são os requisitos de estágio em Logística?", "LOGISTICA", "2024", ["Não Obrigatório"], ["horas de estágio obrigatório"]],
  ["Quantas horas de estágio obrigatório preciso fazer?", "BSI", "2024", ["120"], ["260"]],
  ["Quantas horas de estágio obrigatório preciso fazer?", "BSI", "2021", ["260"], ["120"]],
  ["Quantas horas de estágio obrigatório preciso fazer?", "ADMINISTRACAO", "2024", ["180"], []],
  ["Quantas horas de estágio obrigatório preciso fazer?", "ENG_AUTOMACAO", "2021", ["390"], ["240", "360"]],
  ["Quantas horas de estágio obrigatório preciso fazer?", "ENG_AUTOMACAO", "2024", [], []],
  ["Se eu fizer estágio não obrigatório, ele conta para as horas de estágio do meu curso?", "BSI", "2024", ["não"], []],
  ["A empresa precisa ter convênio com o IFMG para eu fazer estágio?", "BSI", "2024", ["facultativo"], []],
  ["Quais documentos preciso para iniciar um estágio?", "BSI", "2024", ["Ficha Cadastral", "Termo de Compromisso", "Plano de Atividades", "Seguro"], []],
  ["Meu estágio está vencendo, posso renovar?", "BSI", "2024", ["Termo Aditivo", "2 anos"], []],
  ["Posso mudar meu estágio de não obrigatório para obrigatório?", "BSI", "2024", ["Não", "encerrar"], []],
  ["Meu supervisor saiu da empresa, o que faço?", "BSI", "2024", ["Termo Aditivo"], []],
  ["Já trabalho na área, posso aproveitar a experiência como estágio obrigatório?", "BSI", "2024", ["parte"], []],
  ["Quais documentos preciso para pedir a equiparação da experiência profissional?", "BSI", "2024", ["Formulário de Requerimento", "carteira de trabalho"], []],
  ["Posso fazer dois estágios ao mesmo tempo?", "BSI", "2024", ["6 horas", "30 horas"], []],
  ["Onde encontro os modelos de documentos de estágio?", "BSI", "2024", ["estagios-1"], []],
  ["Já cumpri todas as horas de estágio obrigatório, posso fazer outro estágio obrigatório?", "BSI", "2024", ["Não Obrigatório"], []],
  ["O que acontece se eu estiver com pendência de documentos de estágio?", "BSI", "2024", ["Colação de Grau"], []],
  ["Posso começar o estágio antes de todos assinarem o Termo de Compromisso?", "BSI", "2024", ["Não", "trabalhista"], []],
  ["Como devem ser feitas as assinaturas dos documentos de estágio?", "BSI", "2024", ["GOV.BR", "PDF"], []],
  ["Comecei um estágio há algum tempo e não formalizei, como faço?", "BSI", "2024", ["retroativa"], []],
  ["Sou de outra instituição e quero estagiar no IFMG Sabará, como faço?", "TODOS", "TODOS", ["edital"], []],
  ["Como entrego o relatório de atividades semestral no SUAP?", "BSI", "2024", ["Supervisor", "6 meses"], []],
  ["Meu estágio foi rescindido, que documentos preciso enviar?", "BSI", "2024", ["Termo de Rescisão", "Termo de Realização"], []]
];

const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const out = [];
for (const [pergunta, curso, ano, fatos, proibidos] of T) {
  const t0 = Date.now();
  const r = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Key ${env.API_KEY}` },
    body: JSON.stringify({ mensagem: pergunta, curso, ano })
  }).then((x) => x.json());
  const resp = r.resposta || "";
  const faltando = fatos.filter((f) => !norm(resp).includes(norm(f)));
  const indevidos = proibidos.filter((f) => norm(resp).includes(norm(f)));
  const ok = faltando.length === 0 && indevidos.length === 0 && !r.fora_de_escopo;
  out.push({ pergunta, curso, ano, ok, faltando, indevidos, fora: r.fora_de_escopo, s: (Date.now() - t0) / 1000, resp });
  const extra = [faltando.length && "faltou: " + faltando.join(", "), indevidos.length && "citou indevidamente: " + indevidos.join(", "), r.fora_de_escopo && "FORA DE ESCOPO"].filter(Boolean).join(" | ");
  console.log(`${ok ? "OK " : "XX "} [${curso} ${ano}] ${pergunta}${extra ? "  (" + extra + ")" : ""}`);
}
fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 2));
console.log(`\nTotal: ${out.filter((o) => o.ok).length}/${out.length} | tempo médio ${(out.reduce((a, o) => a + o.s, 0) / out.length).toFixed(1)}s`);
