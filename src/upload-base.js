import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { openai } from "./openaiClient.js";

dotenv.config();

const docsPath = "./docs";

async function uploadBase() {function run(texto) {
    if (!texto) return "";

    try {
        var mascarar = function (valor, visiveisInicio, visiveisFim) {
            var totalDigitos = valor.replace(/\D/g, "").length;
            var i = -1;
            return valor.replace(/\d/g, function (d) {
                i++;
                if (i < visiveisInicio || i >= totalDigitos - visiveisFim) {
                    return d;
                }
                return "*";
            });
        };

        var resultado = texto;

        resultado = resultado.replace(
            /\d{3}\.?\s?\d{3}\.?\s?\d{3}\-?\s?\d{2}/g,
            function (m) {
                return mascarar(m, 0, 2);
            }
        );

        resultado = resultado.replace(
            /(\+?55\s?)?\(?\d{2}\)?[\s\-]?\d{4,5}[\s\-]?\d{4}/g,
            function (m) {
                return mascarar(m, 2, 2);
            }
        );

        resultado = resultado.replace(
            /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
            function (m) {
                var partes = m.split("@");
                var nome = partes[0];
                var dominio = partes[1];

                if (nome.length <= 2) {
                    return "*".repeat(nome.length) + "@" + dominio;
                }

                return (
                    nome.charAt(0) +
                    "*".repeat(nome.length - 2) +
                    nome.charAt(nome.length - 1) +
                    "@" +
                    dominio
                );
            }
        );

        resultado = resultado.replace(
            /\b(?:\d[ -]*?){13,19}\b/g,
            function (m) {
                return mascarar(m, 0, 4);
            }
        );

        return resultado;
    } catch (e) {
        return texto;
    }
}

  const vectorStore = await openai.vectorStores.create({
    name: "Base de conhecimento - Agente"
  });

  console.log("Vector Store criada:");
  console.log(vectorStore.id);

  const files = fs
    .readdirSync(docsPath)
    .map((fileName) => path.join(docsPath, fileName));

  const fileStreams = files.map((filePath) => fs.createReadStream(filePath));

  const batch = await openai.vectorStores.fileBatches.uploadAndPoll(
    vectorStore.id,
    {
      files: fileStreams
    }
  );

  console.log("Upload finalizado:");
  console.log(batch);

  console.log("\nColoque isso no seu .env:");
  console.log(`VECTOR_STORE_ID=${vectorStore.id}`);
}

uploadBase().catch(console.error);


function run(texto) {
    if (!texto) return "";

    try {
        var mascarar = function (valor, visiveisInicio, visiveisFim) {
            var totalDigitos = valor.replace(/\D/g, "").length;
            var i = -1;
            return valor.replace(/\d/g, function (d) {
                i++;
                if (i < visiveisInicio || i >= totalDigitos - visiveisFim) {
                    return d;
                }
                return "*";
            });
        };

        var resultado = texto;

        resultado = resultado.replace(
            /\d{3}\.?\s?\d{3}\.?\s?\d{3}\-?\s?\d{2}/g,
            function (m) {
                return mascarar(m, 0, 2);
            }
        );

        resultado = resultado.replace(
            /(\+?55\s?)?\(?\d{2}\)?[\s\-]?\d{4,5}[\s\-]?\d{4}/g,
            function (m) {
                return mascarar(m, 2, 2);
            }
        );

        resultado = resultado.replace(
            /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
            function (m) {
                var partes = m.split("@");
                var nome = partes[0];
                var dominio = partes[1];

                if (nome.length <= 2) {
                    return "*".repeat(nome.length) + "@" + dominio;
                }

                return (
                    nome.charAt(0) +
                    "*".repeat(nome.length - 2) +
                    nome.charAt(nome.length - 1) +
                    "@" +
                    dominio
                );
            }
        );

        resultado = resultado.replace(
            /\b(?:\d[ -]*?){13,19}\b/g,
            function (m) {
                return mascarar(m, 0, 4);
            }
        );

        return resultado;
    } catch (e) {
        return texto;
    }
}
