// Script do Blip (ação "Executar script") que monta o corpo da requisição para a API.
// O texto do aluno ia direto para dentro do JSON ("{{input.content}}"), então uma mensagem com
// quebra de linha ou aspas gerava JSON inválido e o aluno ficava sem resposta.
// Variáveis de entrada: input.content, cursoApi, anoApi | Variável de saída: corpoIa
// No bloco "IA request", esta ação vem antes da Requisição HTTP, cujo corpo passa a ser {{corpoIa}}.
function run(mensagem, curso, ano) {
    var LIMITE = 2000; // mesmo limite de caracteres da API

    function texto(valor) {
        if (valor === null || valor === undefined) {
            return "";
        }
        return String(valor);
    }

    // Quebras de linha, tabs e outros caracteres de controle viram espaço
    var limpa = texto(mensagem)
        .replace(/[\u0000-\u001F\u007F]+/g, " ")
        .replace(/\s+/g, " ")
        .replace(/^\s+|\s+$/g, "");

    if (limpa.length > LIMITE) {
        limpa = limpa.substring(0, LIMITE);
    }

    // JSON.stringify escapa aspas e barras, então o corpo é sempre um JSON válido
    return JSON.stringify({
        mensagem: limpa,
        curso: texto(curso),
        ano: texto(ano)
    });
}
