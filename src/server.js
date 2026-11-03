import express from "express";
import dotenv from "dotenv";
import crypto from "crypto";
import { SYSTEM_PROMPT, buildUserPromptWithContext, limitarContexto } from "./prompt.js";
import { ollama, generateEmbedding, generateChat, warmUpModels, LLM_MODEL, EMBEDDING_MODEL, OLLAMA_CONFIG, MAX_CONTEXT_CHARS } from "./ollamaClient.js";
import { qdrant, searchSimilar, buildCourseYearFilter, normalizeCurso, COLLECTION_NAME } from "./qdrantClient.js";
import { resolverDatas } from "./datas.js";

dotenv.config();

// A chave é obrigatória: sem ela o servidor não sobe (evita rodar com uma chave padrão conhecida)
const RAW_API_KEY = process.env.API_KEY || process.env.API_TOKEN;
if (!RAW_API_KEY || RAW_API_KEY.trim().length === 0) {
  console.error("Erro fatal: defina API_KEY no arquivo .env antes de iniciar o servidor.");
  process.exit(1);
}
const EXPECTED_KEY = Buffer.from(RAW_API_KEY.replace(/^(Key|Bearer)\s+/i, "").trim());

// Nomes por extenso dos cursos, usados para enriquecer a consulta de busca semântica
const NOMES_CURSOS = {
  BSI: "Bacharelado em Sistemas de Informação (BSI)",
  ENG_AUTOMACAO: "Bacharelado em Engenharia de Controle e Automação",
  ADMINISTRACAO: "Bacharelado em Administração",
  LOGISTICA: "Tecnologia em Logística",
  PROCESSOS_GERENCIAIS: "Tecnologia em Processos Gerenciais"
};

// Respostas sobre datas terminam com o link do calendário oficial, para o aluno conferir
const LINK_CALENDARIO = "https://www.ifmg.edu.br/sabara/ensino-pesquisa-e-extensao/controle-e-registro-academico/calendario-academico";
const comLinkCalendario = (texto) =>
  texto.includes(LINK_CALENDARIO) ? texto : `${texto}\n\nCalendário acadêmico: ${LINK_CALENDARIO}`;

// Limite da mensagem do aluno: acima disso o prompt não caberia no contexto do modelo
const MAX_MENSAGEM_CHARS = 2000;

// Tempo por etapa de cada requisição; console.time não serve aqui porque o rótulo é global e requisições simultâneas se misturam
const logTempo = (rotulo, inicio) => console.log(`[Tempo] ${rotulo}: ${(performance.now() - inicio).toFixed(3)}ms`);

// Falha em vez de deixar o /health preso se um serviço não responder
const comTimeout = (promessa, ms = 3000) => Promise.race([
  promessa,
  new Promise((_, rejeitar) => setTimeout(() => rejeitar(new Error("timeout")), ms))
]);

const app = express();
app.use(express.json());

// Middleware de autenticação tolerante a prefixos (Key/Bearer)
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ 
      sucesso: false, 
      erro: "Acesso negado. Chave de autorização ausente." 
    });
  }

  // Normaliza removendo prefixos 'Key ' ou 'Bearer ' para comparar o valor real da chave
  // Comparação em tempo constante para não vazar a chave por diferença de tempo de resposta
  const received = Buffer.from(authHeader.replace(/^(Key|Bearer)\s+/i, "").trim());

  if (received.length !== EXPECTED_KEY.length || !crypto.timingSafeEqual(received, EXPECTED_KEY)) {
    return res.status(401).json({ 
      sucesso: false, 
      erro: "Acesso negado. Chave de autorização inválida." 
    });
  }
  next();
};

// Endpoint de verificação de saúde da API
app.get("/health", async (req, res) => {
  const [ollamaOk, qdrantOk] = (await Promise.allSettled([
    comTimeout(ollama.list()),
    comTimeout(qdrant.getCollection(COLLECTION_NAME))
  ])).map((r) => r.status === "fulfilled");
  const tudoOk = ollamaOk && qdrantOk;

  return res.status(tudoOk ? 200 : 503).json({
    sucesso: tudoOk,
    status: tudoOk ? "ok" : "indisponivel",
    mensagem: tudoOk ? "API RAG (IFMG Sabará) ativa e operando" : "API ativa, mas um serviço necessário não está respondendo",
    servicos: { ollama: ollamaOk, qdrant: qdrantOk },
    config: {
      llm: LLM_MODEL,
      embeddings: EMBEDDING_MODEL,
      colecao: COLLECTION_NAME
    }
  });
});

// Endpoint principal consultado pelo Blip ou frontend
app.post("/agente", authMiddleware, async (req, res) => {
  const inicioRequisicao = performance.now();
  // Registra a resposta enviada em todos os caminhos (prontas, calendário, recusa e LLM) para avaliar os testes com usuários
  const enviarJson = res.json.bind(res);
  res.json = (corpo) => {
    logTempo("Total", inicioRequisicao);
    console.log(`[Resposta] (fora_de_escopo=${corpo?.fora_de_escopo}) ${(corpo?.resposta || corpo?.erro || "").replace(/\s*\n\s*/g, " ")}`);
    return enviarJson(corpo);
  };
  try {
    // Suporta { mensagem: "..." } ou variações comuns do Blip
    let pergunta =
      req.body.mensagem || req.body.message || req.body.text || req.body.content;

    if (!pergunta || typeof pergunta !== "string" || pergunta.trim().length === 0) {
      return res.status(400).json({
        sucesso: false,
        erro: "Campo 'mensagem' é obrigatório e não pode ser vazio."
      });
    }

    let rawCurso = req.body.curso || req.body.course || null;
    let rawAno = req.body.ano || req.body.year || req.body.ano_ingresso || null;

    let curso = rawCurso && typeof rawCurso === "string" && rawCurso.trim().length > 0
      ? rawCurso.trim()
      : null;
    let ano = rawAno ? String(rawAno).trim() : null;

    // Se o usuário inverter curso e ano no payload (ex: curso="2023", ano="BSI"), corrige automaticamente
    if (curso && /^\d{4}$/.test(curso) && ano && isNaN(parseInt(ano, 10))) {
      const temp = curso;
      curso = ano;
      ano = temp;
    }

    // Converte variações enviadas pelo Blip ("Sistemas de Informação", "logística"...) para o código usado nos metadados
    curso = normalizeCurso(curso);

    // O bot atende só alunos (o Blip encerra o atendimento de quem não é aluno).
    // "TODOS" (testes) e "INVALIDO" (vindo do Blip) significam perfil não informado:
    // a busca cobre toda a base e o modelo não recebe a regra de aplicar um único curso/ano
    if (curso === "TODOS" || curso === "INVALIDO") curso = null;
    if (ano && /^(todos|invalido)$/i.test(ano)) ano = null;

    if (pergunta.length > MAX_MENSAGEM_CHARS) {
      console.log(`[Escopo] Mensagem muito longa (${pergunta.length} caracteres)`);
      return res.json({
        sucesso: true,
        encontrou_resposta: false,
        fora_de_escopo: true,
        resposta: "Sua mensagem ficou muito longa. Pode resumir sua dúvida em poucas frases?",
        perfil: { curso, ano }
      });
    }

    const perfilLog = [
      curso ? `Curso: ${curso}` : null,
      ano ? `Ano: ${ano}` : null
    ].filter(Boolean).join(" | ");

    console.log(`\n[${new Date().toLocaleTimeString()}] Nova pergunta recebida: "${pergunta}" ${perfilLog ? `(${perfilLog})` : ""}`);

    // Defesa programática contra vazamento de prompt / injeção de prompt.
    // Só bloqueia quando a pergunta se refere às instruções do PRÓPRIO bot ("suas regras", "do sistema"),
    // para não barrar dúvidas legítimas como "quais são as regras do estágio?".
    const isPromptLeakAttempt = [
      /(?:repita|mostre|me\s+mostre|veja|quais\s+s[aã]o|liste|exiba|imprima|print|diga|revele|resuma)\s+(?:todas?\s+)?(?:as?\s+|os?\s+)?(?:suas?|tuas?|seus?|teus?)\s+(?:instru[cç][oõ]es|regras|diretrizes|prompts?|configura[cç][oõ]es)/i,
      /(?:instru[cç][oõ]es|regras|diretrizes|prompt|mensagem|texto)\s+(?:do\s+sistema|confidenciais|internas|iniciais|ocultas)/i,
      /system\s+prompt|prompt\s+injection|jailbreak|modo\s+desenvolvedor|developer\s+mode/i,
      /(?:ignore|desconsidere|esque[cç]a)\s+(?:tudo|todas?\s+(?:as\s+)?(?:suas\s+)?(?:regras|instru[cç][oõ]es)|(?:as\s+)?(?:suas\s+)?(?:regras|instru[cç][oõ]es)\s+anteriores|o\s+que\s+(?:te\s+)?disseram)/i
    ].some((re) => re.test(pergunta));

    if (isPromptLeakAttempt) {
      console.log(`[Segurança] Bloqueada tentativa de vazamento de prompt: "${pergunta}"`);
      return res.json({
        sucesso: true,
        encontrou_resposta: false,
        fora_de_escopo: true,
        resposta: "Sou o assistente virtual acadêmico do IFMG Campus Sabará e minhas instruções internas são confidenciais. Estou à disposição para ajudar com dúvidas sobre Estágios, CRA (matrícula/dispensas), Biblioteca ou PPCs dos cursos do campus. Como posso te ajudar hoje?",
        perfil: {
          curso,
          ano
        }
      });
    }

    // Saudação pura é respondida sem chamar o LLM: evita que modelos menores confundam
    // perguntas reais com saudações e copiem a mensagem de boas-vindas
    const isApenasSaudacao = /^(oi|ol[aá]|bom dia|boa tarde|boa noite|e ai|e a[ií]|ea[eií]|ae|opa)[\s!.,?]*$/i.test(pergunta.trim());
    if (isApenasSaudacao) {
      return res.json({
        sucesso: true,
        encontrou_resposta: false,
        fora_de_escopo: true,
        resposta: "Olá! Sou o assistente virtual acadêmico do IFMG Campus Sabará e posso te ajudar com dúvidas sobre Estágios, CRA (matrícula/dispensas), Biblioteca e os cursos do campus.",
        perfil: {
          curso,
          ano
        }
      });
    }

    // Respostas de conversa ("sim", "ok", "obrigado") não são perguntas: a busca achava tabelas acima do score mínimo
    // e o modelo inventava uma resposta. Saem como fora de escopo para o Blip pedir a dúvida de novo
    const conversa = pergunta.trim().toLowerCase().replace(/[\s!.,?]+$/, "");
    // Só o nome da instituição tem embedding fraco: vira a pergunta completa
    if (/^(o )?(ifmg|instituto( federal)?)( campus)?( sabar[aá])?$/.test(conversa)) pergunta = "O que é o IFMG? Que instituição é essa?";
    const isAgradecimento = /^(muito )?(obrigad[oa]|brigad[oa]|valeu|vlw|agrade[cç]o)( mesmo)?$/.test(conversa);
    const isConfirmacao = /^(sim|s|n[aã]o|n|ok|okay|blz|beleza|certo|entendi|t[aá]|t[aá] bom|t[aá] certo|ah|hm+|show|perfeito|tudo bem)$/.test(conversa);
    const isNaoEntendi = /^(eu )?n[aã]o (entendi|compreendi)( nada)?$/.test(conversa);
    const isDespedida = /^(tchau|xau|falou|flw|at[eé] (mais|logo|breve|depois|amanh[aã])|volto (depois|mais tarde|outra hora)|depois eu (volto|vejo)|fui)$/.test(conversa);
    if (isAgradecimento || isConfirmacao || isNaoEntendi || isDespedida) {
      return res.json({
        sucesso: true,
        encontrou_resposta: false,
        fora_de_escopo: true,
        resposta: isAgradecimento ? "De nada! Fico à disposição." : isDespedida ? "Até mais! Fico à disposição quando precisar." : isNaoEntendi ? "Desculpe se não fui claro." : "Entendido!",
        perfil: {
          curso,
          ano
        }
      });
    }

    // Mensagem quase sem conteúdo ("a[", "?", "k"): o embedding fica genérico e chega a 60% de similaridade
    // com tabelas da base, então nem passa pela busca
    if ((pergunta.match(/[\p{L}\p{N}]/gu) || []).length < 3) {
      console.log("[Escopo] Mensagem sem conteúdo suficiente: recusa padrão");
      return res.json({
        sucesso: true,
        encontrou_resposta: false,
        fora_de_escopo: true,
        resposta: "Não consegui identificar uma dúvida relacionada aos serviços acadêmicos do IFMG Campus Sabará (como estágios, matrícula, CRA, dispensas ou biblioteca).",
        perfil: {
          curso,
          ano
        }
      });
    }

    // Datas citadas ("amanhã", "28 de outubro") são consultadas no calendário pelo código e vão para o prompt e para a busca
    // (senão "amanhã tem aula?" nem encontra o calendário); "tem aula em X?" já sai respondida, sem o LLM
    const datas = resolverDatas(pergunta);
    if (datas) console.log(`[Datas] ${datas.texto.replace(/\n/g, " | ")}`);
    if (datas?.respostaDireta) {
      console.log("[Datas] Resposta direta do calendário (sem LLM)");
      return res.json({
        sucesso: true,
        encontrou_resposta: true,
        fora_de_escopo: false,
        resposta: comLinkCalendario(datas.respostaDireta),
        perfil: { curso, ano }
      });
    }

    // Horário das aulas: o modelo inventava horários ("começa às 18h30") ou respondia com o horário da biblioteca,
    // então a resposta sai pronta com o período do curso
    const msgSemAcento = pergunta.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    // Requisitos/período do estágio na Engenharia: a Seção de Estágios pediu a resposta completa (as duas matrizes),
    // porque o modelo escolhia uma regra só e dizia "qualquer período" para quem é da matriz nova
    const perguntaRequisitosEstagioEng = !datas &&
      (curso === "ENG_AUTOMACAO" || /engenharia|automacao/.test(msgSemAcento)) &&
      /estagio/.test(msgSemAcento) &&
      /periodo|requisit|exigenc|exige|quando (posso|pode|devo)|a partir de|pre-?requisito|aptidao|apto/.test(msgSemAcento) &&
      !/orientador|document|relatorio|termo|aditivo|prorrog|rescis|supervisor/.test(msgSemAcento);
    if (perguntaRequisitosEstagioEng) {
      return res.json({
        sucesso: true,
        encontrou_resposta: true,
        fora_de_escopo: false,
        resposta: "Para a Engenharia de Controle e Automação, o estágio é um componente curricular obrigatório, mas também é possível realizar o estágio não obrigatório. Para ambas as modalidades, a/o discente deve estar com matrícula e frequência regulares e as atividades planejadas devem ter relação direta com o curso.\n\n" +
          "- Ingressantes entre 2019 e 2022: são exigidas 390 horas de Estágio Obrigatório, permitida a realização em qualquer período do curso.\n" +
          "- Ingressantes a partir de 2023: são exigidas 240 horas de Estágio Obrigatório, que pode ser realizado após a conclusão de 1200 horas de curso OU após concluir 33% do curso OU, em períodos letivos regulares, após ter integralizado todas as matérias até o 4º período.\n\n" +
          "Já o Estágio Não Obrigatório pode ser realizado em qualquer período.\n\nDúvidas: Seção de Estágios — estagio.sabara@ifmg.edu.br",
        perfil: { curso, ano }
      });
    }

    const perguntaHorarioAula = !datas && !/quantas horas/.test(msgSemAcento) &&
      /(horario|que horas|hora)s?\b.{0,25}\baulas?\b|\baulas?\b.{0,20}(comeca|inicia|termina|acaba|horario)|quadro de horario/.test(msgSemAcento);
    if (perguntaHorarioAula) {
      // Só o período (manhã/tarde/noite): o horário exato de cada aula não está nos documentos
      const TURNOS = {
        BSI: "As aulas do curso de Sistemas de Informação (BSI) são no período da manhã.",
        ENG_AUTOMACAO: "As aulas do curso de Engenharia de Controle e Automação são no período da noite.",
        LOGISTICA: "As aulas do curso de Logística são no período da noite.",
        ADMINISTRACAO: "As aulas do curso de Administração são concentradas no período da noite."
      };
      return res.json({
        sucesso: true,
        encontrou_resposta: true,
        fora_de_escopo: false,
        resposta: TURNOS[curso] ||
          "Períodos das aulas: Sistemas de Informação (BSI) pela manhã; Engenharia de Controle e Automação, Logística e Administração à noite.",
        perfil: { curso, ano }
      });
    }

    const inicioEmbedding = performance.now();
    // 1. Gera embedding da pergunta com o BGE-M3 (1024 dimensões).
    // Quando o curso é conhecido, gera também um embedding da pergunta com o nome do curso: assim trechos gerais
    // (válidos para todos os cursos, como o FAQ de estágios) são encontrados pela seção do curso certo
    // mesmo quando a pergunta não cita o curso, sem desviar perguntas gerais para assuntos do curso.
    const queryVector = await generateEmbedding(datas?.termosBusca ? `${pergunta.trim()}\n${datas.termosBusca}` : pergunta.trim());
    // Perguntas com data são sobre o calendário, que vale para todos os cursos: a busca com o curso só traria ruído
    const queryVectorCurso = curso && NOMES_CURSOS[curso] && !datas
      ? await generateEmbedding(`${pergunta.trim()}\nCurso: ${NOMES_CURSOS[curso]}`)
      : null;
    logTempo("1. Embedding", inicioEmbedding);

    // Monta filtro por metadados no Qdrant se curso ou ano foram informados
    const filter = buildCourseYearFilter(curso, ano);

    const inicioBusca = performance.now();
    // 2. Busca os Top-3 chunks mais relevantes pela pergunta e acrescenta até 2 trechos inéditos da busca com o curso.
    // Sem fallback para busca sem filtro: o filtro já inclui os documentos gerais (TODOS / 0–9999),
    // e buscar sem ele traria regras de outros cursos ou matrizes de outro ano de ingresso.
    const searchResults = await searchSimilar(queryVector, 3, filter);
    // Filtra apenas trechos com relevância mínima (48%) para evitar alucinações com perguntas fora do escopo ou nomes isolados
    const MIN_RELEVANCE_SCORE = 0.48;
    // A busca com o curso só complementa: o nome do curso domina o vetor de mensagens curtas ("Pedro" + "Curso: BSI"
    // casa com trechos do BSI acima de 60%), então ela só roda se a pergunta sozinha já achou algo relevante
    if (queryVectorCurso && searchResults.some((r) => r.score >= MIN_RELEVANCE_SCORE)) {
      const idsJaUsados = new Set(searchResults.map((r) => r.id));
      const extras = (await searchSimilar(queryVectorCurso, 3, filter)).filter((r) => !idsJaUsados.has(r.id)).slice(0, 2);
      const idsExtras = extras.map((r) => r.id);
      // O próprio nome do curso eleva o FAQ de estágios e a matriz do BSI acima de 60% para qualquer mensagem ("aaaa"),
      // então o extra também precisa ter um mínimo de relação com a pergunta sem o curso. O piso é menor que o score
      // mínimo porque trechos certos chegam só por essa busca ("disciplinas do 3º período": 69% com o curso, 43% sem)
      const MIN_SCORE_EXTRA_SEM_CURSO = 0.40;
      if (idsExtras.length) {
        const filtroExtras = { must: [{ has_id: idsExtras }, ...(filter ? [filter] : [])] };
        const semCurso = new Map((await searchSimilar(queryVector, idsExtras.length, filtroExtras)).map((r) => [r.id, r.score]));
        searchResults.push(...extras.filter((r) => (semCurso.get(r.id) ?? 0) >= MIN_SCORE_EXTRA_SEM_CURSO));
      }
    }
    logTempo("2. Qdrant Search", inicioBusca);

    const relevantResults = searchResults.filter((r) => r.score >= MIN_RELEVANCE_SCORE);

    const contextChunks = limitarContexto(relevantResults.map((result) => ({
      text:       result.payload?.text       || "",
      source:     result.payload?.source     || "Oficial",
      curso:      result.payload?.curso      || "TODOS",
      tipo:       result.payload?.tipo       || "geral",
      descricao:  result.payload?.descricao  || "",
      ano_min:    result.payload?.ano_min    ?? 0,
      ano_max:    result.payload?.ano_max    ?? 9999,
      score:      result.score
    })), MAX_CONTEXT_CHARS);
    if (contextChunks.length < relevantResults.length) {
      console.log(`[Contexto] ${relevantResults.length - contextChunks.length} trecho(s) fora do prompt para caber no num_ctx`);
    }

    console.log(`Recuperados ${searchResults.length} trechos do Qdrant (${contextChunks.length} acima do score mínimo de ${(MIN_RELEVANCE_SCORE * 100)}%):`);
    searchResults.forEach((c, idx) => {
      const status = c.score >= MIN_RELEVANCE_SCORE ? "[USADO]" : "[IGNORADO - SCORE BAIXO]";
      const anoLabel = c.payload?.tipo === "ppc"
        ? `${c.payload?.ano_min ?? "?"}–${c.payload?.ano_max === 9999 ? "atual" : c.payload?.ano_max ?? "?"}`
        : "GERAL";
      console.log(`  [Trecho ${idx + 1}] Score: ${(c.score * 100).toFixed(1)}% | ${status} | Curso: ${c.payload?.curso || "TODOS"} | Anos: ${anoLabel} | ${c.payload?.source || "?"}`);
    });

    // 3. Monta o prompt contextualizado incluindo perfil do aluno
    const userPrompt = buildUserPromptWithContext(contextChunks, pergunta.trim(), { curso, ano }, datas?.texto);

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt }
    ];

    // 4. Executa a inferência local no Llama. Sem nenhum trecho relevante a resposta é a recusa padrão, sem chamar o LLM:
    // com o perfil do aluno no prompt ele inventava respostas sobre o curso para mensagens como um nome solto
    let resposta;
    if (contextChunks.length === 0) {
      resposta = "Não consegui identificar uma dúvida relacionada aos serviços acadêmicos do IFMG Campus Sabará (como estágios, matrícula, CRA, dispensas ou biblioteca).";
    } else {
      const inicioLLM = performance.now();
      resposta = await generateChat(messages);
      logTempo("3. LLM Generate", inicioLLM);
    }

    // Higienização: remove cabeçalhos residuais como "**Resposta:**" ou "Resposta oficial preparada para IA:".
    // Exige o separador (":" ou travessão) para não apagar frases reais como "A resposta do pedido sai em 5 dias".
    resposta = (resposta || "").trim()
      .replace(/^\s*(?:#+\s*)?\*{0,2}(?:A\s+)?resposta[^\n\r:]{0,50}(?:[:–—]|\s-\s)\*{0,2}\s*/i, "")
      .replace(/^\s*(?:#+\s*)?\*{0,2}[^\n\r]{0,40}resposta[^\n\r]{0,40}:\*{0,2}\s*\r?\n+/i, "")
      .trim();

    // Remove citações a documentos internos como "De acordo com o/a FAQ XX", "FAQ XX", etc.
    resposta = resposta
      .replace(/\b(?:de\s+acordo\s+com|conforme|segundo|no|na)\s+(?:o|a|os|as)?\s*faq\s*\d+[,:\s—–-]*/gi, "")
      .replace(/\bfaq\s*\d+[,:\s—–-]*/gi, "")
      .trim();

    // Remove repetição robótica de perfil no início da resposta (ex.: "Você está cursando o BSI no ano de ingresso 2023...")
    resposta = resposta
      .replace(/^\s*voc[êe]\s+est[áa]\s+cursando\s+[^.]*?\bno\s+ano\s+de\s+ingresso\s+(?:de\s+)?\d{4}\.?\s*/i, "")
      .replace(/^\s*voc[êe]\s+est[áa]\s+cursando\s+o\s+bsi\s+[^.]*?\.\s*/i, "")
      // "Você." solto no início, efeito da instrução de falar com o aluno como "você"
      .replace(/^\s*voc[êe]\s*[.,:]\s+(?=\S)/i, "")
      .trim();

    // Saudações puras já retornaram acima; aqui remove saudações e apresentações repetitivas da resposta
    resposta = resposta
      .replace(/^\s*(?:ol[aá]|bom dia|boa tarde|boa noite)!?\s*(?:Sou\s+o\s+assistente\s+virtual\s+acadêmico\s+(?:do\s+IFMG\s+Campus\s+Sabará|do\s+IFMG)?\.?)?\s*/i, "")
      .replace(/^\s*Sou\s+o\s+assistente\s+virtual\s+acadêmico\s+(?:do\s+IFMG\s+Campus\s+Sabará|do\s+IFMG)?\.?\s*/i, "")
      .trim();

    // Garante que a primeira letra seja maiúscula após qualquer remoção
    if (resposta.length > 0) {
      resposta = resposta.charAt(0).toUpperCase() + resposta.slice(1);
    }

    // Identifica se a pergunta foi fora de escopo (score baixo ou recusa padrão)
    // A comparação ignora acentos e maiúsculas para tolerar pequenas variações do LLM na frase de recusa
    const respostaNorm = resposta.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const isForaDeEscopo =
      contextChunks.length === 0 ||
      /nao\s+consegui\s+identificar\s+uma\s+duvida/.test(respostaNorm);

    const encontrouResposta = !isForaDeEscopo;
    if (datas && encontrouResposta) resposta = comLinkCalendario(resposta);

    return res.json({
      sucesso: true,
      encontrou_resposta: encontrouResposta,
      fora_de_escopo: isForaDeEscopo,
      resposta,
      perfil: {
        curso,
        ano
      }
    });
  } catch (error) {
    console.error("Erro ao processar consulta no agente RAG:", error);

    return res.status(500).json({
      sucesso: false,
      erro: "Erro interno ao processar a consulta."
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`Servidor RAG rodando na porta ${PORT}`);
  console.log(`Coleção Qdrant: ${COLLECTION_NAME}`);
  console.log(`Modelo LLM: ${LLM_MODEL} | Embeddings: ${EMBEDDING_MODEL}${OLLAMA_CONFIG.embeddingOnCpu ? " (CPU)" : ""}`);
  console.log(`Keep-alive: ${OLLAMA_CONFIG.keepAlive} | Máx. tokens por resposta: ${OLLAMA_CONFIG.numPredict} | num_ctx: ${OLLAMA_CONFIG.numCtx}`);
  console.log(`======================================================\n`);

  // Carrega os modelos já na subida para a primeira pergunta não sofrer cold start
  warmUpModels()
    .then((s) => console.log(`[Aquecimento] Modelos carregados em ${s.toFixed(1)}s`))
    .catch((err) => console.error(`[Aquecimento] Falhou (a primeira pergunta pode demorar mais): ${err.message}`));
});
