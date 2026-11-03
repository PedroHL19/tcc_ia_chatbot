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
| pc_par1 | 5 | 5/5 | 5,9 | 6,5 | 9,6 | 1,6 | 9,6 | 9,6 | 31,1 |
| pc_par1 | 10 | 10/10 | 9,4 | 8,2 | 16,7 | 0,9 | 16,7 | 16,7 | 35,9 |
| pc_par1 | 20 | 20/20 | 10,3 | 9,7 | 20,1 | 1,5 | 21,5 | 21,5 | 55,8 |
| pc_par1 | 40 | 40/40 | 36,1 | 34,2 | 64,4 | 2,8 | 66,4 | 66,5 | 36,1 |
| pc_par2 | 5 | 5/5 | 6,2 | 6,5 | 7,8 | 3,9 | 7,8 | 7,9 | 38,2 |
| pc_par2 | 10 | 10/10 | 7,0 | 5,9 | 12,6 | 1,5 | 12,6 | 12,7 | 47,4 |
| pc_par2 | 20 | 20/20 | 9,0 | 9,0 | 15,4 | 1,9 | 15,7 | 15,7 | 76,4 |
| pc_par2 | 40 | 40/40 | 26,2 | 26,5 | 45,9 | 3,1 | 48,3 | 48,3 | 49,7 |
| pc_v2 | 5 | 5/5 | 5,4 | 5,4 | 6,2 | 4,8 | 6,2 | 6,2 | 48,6 |
| pc_v2 | 10 | 10/10 | 6,6 | 6,2 | 10,1 | 2,5 | 10,1 | 10,1 | 59,4 |
| pc_v2 | 20 | 20/20 | 8,3 | 7,6 | 13,9 | 2,8 | 14,0 | 14,0 | 85,6 |
| pc_v2 | 40 | 40/40 | 22,8 | 23,6 | 38,4 | 4,0 | 38,8 | 38,8 | 61,9 |

## Perguntas do orientador (uma por vez)

| Máquina | Perguntas | Sucesso | Média (s) | Mediana (s) | P95 (s) | Máx (s) | Fora de escopo |
|---|---|---|---|---|---|---|---|
| notebook | 98 | 98 | 20,9 | 17,8 | 41,7 | 52,2 | 4 |
| pc_par1 | 98 | 98 | 1,5 | 1,2 | 3,1 | 3,8 | 3 |
| pc | 98 | 98 | 1,7 | 1,4 | 3,6 | 5,9 | 3 |
| pc_v2 | 98 | 98 | 1,5 | 1,4 | 3,0 | 4,5 | 3 |

### Tempo médio por categoria (s)

| Categoria | notebook | pc_par1 | pc | pc_v2 |
|---|---|---|---|---|
| Estágio | 22,6 | 1,9 | 2,2 | 2,0 |
| Biblioteca | 15,2 | 1,1 | 1,3 | 1,2 |
| Registro Acadêmico | 25,1 | 1,8 | 2,0 | 1,7 |
| Identificação do setor | 25,6 | 1,7 | 1,9 | 1,9 |
| Linguagem informal | 14,7 | 1,0 | 1,1 | 1,0 |
| Segurança e informações conflitantes | 18,6 | 1,3 | 1,5 | 1,4 |
| Fora do escopo (verificar) | 16,1 | 1,0 | 1,6 | 1,1 |
| Acompanhamento | 29,5 | 1,7 | 2,0 | 1,8 |

A avaliação das respostas (nota 0 a 2) é feita nos arquivos `<maquina>_qualidade.csv`.
