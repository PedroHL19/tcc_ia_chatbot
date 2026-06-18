import fs from "fs";

export function carregarBase() {
  const conteudo = fs.readFileSync(
    "./docs/faculdade.json",
    "utf-8"
  );

  return JSON.parse(conteudo);
}