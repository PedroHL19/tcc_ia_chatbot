# Chatbot Acadêmico RAG — IFMG Campus Sabará

API em Node/Express que responde dúvidas acadêmicas (Estágios, CRA, Biblioteca, PPCs) usando RAG local:
embeddings `bge-m3` e LLM Llama via **Ollama**, busca vetorial no **Qdrant** e integração com o **Blip** pela rota `POST /agente`.

## Requisitos

- Node.js 18+
- Ollama com os modelos `bge-m3` e o LLM configurado (`ollama pull bge-m3`, `ollama pull llama3.1:8b`)
- Qdrant rodando (ex.: `docker run -p 6333:6333 qdrant/qdrant`)

## Configuração

```bash
npm install
cp .env.example .env   # preencha API_KEY com uma chave aleatória
```

## Uso

```bash
npm run ingest     # indexa docs/base_conhecimento no Qdrant
npm start          # sobe a API na porta PORT
npm run test:bot   # roda a bateria de 20 perguntas e salva em benchmark_runs.json
```

## API

`POST /agente` com header `Authorization: Key <API_KEY>`:

```json
{ "mensagem": "Quantas horas de atividades complementares preciso?", "curso": "BSI", "ano": "2023" }
```

Resposta: `{ sucesso, encontrou_resposta, fora_de_escopo, resposta, perfil }`.
O curso aceita códigos (`BSI`, `LOGISTICA`, `PROCESSOS_GERENCIAIS`, `ENG_AUTOMACAO`, `ADMINISTRACAO`) ou o nome por extenso.

## Base de conhecimento

Arquivos `.md` em `docs/base_conhecimento/` com frontmatter opcional:

```yaml
---
curso: BSI          # ou TODOS
ano_min: 2023       # 0 = sem limite
ano_max: 9999       # 9999 = matriz vigente
tipo: normativo_curso
---
```
