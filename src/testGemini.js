import { gemini } from "./geminiClient.js";

const response = await gemini.models.generateContent({
  model: "gemini-2.5-flash",
  contents: "O que é uma faculdade?"
});

console.log(response.text);