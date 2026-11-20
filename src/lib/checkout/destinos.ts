/**
 * Para onde vai o botão de compra.
 *
 * O checkout interno (PIX pela Lezty Pay) está pronto e testado, mas o
 * gateway saiu do ar — e funil com botão que não cobra não é funil. Enquanto
 * isso, cada oferta volta para o seu link externo na PerfectPay.
 *
 * O interruptor abaixo é o único lugar a mexer quando a Lezty voltar: trocar
 * para `true` devolve todos os botões ao /checkout, sem tocar em página
 * nenhuma. A integração inteira continua no projeto, com os testes passando.
 */
export const USAR_CHECKOUT_INTERNO = false;

/**
 * Links externos por oferta.
 *
 * Cada link cobra o valor configurado na PerfectPay, não o que a nossa
 * página anuncia. Por isso cada oferta tem o seu: um link compartilhado
 * entre preços diferentes vira reclamação no primeiro dia.
 */
export const LINKS_EXTERNOS: Record<string, string> = {
  // R$ 37,90 — link novo, criado para esta oferta.
  principal: "https://go.perfectpay.com.br/PPU38CQHTJ2",

  // R$ 17,90 — link próprio da oferta de retorno.
  resgate: "https://go.perfectpay.com.br/PPU38CQHSPP",

  // R$ 67,90 — link próprio do upsell, usado pelo projeto do upsell.
  upsell1: "https://go.perfectpay.com.br/PPU38CQHOH5",
};

/**
 * Destino do botão de compra de uma oferta.
 *
 * Sem link externo cadastrado, cai na oferta principal: é melhor mandar para
 * um checkout que cobra o valor errado do que para um botão que não leva a
 * lugar nenhum — e isso aparece na revisão antes de ir para produção.
 */
export function linkDaOferta(ofertaId: string): string {
  if (USAR_CHECKOUT_INTERNO) {
    return ofertaId === "principal"
      ? "/checkout"
      : `/checkout?oferta=${ofertaId}`;
  }
  return LINKS_EXTERNOS[ofertaId] ?? LINKS_EXTERNOS.principal;
}
