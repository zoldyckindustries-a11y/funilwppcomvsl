/**
 * Bateria de integração contra o ambiente de TESTE da Lezty Pay.
 *
 * Precisa do `next dev` no ar e de LEZTY_API_KEY (sk_test_) no .env.local.
 * Nada aqui move dinheiro: o prefixo sk_test_ já garante isso.
 *
 * Os finais de valor que decidem o resultado estão na documentação: `01`
 * nunca paga e expira, `03` já nasce recusada. Os demais pagam poucos
 * segundos depois de criados — é por isso que o teste do caminho feliz
 * espera antes de conferir.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";

const cliente = {
  nome: "Joao da Silva",
  email: "joao@exemplo.com",
  documento: "11144477735",
  telefone: "43999998888",
};

/**
 * O `next dev` do Next 15.5 devolve 404 ou 500 na primeira requisição depois
 * de recompilar uma rota, e volta ao normal na seguinte. Sem uma tentativa
 * extra, o teste acusa falha onde o código está certo.
 */
async function pedir(url, init, tentativas = 3) {
  for (let i = 1; i <= tentativas; i++) {
    const r = await fetch(url, init);
    const texto = await r.text();
    const transitorio = (r.status === 404 || r.status === 500) &&
      texto.trimStart().startsWith("<");
    if (!transitorio || i === tentativas) {
      try {
        return { status: r.status, corpo: JSON.parse(texto) };
      } catch {
        return { status: r.status, corpo: { erro: "resposta não-JSON" } };
      }
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
}

let falhas = 0;
function checar(nome, condicao, detalhe = "") {
  console.log(`${condicao ? "  ok  " : "FALHOU"}  ${nome}${detalhe ? `  ${detalhe}` : ""}`);
  if (!condicao) falhas++;
}

async function criar(extras, pedidoId, oferta) {
  return pedir(`${BASE}/api/lezty/cobranca`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...cliente, extras, pedidoId, oferta }),
  });
}

async function consultar(id) {
  return pedir(`${BASE}/api/lezty/cobranca/${id}`, { cache: "no-store" });
}

const marca = Date.now();

// ─── 1. Criação simples ────────────────────────────────────────────────
const a = await criar([], `it-simples-${marca}`);
checar("cria cobrança do produto principal", a.status === 200 && a.corpo.total === 3790,
  a.corpo.id ?? JSON.stringify(a.corpo));
checar("devolve copia e cola", typeof a.corpo?.pix?.payload === "string" && a.corpo.pix.payload.startsWith("0002"));
checar("devolve prazo de expiração", !!a.corpo?.pix?.expires_at);
checar("nasce pendente", a.corpo?.status === "pending");

// ─── 2. Idempotência ───────────────────────────────────────────────────
const b = await criar([], `it-simples-${marca}`);
checar("mesma chave devolve a MESMA cobrança", b.corpo?.id === a.corpo?.id,
  `${a.corpo?.id} vs ${b.corpo?.id}`);
checar("marca a resposta como repetida", b.corpo?.repetida === true);

// ─── 3. Soma com order bumps ───────────────────────────────────────────
const c = await criar(["vitalicio", "gpsfind"], `it-bumps-${marca}`);
checar("soma os bumps no servidor", c.corpo?.total === 6370, `${c.corpo?.total} centavos`);

// ─── 4. Valor não vem do cliente ───────────────────────────────────────
const r4 = await pedir(`${BASE}/api/lezty/cobranca`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ ...cliente, extras: [], amount: 1, total: 1, pedidoId: `it-burla-${marca}` }),
});
checar("ignora valor enviado pelo cliente", r4.corpo.total === 3790, `${r4.corpo.total} centavos`);

// ─── 4b. Oferta de retorno ─────────────────────────────────────────────
const resgate = await criar([], `it-resgate-${marca}`, "resgate");
checar("oferta de resgate custa R$ 17,90", resgate.corpo?.total === 1790,
  `${resgate.corpo?.total} centavos`);
checar("resposta identifica a oferta", resgate.corpo?.oferta === "resgate");

// Módulos não pertencem à oferta de resgate: mandá-los não pode inflar o
// pedido nem criar um carrinho que não existe em lugar nenhum.
const resgateComBumps = await criar(
  ["vitalicio", "instaspy"],
  `it-resgate-bumps-${marca}`,
  "resgate"
);
checar("resgate ignora módulos de outra oferta", resgateComBumps.corpo?.total === 1790,
  `${resgateComBumps.corpo?.total} centavos`);

const ofertaInventada = await criar([], `it-oferta-falsa-${marca}`, "gratis");
checar("oferta inexistente cai na principal", ofertaInventada.corpo?.total === 3790,
  `${ofertaInventada.corpo?.total} centavos`);

// ─── 5. Consulta por id ────────────────────────────────────────────────
const d = await consultar(a.corpo.id);
checar("consulta devolve a cobrança", d.status === 200 && d.corpo.id === a.corpo.id);
checar("consulta informa se pagou", typeof d.corpo.pago === "boolean");

// Id no formato certo (txn_ + 26 caracteres) mas que não existe: é o caso
// que acontece de verdade quando alguém mexe na URL ou usa um id de outro
// ambiente. Um id malformado testaria outra coisa.
const inexistente = await consultar("txn_00000000000000000000000000");
checar("id válido inexistente devolve 404", inexistente.status === 404,
  `veio ${inexistente.status}`);

const malformado = await consultar("txn_formato-errado");
checar("id malformado também devolve 404", malformado.status === 404,
  `veio ${malformado.status}`);

// ─── 6. Validação de entrada ───────────────────────────────────────────
for (const [rotulo, corpo] of [
  ["nome curto", { ...cliente, nome: "x" }],
  ["e-mail inválido", { ...cliente, email: "arroba-nenhum" }],
  ["CPF incompleto", { ...cliente, documento: "123" }],
]) {
  const r = await pedir(`${BASE}/api/lezty/cobranca`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...corpo, pedidoId: `it-val-${marca}-${rotulo}` }),
  });
  checar(`recusa ${rotulo}`, r.status === 400);
}

// ─── 7. Caminho feliz: a cobrança paga sozinha em poucos segundos ──────
process.stdout.write("        aguardando o pagamento de teste cair");
let pagou = false;
for (let i = 0; i < 12 && !pagou; i++) {
  await new Promise((r) => setTimeout(r, 2500));
  process.stdout.write(".");
  const s = await consultar(a.corpo.id);
  pagou = s.corpo?.pago === true;
}
console.log("");
checar("cobrança de teste chega a 'paid'", pagou);

console.log(`\n${falhas === 0 ? "tudo certo" : `${falhas} falha(s)`}`);
process.exit(falhas ? 1 : 0);
