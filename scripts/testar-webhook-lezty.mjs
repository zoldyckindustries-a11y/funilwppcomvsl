// Prova do ENDPOINT (não só da função): assina um corpo com o segredo falso
// do .env.local e confere o que a rota responde em cada cenário.
// O segredo sai do .env.local, que é o mesmo que o servidor lê. Fixá-lo
// aqui faria o teste passar com um valor que a aplicação não usa — e o dia
// em que os dois divergissem, o teste continuaria verde.
import fs from "node:fs";

const SEGREDO = fs
  .readFileSync(".env.local", "utf8")
  .match(/LEZTY_WEBHOOK_SECRET=(\S+)/)?.[1];

if (!SEGREDO) {
  console.error("LEZTY_WEBHOOK_SECRET não encontrado em .env.local");
  process.exit(1);
}

const URL = "http://localhost:3000/api/lezty/webhook";

const corpo = JSON.stringify({
  id: "evt_prova_" + Date.now(),
  object: "event",
  type: "transaction.paid",
  mode: "test",
  created_at: new Date().toISOString(),
  data: { object: { id: "txn_prova", status: "paid", amount: 6700 } },
});

async function assinar(segredo, t, body) {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey(
    "raw",
    enc.encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const buf = await crypto.subtle.sign("HMAC", k, enc.encode(`${t}.${body}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function enviar(rotulo, { body, sig, eventId }) {
  const headers = { "Content-Type": "application/json" };
  if (sig) headers["X-Signature"] = sig;
  if (eventId) headers["X-Event-Id"] = eventId;
  const t0 = Date.now();
  const r = await fetch(URL, { method: "POST", headers, body });
  const ms = Date.now() - t0;
  const texto = await r.text();
  console.log(
    `${String(r.status).padEnd(4)} ${String(ms + "ms").padEnd(8)} ${rotulo}` +
      (texto ? `  -> ${texto.slice(0, 40)}` : "")
  );
  return r.status;
}

const agora = Math.floor(Date.now() / 1000);
const sigValida = `t=${agora},v1=${await assinar(SEGREDO, agora, corpo)}`;

const r1 = await enviar("sem X-Signature", { body: corpo });
const r2 = await enviar("assinatura inventada", {
  body: corpo,
  sig: `t=${agora},v1=${"0".repeat(64)}`,
});
const velho = agora - 3600;
const r3 = await enviar("timestamp de 1h atrás", {
  body: corpo,
  sig: `t=${velho},v1=${await assinar(SEGREDO, velho, corpo)}`,
});
const r4 = await enviar("corpo alterado após assinar", {
  body: corpo.replace("6700", "100"),
  sig: sigValida,
});
const r5 = await enviar("assinatura válida (1ª entrega)", { body: corpo, sig: sigValida });
const r6 = await enviar("mesma entrega repetida (dedup)", { body: corpo, sig: sigValida });

const esperado = [
  ["sem assinatura recusa", r1 === 400],
  ["assinatura falsa recusa", r2 === 400],
  ["timestamp fora da janela recusa", r3 === 400],
  ["corpo adulterado recusa", r4 === 400],
  ["entrega legítima é aceita", r5 === 202],
  ["repetição é deduplicada", r6 === 204],
];
let falhas = 0;
console.log("");
for (const [nome, ok] of esperado) {
  console.log(`${ok ? "  ok  " : "FALHOU"}  ${nome}`);
  if (!ok) falhas++;
}
console.log(`\n${esperado.length - falhas}/${esperado.length} passaram`);
process.exit(falhas ? 1 : 0);
