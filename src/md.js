import fs from "fs";
import { PDFParse } from "pdf-parse";

const dataBuffer = fs.readFileSync("./docs/arquivo.pdf");

const parser = new PDFParse({ data: dataBuffer });

const result = await parser.getText();

fs.writeFileSync("./docs/arquivo.md", result.text, "utf8");

console.log("Markdown gerado!");