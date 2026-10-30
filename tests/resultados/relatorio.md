# Relatório de benchmark do chatbot

## Teste de carga (perguntas simultâneas)

Tempo de cada resposta, em segundos, com N perguntas enviadas ao mesmo tempo. Vazão = respostas por minuto no lote.

| Máquina | Simultâneas | Sucesso | Média | Mediana | P95 | Mín | Máx | Tempo do lote | Vazão (resp/min) |
|---|---|---|---|---|---|---|---|---|---|
| pc | 5 | 5/5 | 6,6 | 6,0 | 11,8 | 1,8 | 11,8 | 11,8 | 25,3 |
| pc | 10 | 10/10 | 9,8 | 8,2 | 17,4 | 1,0 | 17,4 | 17,4 | 34,5 |
| pc | 20 | 20/20 | 10,9 | 9,1 | 20,6 | 1,6 | 21,4 | 21,4 | 55,9 |
| pc | 40 | 40/40 | 40,7 | 39,2 | 70,9 | 2,4 | 72,8 | 72,8 | 33,0 |

## Perguntas do orientador (uma por vez)

| Máquina | Perguntas | Sucesso | Média (s) | Mediana (s) | P95 (s) | Máx (s) | Fora de escopo |
|---|---|---|---|---|---|---|---|
| pc | 98 | 98 | 1,7 | 1,4 | 3,6 | 5,9 | 3 |

### Tempo médio por categoria (s)

| Categoria | pc |
|---|---|
| Estágio | 2,2 |
| Biblioteca | 1,3 |
| Registro Acadêmico | 2,0 |
| Identificação do setor | 1,9 |
| Linguagem informal | 1,1 |
| Segurança e informações conflitantes | 1,5 |
| Fora do escopo (verificar) | 1,6 |
| Acompanhamento | 2,0 |

A avaliação das respostas (nota 0 a 2) é feita nos arquivos `<maquina>_qualidade.csv`.
