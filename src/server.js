import express from "express";
import dotenv from "dotenv";

import { gemini } from "./geminiClient.js";
import { carregarBase } from "./knowledgeBase.js";

dotenv.config();

const app = express();

app.use(express.json());

app.post("/agente", async (req, res) => {
  try {
    const { mensagem } = req.body;

    const base = carregarBase();

    const prompt = `
Você é um assistente especializado em assuntos acadêmicos.

Responda SOMENTE utilizando a base de conhecimento abaixo.

Se não encontrar a informação, responda:
"Não encontrei essa informação na base de conhecimento."

BASE:

${JSON.stringify(base, null, 2)}

PERGUNTA:

${mensagem}
`;

    const response = await gemini.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt
    });

    res.json({
      sucesso: true,
      resposta: response.text
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      sucesso: false,
      erro: error.message
    });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log(
    `Servidor rodando na porta ${process.env.PORT || 3000}`
  );
});