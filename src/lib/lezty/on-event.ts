/**
 * Ponto de entrada do SEU negócio.
 *
 * É aqui que entra o efeito de um pagamento: liberar o acesso, mandar o
 * e-mail, dar baixa no pedido, registrar a venda. O que vier daqui para
 * baixo é decisão do produto, não da integração, por isso o arquivo nasce
 * com o roteamento pronto e a ação vazia.
 *
 * Duas exigências para o que você escrever aqui:
 *
 * 1. A ação precisa ser idempotente. A deduplicação por id do evento cobre a
 *    maior parte das repetições, mas ela depende de um armazenamento
 *    compartilhado — e enquanto o D1 não estiver ligado, não cobre nada em
 *    produção. "Liberar acesso" é seguro repetir; "creditar saldo" não é,
 *    a menos que você condicione pelo id da transação.
 * 2. Decida pelo `status` da transação consultada, nunca pelo tipo do
 *    evento. O tipo diz o que a Lezty observou em algum momento; o status
 *    diz o que vale agora. Com entrega fora de ordem, os dois discordam.
 */
import type { EventoLezty, Transacao } from "./types";

export async function aoMudarTransacao(
  transacao: Transacao,
  evento: EventoLezty<Transacao>
): Promise<void> {
  switch (transacao.status) {
    case "paid":
      await aoReceberPagamento(transacao);
      return;

    case "expired":
    case "failed":
      // Nada a desfazer: nada foi liberado antes do pagamento.
      return;

    case "refunded":
    case "chargeback":
      await aoPerderPagamento(transacao);
      return;

    case "pending":
      // Chegou um evento, mas a transação ainda não mudou de estado — é o
      // caso típico de entrega fora de ordem. Ignorar é o certo: a entrega
      // da mudança real ainda vem.
      return;

    default: {
      // Status novo que a documentação ainda não listava quando isto foi
      // escrito. Registrar e não agir é melhor do que supor.
      console.warn(
        "[lezty] status não tratado:",
        transacao.status,
        "evento",
        evento.type
      );
    }
  }
}

async function aoReceberPagamento(transacao: Transacao): Promise<void> {
  // TODO(produto): liberar o acesso do comprador.
  //
  // Dados úteis que já estão à mão:
  //   transacao.id                 — id da cobrança (txn_...)
  //   transacao.amount             — centavos efetivamente pagos
  //   transacao.customer           — nome, e-mail, documento
  //   transacao.metadata           — o que você carimbou na criação
  //   transacao.end_to_end_id      — identificador do PIX no banco
  //   transacao.paid_at            — quando pagou
  console.info(
    "[lezty] pagamento confirmado",
    transacao.id,
    `${transacao.amount} centavos`
  );
}

async function aoPerderPagamento(transacao: Transacao): Promise<void> {
  // TODO(produto): revogar o acesso liberado para esta transação.
  console.warn(
    "[lezty] pagamento revertido",
    transacao.id,
    transacao.status,
    transacao.failure_reason ?? ""
  );
}
