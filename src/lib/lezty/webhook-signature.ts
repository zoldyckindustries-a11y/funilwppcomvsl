/**
 * Verificação da assinatura das entregas de webhook.
 *
 * Tudo aqui segue o texto literal da documentação (/webhooks/assinatura):
 *
 *   - header `X-Signature`, no formato `t=<unix>,v1=<hex>`;
 *   - `v1` é "o HMAC-SHA256, em hexadecimal minúsculo";
 *   - a mensagem assinada é `t + "." + corpo_cru`;
 *   - "O corpo_cru são os bytes exatos que chegaram na requisição";
 *   - "Recuse a entrega se |agora - t| > 300 segundos";
 *   - durante a rotação do segredo chegam vários `v1=` na mesma assinatura.
 *
 * Duas consequências práticas que o código precisa respeitar:
 *
 * 1. O corpo tem de ser lido como texto ANTES de qualquer desserialização.
 *    `JSON.parse` seguido de `JSON.stringify` devolve outros bytes (ordem de
 *    chaves, espaços, escapes) e a assinatura não bate mais.
 * 2. A comparação é em tempo constante. Comparar com `===` vaza, pelo tempo
 *    de resposta, quantos caracteres do prefixo estavam certos, e isso é
 *    suficiente para forjar uma assinatura byte a byte.
 */

/** Tolerância de relógio, em segundos. */
export const TOLERANCIA_SEGUNDOS = 300;

export type ResultadoVerificacao =
  | { valida: true; timestamp: number }
  | { valida: false; motivo: string };

interface AssinaturaAnalisada {
  t: number;
  v1: string[];
}

/** Lê `t=...,v1=...[,v1=...]` sem supor ordem nem quantidade. */
function analisar(cabecalho: string): AssinaturaAnalisada | null {
  let t: number | null = null;
  const v1: string[] = [];

  for (const parte of cabecalho.split(",")) {
    const igual = parte.indexOf("=");
    if (igual === -1) continue;
    const chave = parte.slice(0, igual).trim();
    const valor = parte.slice(igual + 1).trim();
    if (chave === "t") {
      const n = Number(valor);
      if (Number.isFinite(n)) t = n;
    } else if (chave === "v1" && valor) {
      v1.push(valor.toLowerCase());
    }
  }

  if (t === null || v1.length === 0) return null;
  return { t, v1 };
}

function paraHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let saida = "";
  for (const b of bytes) saida += b.toString(16).padStart(2, "0");
  return saida;
}

/**
 * Comparação em tempo constante.
 *
 * Percorre o comprimento inteiro sempre, sem sair no primeiro byte
 * diferente. Comprimentos diferentes já reprovam, e isso não vaza nada que
 * o próprio formato da assinatura não entregue.
 */
function iguaisEmTempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) {
    diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diferenca === 0;
}

async function hmacHex(segredo: string, mensagem: string): Promise<string> {
  const codificador = new TextEncoder();
  const chave = await crypto.subtle.importKey(
    "raw",
    codificador.encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const assinatura = await crypto.subtle.sign(
    "HMAC",
    chave,
    codificador.encode(mensagem)
  );
  return paraHex(assinatura);
}

/**
 * Verifica a assinatura de uma entrega.
 *
 * @param corpoCru  o corpo exatamente como chegou, em texto
 * @param cabecalho o valor do header `X-Signature`
 * @param segredos  o segredo do endpoint; durante a rotação, o novo e o
 *                  antigo (a Lezty aceita o anterior por 24 h)
 * @param agora     instante de referência em segundos, para teste
 */
export async function verificarAssinatura(
  corpoCru: string,
  cabecalho: string | null,
  segredos: string[],
  agora: number = Math.floor(Date.now() / 1000)
): Promise<ResultadoVerificacao> {
  if (!cabecalho) {
    return { valida: false, motivo: "sem header X-Signature" };
  }

  const analisada = analisar(cabecalho);
  if (!analisada) {
    return { valida: false, motivo: "X-Signature malformado" };
  }

  // A janela vale nos dois sentidos: relógio adiantado também reprova.
  if (Math.abs(agora - analisada.t) > TOLERANCIA_SEGUNDOS) {
    return { valida: false, motivo: "timestamp fora da tolerância" };
  }

  const mensagem = `${analisada.t}.${corpoCru}`;

  // Percorre todas as combinações sem interromper no primeiro acerto: o
  // custo é desprezível (no máximo dois segredos) e o tempo de resposta
  // deixa de depender de qual delas bateu.
  let bateu = false;
  for (const segredo of segredos) {
    const esperada = await hmacHex(segredo, mensagem);
    for (const candidata of analisada.v1) {
      if (iguaisEmTempoConstante(esperada, candidata)) bateu = true;
    }
  }

  if (!bateu) return { valida: false, motivo: "assinatura não confere" };
  return { valida: true, timestamp: analisada.t };
}
