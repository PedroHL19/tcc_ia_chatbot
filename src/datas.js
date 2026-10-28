// Resolve datas citadas na mensagem ("hoje", "amanhã", "28/10", "28 de outubro") e consulta o calendário acadêmico.
// O LLM não sabe a data atual e modelos pequenos erram dia da semana e a busca de uma data numa lista
// (ex.: liam "28 a 30/09" como 28/10), então a situação de cada data é calculada aqui e entregue pronta ao prompt.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const DIAS_SEMANA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const FUSO = "America/Sao_Paulo";
const DIA_MS = 86400000;
const BASE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "docs", "base_conhecimento");

const semAcento = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const doisDigitos = (n) => String(n).padStart(2, "0");
const utc = (a, m, d) => new Date(Date.UTC(a, m - 1, d));
const chave = (dt) => dt.toISOString().slice(0, 10);
const formatar = (dt) => `${doisDigitos(dt.getUTCDate())}/${doisDigitos(dt.getUTCMonth() + 1)}/${dt.getUTCFullYear()}`;
const diaSemana = (dt) => DIAS_SEMANA[dt.getUTCDay()];
const somarDias = (dt, n) => new Date(dt.getTime() + n * DIA_MS);

/** Data de hoje no fuso de Brasília (meia-noite UTC do dia, para somar dias sem efeito de horário de verão) */
function hojeBrasilia() {
  const [a, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date()).split("-").map(Number);
  return utc(a, m, d);
}

/**
 * Lê os arquivos calendario_academico_AAAA.md (linhas "- **11/03:**", "- **11 a 13/03:**", "- **15 e 16/07:**")
 * e monta o mapa data → eventos e os períodos letivos (início/término de cada semestre).
 */
function carregarCalendario() {
  const eventos = new Map();
  const linhasOriginais = []; // [ano, "20 a 30/07", texto], para listar períodos como férias e recessos
  const anos = new Set();
  const inicios = [];
  const terminos = [];
  let arquivos = [];
  try {
    arquivos = fs.readdirSync(BASE_DIR).filter((f) => /^calendario_academico_\d{4}\.md$/.test(f));
  } catch {
    return { eventos, anos, periodos: [], linhasOriginais };
  }
  for (const arquivo of arquivos) {
    const ano = +arquivo.match(/\d{4}/)[0];
    anos.add(ano);
    for (const linha of fs.readFileSync(path.join(BASE_DIR, arquivo), "utf8").split(/\r?\n/)) {
      const m = /^-\s*\*\*([\d\s/aeÀ-ÿ]+?):\*\*\s*(.+)$/.exec(linha.trim());
      if (!m) continue;
      const texto = m[2].replace(/\*\*/g, "").replace(/\.+$/, "").trim();
      const original = [ano, m[1].trim(), texto, null];
      linhasOriginais.push(original);
      const p = /^(\d{1,2})(?:\/(\d{1,2}))?(?:\s+(a|e)\s+(\d{1,2})\/(\d{1,2}))?$/.exec(m[1].trim());
      if (!p || (!p[2] && !p[3])) continue;
      let datas;
      if (!p[3]) datas = [utc(ano, +p[2], +p[1])];
      else {
        const fim = utc(ano, +p[5], +p[4]);
        const ini = utc(ano, p[2] ? +p[2] : +p[5], +p[1]);
        datas = p[3] === "e" ? [ini, fim] : [];
        if (p[3] === "a") for (let d = ini; d <= fim; d = somarDias(d, 1)) datas.push(d);
      }
      original[3] = datas[datas.length - 1]; // último dia, para saber se o período já passou
      for (const d of datas) {
        if (!eventos.has(chave(d))) eventos.set(chave(d), []);
        eventos.get(chave(d)).push(texto);
      }
      if (/^in[ií]cio d[oe]\b.*semestre/i.test(texto)) inicios.push(datas[0]);
      if (/^t[ée]rmino d[oe]\b.*semestre/i.test(texto)) terminos.push(datas[datas.length - 1]);
    }
  }
  inicios.sort((a, b) => a - b);
  terminos.sort((a, b) => a - b);
  const periodos = inicios.map((ini) => [ini, terminos.find((t) => t >= ini)]).filter(([, fim]) => fim);
  return { eventos, anos, periodos, linhasOriginais };
}

const CALENDARIO = carregarCalendario();
const SEM_AULA = /feriado|recesso|f[ée]rias|sem ministra[çc][ãa]o de aulas|exames? finais|exame final/i;

/** Classifica uma data pelo calendário: sem-calendario, sem-aula, ead, fim-de-semana, fora-do-periodo ou aula */
function classificar(dt) {
  if (!CALENDARIO.anos.has(dt.getUTCFullYear())) return { tipo: "sem-calendario", eventos: [] };
  const eventos = CALENDARIO.eventos.get(chave(dt)) || [];
  if (eventos.some((e) => SEM_AULA.test(e))) return { tipo: "sem-aula", eventos };
  if (eventos.some((e) => /EaD/i.test(e))) return { tipo: "ead", eventos };
  if (dt.getUTCDay() === 0 || dt.getUTCDay() === 6) return { tipo: "fim-de-semana", eventos };
  if (!CALENDARIO.periodos.some(([ini, fim]) => dt >= ini && dt <= fim)) return { tipo: "fora-do-periodo", eventos };
  return { tipo: "aula", eventos };
}

/** Situação de uma data no calendário, em uma frase pronta para o prompt */
function situacao(dt) {
  const { tipo, eventos } = classificar(dt);
  const lista = eventos.length ? ` (${eventos.join("; ")})` : "";
  switch (tipo) {
    case "sem-calendario": return `não há calendário acadêmico de ${dt.getUTCFullYear()} disponível (orientar a consultar o CRA)`;
    case "sem-aula": return `NÃO TEM AULA${lista}.`;
    case "ead": return `TEM ATIVIDADE LETIVA A DISTÂNCIA (EaD)${lista}.`;
    case "fim-de-semana": return `NÃO TEM AULA (fim de semana)${lista}.`;
    case "fora-do-periodo": return `NÃO TEM AULA (fora do período letivo)${lista}.`;
    default: return `TEM AULA (dia letivo normal: não há feriado, recesso ou suspensão de aula nessa data)${lista}.`;
  }
}

/** Resposta pronta para "tem aula em X?": vem direto do calendário, sem o LLM, que contradizia a situação calculada */
function respostaAula(dt, rotulo) {
  const { tipo, eventos } = classificar(dt);
  const data = `${rotulo ? `${rotulo[0].toUpperCase()}${rotulo.slice(1)}, ` : ""}${formatar(dt)} (${diaSemana(dt)})`;
  const outros = eventos.filter((e) => !SEM_AULA.test(e) && !/EaD/i.test(e));
  const extra = outros.length ? ` Nessa data também: ${outros.join("; ")}.` : "";
  switch (tipo) {
    case "sem-calendario":
      return `Ainda não tenho o calendário acadêmico de ${dt.getUTCFullYear()}. Consulte o CRA: cursos.sabara@ifmg.edu.br ou (31) 2102-9376.`;
    case "sem-aula": return `Não. ${data}: ${eventos.filter((e) => SEM_AULA.test(e)).join("; ")}.${extra}`;
    case "ead": return `Sim, a distância. ${data}: ${eventos.filter((e) => /EaD/i.test(e)).join("; ")}.${extra}`;
    case "fim-de-semana": return `Não. ${data} é fim de semana, sem aula.${extra}`;
    case "fora-do-periodo": return `Não. ${data} está fora do período letivo, sem aula.${extra}`;
    default: return `Sim. ${data} é dia letivo normal, com aula.${extra}`;
  }
}

/** Períodos letivos do ano e em qual deles está a data de hoje */
function periodosLetivos(hoje) {
  const doAno = CALENDARIO.periodos.filter(([ini]) => ini.getUTCFullYear() === hoje.getUTCFullYear());
  if (doAno.length === 0) return null;
  const lista = doAno.map(([ini, fim], i) => `${i + 1}º semestre de ${formatar(ini)} a ${formatar(fim)}`).join("; ");
  const atual = doAno.findIndex(([ini, fim]) => hoje >= ini && hoje <= fim);
  // O semestre em andamento vem primeiro: "quando acaba o semestre?" se refere a ele
  const emAndamento = atual >= 0
    ? `SEMESTRE ATUAL (em andamento hoje): ${atual + 1}º semestre, de ${formatar(doAno[atual][0])} a ${formatar(doAno[atual][1])}.`
    : "Hoje não há semestre letivo em andamento.";
  // Sem semestre futuro carregado, o modelo inventava datas do ano seguinte
  const haProximo = CALENDARIO.periodos.some(([ini]) => ini > hoje);
  const proximo = haProximo ? "" : `\nO calendário do próximo semestre (${hoje.getUTCFullYear() + 1}) ainda não está disponível: NÃO informe datas dele, oriente a consultar o CRA (cursos.sabara@ifmg.edu.br).`;
  return `${emAndamento}\nPeríodos letivos de ${hoje.getUTCFullYear()}: ${lista}.${proximo}`;
}

/** Próximos eventos que suspendem a aula ou são prazos, a partir de amanhã */
function proximosEventos(hoje, quantidade = 6) {
  return [...CALENDARIO.eventos.entries()]
    .filter(([k]) => k > chave(hoje))
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, quantidade)
    .map(([k, evs]) => `${formatar(new Date(k + "T00:00:00Z"))}: ${evs.join("; ")}`);
}

/**
 * @param {string} mensagem
 * @returns {{ texto: string, termosBusca: string, respostaDireta: string|null } | null} texto para o prompt, termos
 *   para enriquecer a busca e, em "tem aula em X?", a resposta pronta; null quando a mensagem não fala de datas
 */
export function resolverDatas(mensagem) {
  const hoje = hojeBrasilia();
  const msg = semAcento(mensagem.toLowerCase());
  const encontradas = []; // [data, rótulo]

  if (/\bhoje\b/.test(msg)) encontradas.push([hoje, "hoje"]);
  if (/\bdepois de amanha\b/.test(msg)) encontradas.push([somarDias(hoje, 2), "depois de amanhã"]);
  else if (/\bamanha\b/.test(msg)) encontradas.push([somarDias(hoje, 1), "amanhã"]);
  if (/\bontem\b/.test(msg)) encontradas.push([somarDias(hoje, -1), "ontem"]);

  const criar = (d, m, a) => {
    const ano = a ? (a < 100 ? 2000 + a : a) : hoje.getUTCFullYear();
    const dt = utc(ano, m, d);
    // descarta datas inválidas como 31/02
    if (dt.getUTCDate() === d && dt.getUTCMonth() === m - 1) encontradas.push([dt, null]);
  };
  for (const [, d, m, a] of msg.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g)) criar(+d, +m, a && +a);
  const nomesMeses = MESES.map(semAcento);
  for (const [, d, mes, a] of msg.matchAll(new RegExp(`\\b(\\d{1,2})\\s+de\\s+(${nomesMeses.join("|")})(?:\\s+de\\s+(\\d{4}))?`, "g"))) {
    criar(+d, nomesMeses.indexOf(mes) + 1, a && +a);
  }

  const perguntaProximo = /\bproxim[oa]s?\b/.test(msg) && /feriado|recesso|ferias|prazo|aula|semestre|calendario|evento|data/.test(msg);
  // Só perguntas sobre início/fim do semestre, férias ou calendário ("disciplinas do 3º semestre" não entra)
  // Férias/recesso só contam como pergunta de calendário quando a mensagem pergunta quando são: em "posso fazer estágio
  // nas férias?" o bloco de datas fazia o modelo tratar a pergunta como fora de escopo
  const perguntaQuandoPausa = /\b(quando|proxim[oa]s?|datas?|calendario)\b|\b(tem|ha|vai ter|terao?)\s+(ferias|recesso)/.test(msg) || /^(as |os )?(ferias|recessos?)\s*\??$/.test(msg.trim());
  const perguntaPausa = /ferias|recesso/.test(msg) && perguntaQuandoPausa;
  const perguntaPeriodo = perguntaPausa || /(inicio|comec\w*|termin\w*|acab\w*|\bfim\b|final)\b.{0,35}semestre|semestre.{0,25}(comec|termin|acab)|calendario|periodo letivo|ano letivo|volta\w* (as|das) aulas/.test(msg);
  if (encontradas.length === 0 && !perguntaProximo && !perguntaPeriodo) return null;

  const linhas = [`Hoje é ${diaSemana(hoje)}, ${formatar(hoje)}.`];
  const termos = new Set();
  const vistas = new Set();
  for (const [dt, rotulo] of encontradas) {
    if (vistas.has(chave(dt))) continue;
    vistas.add(chave(dt));
    linhas.push(`${formatar(dt)}${rotulo ? ` (${rotulo})` : ""}, ${diaSemana(dt)}: ${situacao(dt)}`);
    termos.add(`${formatar(dt).slice(0, 5)} ${MESES[dt.getUTCMonth()]}`);
  }
  if (perguntaPeriodo || perguntaProximo) {
    const periodos = periodosLetivos(hoje);
    if (periodos) linhas.push(periodos);
  }
  // Férias e recessos separados em próximos e já passados: com a lista do ano inteiro, o modelo respondia as férias de julho em outubro
  let proximasPausas = null;
  if (perguntaPausa) {
    const pausas = CALENDARIO.linhasOriginais.filter(([a, , texto, fim]) => a === hoje.getUTCFullYear() && fim && /f[ée]rias|recesso/i.test(texto));
    const listar = (lista) => lista.map(([a, rotulo, texto]) => `${rotulo}/${a}: ${texto}`).join(" | ");
    proximasPausas = pausas.filter(([, , , fim]) => fim >= hoje);
    const passadas = pausas.filter(([, , , fim]) => fim < hoje);
    linhas.push(proximasPausas.length
      ? `PRÓXIMAS férias e recessos (a partir de hoje): ${listar(proximasPausas)}.`
      : `Não há mais férias ou recessos no calendário de ${hoje.getUTCFullYear()} a partir de hoje.`);
    if (passadas.length) linhas.push(`Já passaram (não são as próximas): ${listar(passadas)}.`);
  }
  if (perguntaProximo) {
    const proximos = proximosEventos(hoje);
    if (proximos.length) linhas.push(`Próximas datas do calendário a partir de hoje: ${proximos.join(" | ")}.`);
    termos.add(MESES[hoje.getUTCMonth()]);
  }
  // Pergunta curta e direta "tem aula ...?" com data: a resposta sai pronta do calendário
  const unicas = encontradas.filter(([dt], i) => encontradas.findIndex(([d]) => chave(d) === chave(dt)) === i);
  let respostaDireta = /\baulas?\b/.test(msg) && unicas.length > 0 && msg.length <= 80
    ? unicas.map(([dt, rotulo]) => respostaAula(dt, rotulo)).join("\n")
    : null;
  // "Quando são as férias?" também sai pronto, com os próximos períodos e as férias do ano que já passaram
  if (!respostaDireta && proximasPausas && encontradas.length === 0 && msg.length <= 80) {
    const ano = hoje.getUTCFullYear();
    const proximas = proximasPausas.map(([a, rotulo, texto]) => `${rotulo}/${a} (${texto.toLowerCase()})`).join("; ");
    const ferias = CALENDARIO.linhasOriginais.filter(([a, , texto, fim]) => a === ano && fim && fim < hoje && /f[ée]rias/i.test(texto));
    respostaDireta = (proximas
      ? `Os próximos recessos e férias no calendário acadêmico de ${ano} são: ${proximas}.`
      : `Não há mais recessos ou férias no calendário acadêmico de ${ano}.`)
      + (ferias.length ? ` As férias escolares de ${ano} já ocorreram (${ferias.map(([a, rotulo]) => `${rotulo}/${a}`).join(", ")}).` : "")
      + (CALENDARIO.anos.has(ano + 1) ? "" : ` O calendário de ${ano + 1} ainda não está disponível; consulte o CRA: cursos.sabara@ifmg.edu.br.`);
  }
  // "Qual o próximo feriado?" também sai pronto: com a lista de próximas datas, o modelo pulava o primeiro feriado
  if (!respostaDireta && /\bproxim[oa] feriado\b/.test(msg) && encontradas.length === 0 && msg.length <= 80) {
    const [k, evs] = [...CALENDARIO.eventos.entries()]
      .filter(([k, evs]) => k > chave(hoje) && evs.some((e) => /feriado/i.test(e)))
      .sort(([a], [b]) => a.localeCompare(b))[0] || [];
    const dt = k && new Date(k + "T00:00:00Z");
    respostaDireta = dt
      ? `O próximo feriado é em ${formatar(dt)} (${diaSemana(dt)}): ${evs.filter((e) => /feriado/i.test(e)).join("; ")}.`
      : "Não há outro feriado no calendário acadêmico disponível. Consulte o CRA: cursos.sabara@ifmg.edu.br ou (31) 2102-9376.";
  }

  // Só datas explícitas mudam a busca; perguntas sobre o semestre já encontram o calendário sozinhas e o gatilho
  // de período pode pegar frases como "no final do curso, no 8º semestre", que precisam da busca normal
  const termosBusca = termos.size ? `Calendário acadêmico: ${[...termos].join(", ")}` : null;
  return { texto: linhas.join("\n"), termosBusca, respostaDireta };
}
