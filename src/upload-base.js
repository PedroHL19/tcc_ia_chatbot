import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { openai } from "./openaiClient.js";

dotenv.config();

const docsPath = "./docs";

async function uploadBase() {
  const vectorStore = await openai.vectorStores.create({
    name: "Base de conhecimento - Agente"
  });

  console.log("Vector Store criada:");
  console.log(vectorStore.id);

  const files = fs
    .readdirSync(docsPath)
    .filter((fileName) => fileName.endsWith(".md"))
    .map((fileName) => path.join(docsPath, fileName));

  if (files.length === 0) {
    console.log("Nenhum arquivo .md encontrado na pasta docs.");
    return;
  }

  const fileStreams = files.map((filePath) => fs.createReadStream(filePath));

  const batch = await openai.vectorStores.fileBatches.uploadAndPoll(
    vectorStore.id,
    {
      files: fileStreams
    }
  );

  console.log("Upload finalizado:");
  console.log(batch);
  console.log(`VECTOR_STORE_ID=${vectorStore.id}`);
}

uploadBase().catch(console.error);