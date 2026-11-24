// Converte os PNG de `public/` para WebP.
//
// As artes do funil somavam ~5 MB em PNG: cinco avatares de 250 KB numa
// lista de conversas, seis prints de galeria de até 670 KB. Em 4G lenta
// isso é a maior parte do que o celular baixa depois da primeira tela.
// WebP com qualidade 82 corta 70% a 90% disso sem diferença visível em
// 64 px de avatar nem em print de tela.
//
// O script NÃO apaga o PNG de origem — ele só escreve o `.webp` ao lado.
// Os PNG que já foram convertidos saíram do repositório à mão, porque
// ninguém os lê em runtime e eles respondiam por 93% do peso de `public/`.
// Se precisar reconverter com outra qualidade, traga a arte original de
// volta para a pasta e rode de novo.
//
// Uso: node scripts/converter-imagens.mjs
//      node scripts/converter-imagens.mjs --qualidade 90

import sharp from "sharp";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PASTAS = ["avatares", "wppgalery", "produtos", "icon", "."];

const argQualidade = process.argv.indexOf("--qualidade");
const QUALIDADE =
  argQualidade > -1 ? Number(process.argv[argQualidade + 1]) : 82;

let antes = 0;
let depois = 0;
let convertidos = 0;

for (const pasta of PASTAS) {
  const dir = path.join(RAIZ, "public", pasta);
  let itens;
  try {
    itens = await readdir(dir, { withFileTypes: true });
  } catch {
    continue;
  }

  for (const item of itens) {
    if (!item.isFile() || !/\.png$/i.test(item.name)) continue;

    const entrada = path.join(dir, item.name);
    const saida = entrada.replace(/\.png$/i, ".webp");

    const origem = await stat(entrada);
    await sharp(entrada).webp({ quality: QUALIDADE, effort: 6 }).toFile(saida);
    const destino = await stat(saida);

    antes += origem.size;
    depois += destino.size;
    convertidos++;

    const corte = (1 - destino.size / origem.size) * 100;
    console.log(
      `${path.join(pasta, item.name).replace(/^\.[\\/]/, "")}  ` +
        `${(origem.size / 1024).toFixed(0)} KB -> ` +
        `${(destino.size / 1024).toFixed(0)} KB  (-${corte.toFixed(0)}%)`
    );
  }
}

console.log(
  `\n${convertidos} arquivos  ` +
    `${(antes / 1024 / 1024).toFixed(2)} MB -> ` +
    `${(depois / 1024 / 1024).toFixed(2)} MB  ` +
    `(-${((1 - depois / antes) * 100).toFixed(0)}%)`
);
