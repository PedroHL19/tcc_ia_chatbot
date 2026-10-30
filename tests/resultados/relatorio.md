# Relatório de benchmark do chatbot

## Teste de carga (perguntas simultâneas)

Tempo de cada resposta, em segundos, com N perguntas enviadas ao mesmo tempo. Vazão = respostas por minuto no lote.

| Máquina | Simultâneas | Sucesso | Média | Mediana | P95 | Mín | Máx | Tempo do lote | Vazão (resp/min) |
|---|---|---|---|---|---|---|---|---|---|
| notebook | 5 | 5/5 | 96,4 | 95,7 | 152,8 | 36,1 | 152,8 | 152,8 | 2,0 |
| notebook | 10 | 10/10 | 104,5 | 91,0 | 189,3 | 33,0 | 189,3 | 189,3 | 3,2 |
| notebook | 20 | 19/20 | 142,7 | 139,8 | 283,5 | 17,4 | 283,5 | 300,0 | 3,8 |
| notebook | 40 | 10/40 | 156,2 | 127,5 | 293,8 | 35,2 | 293,8 | 300,0 | 2,0 |
| pc | 5 | 5/5 | 6,6 | 6,0 | 11,8 | 1,8 | 11,8 | 11,8 | 25,3 |
| pc | 10 | 10/10 | 9,8 | 8,2 | 17,4 | 1,0 | 17,4 | 17,4 | 34,5 |
| pc | 20 | 20/20 | 10,9 | 9,1 | 20,6 | 1,6 | 21,4 | 21,4 | 55,9 |
| pc | 40 | 40/40 | 40,7 | 39,2 | 70,9 | 2,4 | 72,8 | 72,8 | 33,0 |

## Perguntas do orientador (uma por vez)

| Máquina | Perguntas | Sucesso | Média (s) | Mediana (s) | P95 (s) | Máx (s) | Fora de escopo |
|---|---|---|---|---|---|---|---|
| notebook | 98 | 98 | 20,9 | 17,8 | 41,7 | 52,2 | 4 |
| pc | 98 | 98 | 1,7 | 1,4 | 3,6 | 5,9 | 3 |

### Tempo médio por categoria (s)

| Categoria | notebook | pc |
|---|---|---|
| Estágio | 22,6 | 2,2 |
| Biblioteca | 15,2 | 1,3 |
| Registro Acadêmico | 25,1 | 2,0 |
| Identificação do setor | 25,6 | 1,9 |
| Linguagem informal | 14,7 | 1,1 |
| Segurança e informações conflitantes | 18,6 | 1,5 |
| Fora do escopo (verificar) | 16,1 | 1,6 |
| Acompanhamento | 29,5 | 2,0 |

A avaliação das respostas (nota 0 a 2) é feita nos arquivos `<maquina>_qualidade.csv`.
