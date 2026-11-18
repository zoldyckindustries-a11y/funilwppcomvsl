/**
 * Instala os segredos da Lezty Pay no cofre da Cloudflare.
 *
 * Por que não basta pôr no `.env.local`: aquele arquivo é da sua máquina.
 * O Worker em produção não o enxerga — ele lê os bindings que a Cloudflare
 * injeta, e é `wrangler secret put` que os coloca lá. O valor fica no cofre
 * da conta, nunca no repositório, e não aparece em `wrangler.jsonc`, em
 * build nem em log.
 *
 * Uso:
 *   npx wrangler login                        (uma vez, abre o navegador)
 *   node scripts/instalar-segredos-lezty.mjs  (pede cada valor e instala)
 *
 * A chave é digitada/colada no prompt, não passa por argumento de linha de
 * comando — argumento fica no histórico do shell e na lista de processos.
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const SEGREDOS = [
  {
    nome: "LEZTY_API_KEY",
    descricao: "Chave da API (sk_live_ para produção)",
    formato: /^sk_(test|live)_[A-Za-z0-9]{43}$/,
    dica: "sk_live_ ou sk_test_ seguido de 43 caracteres",
  },
  {
    nome: "LEZTY_WEBHOOK_SECRET",
    descricao: "Segredo do endpoint de webhook",
    formato: /^whsec_.{43}$/,
    dica: "whsec_ seguido de 43 caracteres",
  },
];

function instalar(nome, valor) {
  return new Promise((resolve, reject) => {
    const p = spawn("npx", ["wrangler", "secret", "put", nome], {
      stdio: ["pipe", "inherit", "inherit"],
      shell: process.platform === "win32",
    });
    p.stdin.write(valor + "\n");
    p.stdin.end();
    p.on("close", (codigo) =>
      codigo === 0 ? resolve() : reject(new Error(`wrangler saiu com ${codigo}`))
    );
  });
}

const rl = createInterface({ input: stdin, output: stdout });

console.log("Instalação dos segredos da Lezty Pay no cofre da Cloudflare.");
console.log("Rode `npx wrangler login` antes, se ainda não fez.\n");

for (const segredo of SEGREDOS) {
  const valor = (await rl.question(`${segredo.descricao}\n  ${segredo.nome}: `)).trim();

  if (!valor) {
    console.log("  (pulado)\n");
    continue;
  }
  if (!segredo.formato.test(valor)) {
    console.log(`  Formato inesperado. Esperado: ${segredo.dica}. Pulando.\n`);
    continue;
  }
  if (segredo.nome === "LEZTY_API_KEY" && valor.startsWith("sk_live_")) {
    const ok = (
      await rl.question("  Esta é uma chave de PRODUÇÃO. Confirma? (s/N) ")
    ).trim().toLowerCase();
    if (ok !== "s") {
      console.log("  (cancelado)\n");
      continue;
    }
  }

  await instalar(segredo.nome, valor);
  console.log(`  ${segredo.nome} instalado.\n`);
}

rl.close();

console.log("Pronto. Para publicar com os segredos já no lugar:");
console.log("  npm run build:cf && npm run deploy:cf");
