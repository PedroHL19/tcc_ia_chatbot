// Script do Blip (ação "Executar script") que limpa a mensagem do aluno antes de ela entrar no JSON da requisição.
// O texto ia direto para dentro do JSON ("{{input.content}}"), então uma mensagem com quebra de linha ou
// aspas gerava JSON inválido e o aluno ficava sem resposta.
// Variável de entrada: input.content | Variável de saída: inputIaClean
// Na Requisição HTTP, o corpo continua com aspas em volta: "mensagem": "{{inputIaClean}}"
function run(mensagem) {
    var LIMITE = 2000; // mesmo limite de caracteres da API

    var limpa = (mensagem === null || mensagem === undefined) ? "" : String(mensagem);

    // Quebras de linha, tabs e outros caracteres de controle viram espaço
    limpa = limpa
        .replace(/[\u0000-\u001F\u007F]+/g, " ")
        .replace(/\s+/g, " ")
        .replace(/^\s+|\s+$/g, "");

    if (limpa.length > LIMITE) {
        limpa = limpa.substring(0, LIMITE);
    }

    // JSON.stringify escapa aspas e barras; tira as aspas das pontas porque o corpo já as tem
    var escapada = JSON.stringify(limpa);
    return escapada.substring(1, escapada.length - 1);
}
