const m = await import("../src/lib/checkout/produtos.ts");
const casos = [
  [[], 3790, "só o principal"],
  [["vitalicio"], 4580, "principal + vitalício"],
  [["vitalicio", "gpsfind"], 6370, "principal + vitalício + gpsfind"],
  [["instaspy"], 7580, "principal + instaspy"],
  [["vitalicio","recuperacao","gpsfind","camremota","instaspy"], 14440, "tudo"],
  [["nao-existe"], 3790, "id desconhecido é ignorado"],
  [["vitalicio","vitalicio"], 4580, "id repetido não soma duas vezes"],
];
let falhas = 0;
for (const [extras, esperado, nome] of casos) {
  const { total } = m.somarPedido(extras);
  const ok = total === esperado;
  console.log(`${ok ? "  ok  " : "FALHOU"}  ${nome}: ${m.emReais(total)}${ok ? "" : ` (esperado ${m.emReais(esperado)})`}`);
  if (!ok) falhas++;
}
process.exit(falhas ? 1 : 0);
