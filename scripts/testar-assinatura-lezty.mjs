// Prova do verificador de assinatura, com os valores que a documentação
// descreve: HMAC-SHA256 sobre `t + "." + corpo_cru`, hex minúsculo,
// tolerância de 300 s, vários v1 durante a rotação.
const mod = await import(
  "../src/lib/lezty/webhook-signature.ts"
);
const { verificarAssinatura, TOLERANCIA_SEGUNDOS } = mod;

const SEGREDO_NOVO = "whsec_" + "n".repeat(43);
const SEGREDO_ANTIGO = "whsec_" + "a".repeat(43);

const corpo = JSON.stringify({
  id: "evt_teste",
  object: "event",
  type: "transaction.paid",
  mode: "test",
  created_at: "2026-11-17T00:00:00Z",
  data: { object: { id: "txn_teste", status: "paid", amount: 6700 } },
});

const agora = 1789041871;

async function assinar(segredo, t, mensagemCorpo) {
  const enc = new TextEncoder();
  const chave = await crypto.subtle.importKey(
    "raw",
    enc.encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const buf = await crypto.subtle.sign("HMAC", chave, enc.encode(`${t}.${mensagemCorpo}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const casos = [];
const ok = (nome, cond) => casos.push([nome, cond]);

// 1. assinatura legítima
const v1 = await assinar(SEGREDO_NOVO, agora, corpo);
let r = await verificarAssinatura(corpo, `t=${agora},v1=${v1}`, [SEGREDO_NOVO], agora);
ok("assinatura válida é aceita", r.valida === true);

// 2. corpo adulterado depois de assinado
r = await verificarAssinatura(
  corpo.replace("6700", "1"),
  `t=${agora},v1=${v1}`,
  [SEGREDO_NOVO],
  agora
);
ok("corpo adulterado é recusado", r.valida === false && r.motivo === "assinatura não confere");

// 3. corpo reserializado (parse + stringify) — o erro clássico
const reserializado = JSON.stringify(JSON.parse(corpo.replace(/"id"/, '"id"')));
const trocado = JSON.stringify({ data: JSON.parse(corpo).data, id: "evt_teste" });
r = await verificarAssinatura(trocado, `t=${agora},v1=${v1}`, [SEGREDO_NOVO], agora);
ok("corpo com chaves reordenadas é recusado", r.valida === false);
void reserializado;

// 4. segredo errado
r = await verificarAssinatura(corpo, `t=${agora},v1=${v1}`, [SEGREDO_ANTIGO], agora);
ok("segredo errado é recusado", r.valida === false);

// 5. rotação: assinado com o antigo, servidor conhece os dois
const v1Antigo = await assinar(SEGREDO_ANTIGO, agora, corpo);
r = await verificarAssinatura(
  corpo,
  `t=${agora},v1=${v1Antigo}`,
  [SEGREDO_NOVO, SEGREDO_ANTIGO],
  agora
);
ok("rotação: segredo anterior ainda vale", r.valida === true);

// 6. vários v1 no mesmo header (é o que a Lezty envia na rotação)
r = await verificarAssinatura(
  corpo,
  `t=${agora},v1=${v1Antigo},v1=${v1}`,
  [SEGREDO_NOVO],
  agora
);
ok("vários v1 no header: basta um bater", r.valida === true);

// 7. fora da tolerância, para trás e para a frente
r = await verificarAssinatura(corpo, `t=${agora},v1=${v1}`, [SEGREDO_NOVO], agora + TOLERANCIA_SEGUNDOS + 1);
ok("timestamp velho demais é recusado", r.valida === false && r.motivo === "timestamp fora da tolerância");
r = await verificarAssinatura(corpo, `t=${agora},v1=${v1}`, [SEGREDO_NOVO], agora - TOLERANCIA_SEGUNDOS - 1);
ok("timestamp adiantado demais é recusado", r.valida === false);

// 8. exatamente no limite ainda passa
r = await verificarAssinatura(corpo, `t=${agora},v1=${v1}`, [SEGREDO_NOVO], agora + TOLERANCIA_SEGUNDOS);
ok("limite exato da tolerância é aceito", r.valida === true);

// 9. headers ausentes ou malformados
r = await verificarAssinatura(corpo, null, [SEGREDO_NOVO], agora);
ok("sem header é recusado", r.valida === false);
r = await verificarAssinatura(corpo, "lixo", [SEGREDO_NOVO], agora);
ok("header malformado é recusado", r.valida === false);
r = await verificarAssinatura(corpo, `t=${agora}`, [SEGREDO_NOVO], agora);
ok("header sem v1 é recusado", r.valida === false);

// 10. ordem invertida dos campos no header
r = await verificarAssinatura(corpo, `v1=${v1},t=${agora}`, [SEGREDO_NOVO], agora);
ok("ordem dos campos do header não importa", r.valida === true);

// 11. hex em maiúsculas
r = await verificarAssinatura(corpo, `t=${agora},v1=${v1.toUpperCase()}`, [SEGREDO_NOVO], agora);
ok("hex em maiúsculas é aceito", r.valida === true);

let falhas = 0;
for (const [nome, passou] of casos) {
  console.log(`${passou ? "  ok  " : "FALHOU"}  ${nome}`);
  if (!passou) falhas++;
}
console.log(`\n${casos.length - falhas}/${casos.length} passaram`);
process.exit(falhas ? 1 : 0);
