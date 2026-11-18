/**
 * Cenários do ambiente de teste da Lezty Pay.
 *
 * O resultado de cada cobrança é escolhido pelos dois últimos dígitos do
 * valor. A documentação traz dois de forma literal:
 *
 *   "Terminando em `01` a cobrança nunca paga e expira."
 *   "Terminando em `03` a criação já volta recusada."
 *
 * Este script chama a API direto, sem passar pelo nosso checkout, porque os
 * valores aqui não correspondem a nenhum produto do catálogo — e o catálogo
 * é, de propósito, o único lugar de onde o valor de uma venda pode sair.
 *
 * Precisa de LEZTY_API_KEY (sk_test_) no .env.local. Nada aqui move dinheiro.
 */
import fs from "node:fs";

const chave = fs
  .readFileSync(".env.local", "utf8")
  .match(/LEZTY_API_KEY=(\S+)/)?.[1];

if (!chave?.startsWith("sk_test_")) {
  console.error(
    "Este script só roda com chave de teste. A chave em .env.local não é sk_test_."
  );
  process.exit(1);
}

const cliente = {
  name: "Joao da Silva",
  email: "joao@exemplo.com",
  document: "11144477735",
};

async function criar(amount, rotulo) {
  const r = await fetch("https://api.leztypay.com/v1/transactions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${chave}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `cenario:${rotulo}:${Date.now()}`,
    },
    body: JSON.stringify({ amount, customer: cliente }),
  });
  const texto = await r.text();
  let json = null;
  try {
    json = JSON.parse(texto);
  } catch {}
  return { status: r.status, json };
}

async function consultar(id) {
  const r = await fetch(`https://api.leztypay.com/v1/transactions/${id}`, {
    headers: { Authorization: `Bearer ${chave}` },
  });
  return r.ok ? r.json() : null;
}

let falhas = 0;
const checar = (nome, ok, detalhe = "") => {
  console.log(`${ok ? "  ok  " : "FALHOU"}  ${nome}${detalhe ? `  ${detalhe}` : ""}`);
  if (!ok) falhas++;
};

// ─── final 03: recusada já na criação ──────────────────────────────────
const recusada = await criar(3703, "recusa");
checar(
  "valor terminado em 03 é recusado na criação",
  recusada.status >= 400,
  `http ${recusada.status} ${recusada.json?.error?.code ?? ""}`
);

// ─── final 01: nasce pendente e nunca paga ─────────────────────────────
const expira = await criar(3701, "expira");
checar(
  "valor terminado em 01 é criado",
  expira.status === 201 || expira.status === 200,
  `http ${expira.status}`
);

if (expira.json?.id) {
  checar("nasce pendente", expira.json.status === "pending");
  console.log(`        acompanhando ${expira.json.id} por 20s`);
  let continuaPendente = true;
  for (let i = 0; i < 8; i++) {
    await new Promise((r) => setTimeout(r, 2500));
    const t = await consultar(expira.json.id);
    if (t && t.status !== "pending") {
      continuaPendente = false;
      console.log(`        virou ${t.status}`);
      break;
    }
  }
  checar("valor terminado em 01 não paga sozinho", continuaPendente);
}

// ─── final neutro: paga poucos segundos depois ─────────────────────────
const paga = await criar(3790, "paga");
checar("valor normal é criado", paga.status === 201 || paga.status === 200);

if (paga.json?.id) {
  console.log(`        acompanhando ${paga.json.id} até pagar`);
  let pagou = false;
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 2500));
    const t = await consultar(paga.json.id);
    if (t?.status === "paid") {
      pagou = true;
      console.log(`        pagou em ~${(i + 1) * 2.5}s · end_to_end_id ${t.end_to_end_id ?? "—"}`);
      break;
    }
  }
  checar("valor normal chega a 'paid'", pagou);
}

console.log(`\n${falhas === 0 ? "tudo certo" : `${falhas} falha(s)`}`);
process.exit(falhas ? 1 : 0);
