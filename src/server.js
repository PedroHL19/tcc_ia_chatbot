import express from "express";
import dotenv from "dotenv";
import { AGENT_PROMPT } from "./prompt.js";
import { openai } from "./openaiClient.js";

dotenv.config();

const app = express();
app.use(express.json());

// Rota leve para acordar/testar a API
app.get("/health", (req, res) => {
  return res.status(200).json({
    sucesso: true,
    status: "ok",
    mensagem: "API acordada"
  });
});

app.post("/agente", async (req, res) => {
  try {
    const { mensagem } = req.body;

    if (!mensagem) {
      return res.status(400).json({
        sucesso: false,
        erro: "Campo 'mensagem' é obrigatório."
      });
    }

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      instructions: AGENT_PROMPT,
      input: mensagem,
      tools: [
        {
          type: "file_search",
          vector_store_ids: [process.env.VECTOR_STORE_ID]
        }
      ]
    });

    return res.json({
      sucesso: true,
      resposta: response.output_text
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      sucesso: false,
      erro: "Erro ao consultar agente."
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});