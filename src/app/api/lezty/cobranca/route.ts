/**
 * Criação da cobrança PIX do checkout.
 *
 * Regra que não se negocia: **o valor é somado aqui**, a partir do catálogo
 * do servidor. O navegador manda apenas quais itens foram marcados. Se o
 * total viesse do cliente, qualquer pessoa com o console aberto compraria
 * por um centavo.
 */
import { criarCobrancaPix, chaveDeCobranca } from "@/lib/lezty/charges";
import { conferirAmbiente } from "@/lib/lezty/config";
import { LeztyApiError } from "@/lib/lezty/client";
import { somarPedido } from "@/lib/checkout/produtos";

export const dynamic = "force-dynamic";

interface CorpoPedido {
  nome?: string;
  email?: string;
  documento?: string;
  telefone?: string;
  extras?: string[];
  /** Qual oferta está sendo comprada (principal, resgate...). */
  oferta?: string;
  /** Identifica a tentativa; o cliente gera uma por sessão de checkout. */
  pedidoId?: string;
}

/**
 * Documento: confere os dígitos verificadores do CPF.
 *
 * A Lezty valida de verdade (devolve `invalid_document` para CPF com
 * dígito errado), então conferir aqui evita uma ida à API só para receber
 * um erro que já dava para dar na hora. CNPJ fica no teste de tamanho: a
 * loja vende para pessoa física, e CNPJ aqui é exceção rara.
 */
function documentoValido(doc: string): boolean {
  const d = doc.replace(/\D/g, "");
  if (d.length === 14) return true;
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;

  const digito = (ate: number) => {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(d[i]) * (ate + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return digito(9) === Number(d[9]) && digito(10) === Number(d[10]);
}

function emailValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export async function POST(req: Request): Promise<Response> {
  let corpo: CorpoPedido;
  try {
    corpo = (await req.json()) as CorpoPedido;
  } catch {
    return Response.json({ erro: "corpo inválido" }, { status: 400 });
  }

  const nome = (corpo.nome ?? "").trim();
  const email = (corpo.email ?? "").trim();
  const documento = (corpo.documento ?? "").replace(/\D/g, "");
  const telefone = (corpo.telefone ?? "").replace(/\D/g, "");

  if (nome.length < 2) {
    return Response.json({ erro: "Informe seu nome completo." }, { status: 400 });
  }
  if (!emailValido(email)) {
    return Response.json({ erro: "E-mail inválido." }, { status: 400 });
  }
  if (!documentoValido(documento)) {
    return Response.json(
      { erro: "CPF inválido. Confira os números." },
      { status: 400 }
    );
  }

  const extras = Array.isArray(corpo.extras)
    ? corpo.extras.filter((e): e is string => typeof e === "string")
    : [];

  // A oferta vem do cliente, mas o PREÇO não: quem resolve o id para
  // produto e valor é o catálogo do servidor. Id desconhecido cai na oferta
  // principal, e módulo que não pertence à oferta é descartado.
  const { itens, total, oferta } = somarPedido(extras, corpo.oferta);

  // A chave de idempotência é derivada do id do pedido: se o lead tocar duas
  // vezes no botão, ou a rede cair e o app repetir, a Lezty devolve a MESMA
  // cobrança em vez de gerar um segundo PIX.
  const pedidoId = (corpo.pedidoId ?? "").trim() || crypto.randomUUID();

  const urlWebhook = new URL("/api/lezty/webhook", req.url).toString();
  const postbackUrl = urlWebhook.startsWith("https://") ? urlWebhook : null;

  try {
    // Antes de qualquer chamada que cobre: chave de produção não roda local.
    await conferirAmbiente(req.url);

    const { dados: transacao, repetida } = await criarCobrancaPix(
      {
        amount: total,
        pix: { expires_in_seconds: 5 * 60 },
        customer: {
          name: nome,
          email,
          document: documento,
          ...(telefone ? { phone: telefone } : {}),
        },
        // Os três campos são obrigatórios e os nomes foram confirmados na
        // própria API (ela devolve o `param` que faltou): name, quantity e
        // unit_amount — não `unit_price`, que é como outras APIs chamam.
        items: itens.map((i) => ({
          name: i.nome,
          quantity: 1,
          unit_amount: i.preco,
        })),
        metadata: {
          pedido: pedidoId,
          oferta: oferta.id,
          extras: extras.join(",").slice(0, 500) || "nenhum",
        },
        // Em desenvolvimento a origem é http://localhost, que a Lezty
        // recusa ("precisa ser https e público"). Fora de https o campo
        // simplesmente não vai: o endpoint cadastrado no painel continua
        // recebendo os eventos, então nada se perde no teste local.
        ...(postbackUrl ? { postback_url: postbackUrl } : {}),
      },
      chaveDeCobranca(pedidoId)
    );

    return Response.json({
      id: transacao.id,
      status: transacao.status,
      total,
      oferta: oferta.id,
      repetida,
      pix: {
        payload: transacao.pix?.payload ?? null,
        qr_base64: transacao.pix?.qr_base64 ?? null,
        expires_at: transacao.pix?.expires_at ?? null,
      },
    });
  } catch (erro) {
    if (erro instanceof LeztyApiError) {
      // O `code` vai para o log, nunca para a tela: mensagem de gateway
      // costuma ser técnica demais e, pior, pode citar dado de configuração.
      console.error(
        "[lezty] falha ao criar cobrança:",
        erro.code,
        "request_id:",
        erro.requestId
      );
      const temporario =
        erro.status === 429 || erro.status === 503 || erro.status >= 500;
      return Response.json(
        {
          erro: temporario
            ? "O banco não respondeu agora. Tente de novo em alguns segundos."
            : "Não foi possível gerar o PIX com estes dados.",
          codigo: erro.code,
        },
        { status: temporario ? 503 : 400 }
      );
    }

    // Mensagem no log, não na tela. O caso mais comum aqui é configuração
    // ausente (LEZTY_API_KEY), e esconder isso do próprio desenvolvedor faz
    // perder tempo com um 500 mudo. As mensagens de config.ts nunca contêm
    // a chave, só o nome da variável.
    console.error(
      "[lezty] erro inesperado ao criar cobrança:",
      erro instanceof Error ? erro.message : "desconhecido"
    );
    return Response.json(
      { erro: "Não foi possível gerar o PIX agora." },
      { status: 500 }
    );
  }
}
