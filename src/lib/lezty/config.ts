/**
 * Segredos da Lezty Pay.
 *
 * Nada aqui tem valor embutido no código. A chave de API e o segredo de
 * webhook vivem em variável de ambiente (`.env.local` no desenvolvimento,
 * `wrangler secret put` em produção) e só o servidor as lê. Nenhuma delas
 * pode ter o prefixo NEXT_PUBLIC_: isso as embutiria no bundle do navegador.
 *
 * A base é a mesma nos dois ambientes — quem decide se o dinheiro é de
 * verdade é o prefixo da chave (`sk_test_` ou `sk_live_`).
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const LEZTY_BASE_URL = "https://api.leztypay.com";

/** Prefixo + 43 caracteres alfanuméricos, conforme a documentação. */
const FORMATO_CHAVE = /^sk_(test|live)_[A-Za-z0-9]{43}$/;
const FORMATO_SEGREDO_WEBHOOK = /^whsec_.{43}$/;

/**
 * Lê uma variável de ambiente nos dois mundos em que este projeto roda: o
 * `next dev` em Node e o Worker na Cloudflare, onde os bindings chegam pelo
 * contexto do OpenNext em vez de `process.env`.
 */
async function lerSegredo(nome: string): Promise<string | undefined> {
  const doProcesso = process.env[nome];
  if (doProcesso) return doProcesso;

  try {
    const { env } = await getCloudflareContext({ async: true });
    const valor = (env as unknown as Record<string, unknown>)[nome];
    return typeof valor === "string" && valor ? valor : undefined;
  } catch {
    // Fora do Worker (build, script avulso) não há contexto — e aí só
    // process.env mesmo.
    return undefined;
  }
}

export type AmbienteLezty = "test" | "live";

export interface CredenciaisLezty {
  chave: string;
  ambiente: AmbienteLezty;
}

/**
 * Credenciais da API.
 *
 * Falha alto e cedo quando a chave está ausente ou malformada: um 401
 * `invalid_api_key` no meio de um checkout é muito mais caro de diagnosticar
 * do que um erro na primeira chamada.
 */
export async function credenciais(): Promise<CredenciaisLezty> {
  const chave = await lerSegredo("LEZTY_API_KEY");

  if (!chave) {
    throw new Error(
      "LEZTY_API_KEY não está definida. Defina em .env.local (dev) ou " +
        "com `wrangler secret put LEZTY_API_KEY` (produção)."
    );
  }
  if (!FORMATO_CHAVE.test(chave)) {
    // A mensagem nunca mostra a chave, nem um pedaço dela: mensagem de erro
    // é um dos lugares onde ela não pode aparecer.
    throw new Error(
      "LEZTY_API_KEY está fora do formato esperado (sk_test_ ou sk_live_ " +
        "seguido de 43 caracteres alfanuméricos)."
    );
  }

  return {
    chave,
    ambiente: chave.startsWith("sk_live_") ? "live" : "test",
  };
}

/**
 * Trava de segurança: chave de produção não roda em máquina local.
 *
 * O acidente que isto evita é específico e caro: alguém cola a `sk_live_` no
 * `.env.local` para "testar rapidinho", e cada clique no checkout passa a
 * gerar cobrança de verdade, com dinheiro de verdade entrando e precisando
 * ser estornado depois.
 *
 * Em produção a origem é o domínio real, então a trava não encosta no
 * caminho que importa. Quem precisar mesmo rodar a chave de produção contra
 * localhost (um teste de homologação, por exemplo) define
 * `LEZTY_PERMITIR_LIVE_LOCAL=1` e assume a conta.
 */
export async function conferirAmbiente(origem: string): Promise<void> {
  const { ambiente } = await credenciais();
  if (ambiente !== "live") return;

  const local = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(origem);
  if (!local) return;

  if ((await lerSegredo("LEZTY_PERMITIR_LIVE_LOCAL")) === "1") return;

  throw new Error(
    "Chave de produção (sk_live_) sendo usada em ambiente local. Isso " +
      "criaria cobranças reais. Use a chave sk_test_ no .env.local, ou " +
      "defina LEZTY_PERMITIR_LIVE_LOCAL=1 se for mesmo intencional."
  );
}

/** Segredo do endpoint de webhook (`whsec_` + 43 caracteres). */
export async function segredosWebhook(): Promise<string[]> {
  const atual = await lerSegredo("LEZTY_WEBHOOK_SECRET");
  // Durante a rotação, a Lezty aceita o segredo antigo por 24 h e envia os
  // dois `v1=` na mesma assinatura. Manter o anterior numa segunda variável
  // permite girar o segredo sem derrubar entrega nenhuma.
  const anterior = await lerSegredo("LEZTY_WEBHOOK_SECRET_ANTERIOR");

  const lista = [atual, anterior].filter(
    (s): s is string => typeof s === "string" && s.length > 0
  );

  if (lista.length === 0) {
    throw new Error(
      "LEZTY_WEBHOOK_SECRET não está definida. Sem ela não há como " +
        "verificar a assinatura das entregas."
    );
  }
  for (const segredo of lista) {
    if (!FORMATO_SEGREDO_WEBHOOK.test(segredo)) {
      throw new Error(
        "Um dos segredos de webhook está fora do formato esperado " +
          "(whsec_ seguido de 43 caracteres)."
      );
    }
  }

  return lista;
}
