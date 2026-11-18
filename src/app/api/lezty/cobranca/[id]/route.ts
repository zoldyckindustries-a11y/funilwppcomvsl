/**
 * Situação de uma cobrança, para a tela do PIX saber quando o pagamento caiu.
 *
 * Consulta a API a cada chamada em vez de ler um estado local: é a mesma
 * reconciliação que o webhook faz, e é o que garante que a tela não dependa
 * da entrega do webhook ter chegado primeiro.
 *
 * Devolve só o necessário para a tela. A transação inteira traz taxa, valor
 * líquido e dados do adquirente, que não têm por que trafegar até o
 * navegador do comprador.
 */
import { consultarTransacao } from "@/lib/lezty/charges";
import { LeztyApiError } from "@/lib/lezty/client";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;

  if (!id || !/^[A-Za-z0-9_\-]{1,100}$/.test(id)) {
    return Response.json({ erro: "id inválido" }, { status: 400 });
  }

  try {
    const { dados: transacao } = await consultarTransacao(id);

    return Response.json({
      id: transacao.id,
      status: transacao.status,
      pago: transacao.status === "paid",
      paid_at: transacao.paid_at,
      expires_at: transacao.pix?.expires_at ?? null,
    });
  } catch (erro) {
    if (erro instanceof LeztyApiError) {
      // 404 é id de outro ambiente ou de outra conta. 400 `validation_failed`
      // é id fora do formato (a API responde "invalid id"). Os dois são
      // "esta cobrança não existe para você" — devolver 503 neles faria a
      // tela de pagamento ficar consultando para sempre um id que nunca vai
      // existir.
      if (erro.status === 404 || erro.status === 400) {
        return Response.json({ erro: "cobrança não encontrada" }, { status: 404 });
      }
      console.error("[lezty] falha ao consultar", id, erro.code);
      return Response.json({ erro: "consulta indisponível" }, { status: 503 });
    }
    return Response.json({ erro: "consulta indisponível" }, { status: 503 });
  }
}
