/**
 * Cobranças PIX.
 *
 * Sobre o caminho: `/v1/transactions` aparece literalmente num exemplo de
 * curl da documentação, e o método POST está inferido do `-d` desse mesmo
 * exemplo — o bloco com a requisição PIX completa ficou dentro de uma tag de
 * template que não foi renderizada no arquivo público, então o verbo não
 * está escrito em lugar nenhum que pudéssemos ler. Se a Lezty responder 405
 * aqui, é este o ponto a conferir no painel.
 */
import { requisitar, type RespostaLezty } from "./client";
import type { CriarCobrancaPix, Transacao } from "./types";

const CAMINHO_TRANSACOES = "/v1/transactions";

/** Limites do PIX, conforme a documentação. Centavos. */
export const PIX_VALOR_MINIMO = 300;
export const PIX_VALOR_MAXIMO = 10000000;

/** Faixa aceita em `pix.expires_in_seconds`; padrão da API é 3600. */
export const PIX_EXPIRACAO_MINIMA = 300;
export const PIX_EXPIRACAO_MAXIMA = 2592000;

/**
 * Cria uma cobrança PIX.
 *
 * A `idempotencyKey` identifica a TENTATIVA DE COBRANÇA, não a requisição
 * HTTP. Quer dizer: se a chamada cair na rede e você repetir, mande a MESMA
 * chave — é assim que a Lezty devolve a cobrança já criada (com
 * `Idempotent-Replayed: true`) em vez de criar outra e cobrar duas vezes.
 * Chave nova só para uma cobrança nova de verdade.
 *
 * Guarde a chave junto do pedido antes de chamar: se o processo morrer entre
 * o envio e a resposta, é ela que permite descobrir o que aconteceu.
 */
export async function criarCobrancaPix(
  corpo: CriarCobrancaPix,
  idempotencyKey: string
): Promise<RespostaLezty<Transacao>> {
  if (!Number.isInteger(corpo.amount)) {
    throw new Error(
      "amount precisa ser inteiro em centavos (10000 = cem reais). " +
        "A API não aceita reais nem ponto flutuante em campo nenhum do PIX."
    );
  }
  if (corpo.amount < PIX_VALOR_MINIMO || corpo.amount > PIX_VALOR_MAXIMO) {
    throw new Error(
      `amount fora da faixa do PIX: aceita de ${PIX_VALOR_MINIMO} a ` +
        `${PIX_VALOR_MAXIMO} centavos.`
    );
  }

  const expiracao = corpo.pix?.expires_in_seconds;
  if (expiracao !== undefined) {
    if (
      !Number.isInteger(expiracao) ||
      expiracao < PIX_EXPIRACAO_MINIMA ||
      expiracao > PIX_EXPIRACAO_MAXIMA
    ) {
      throw new Error(
        `pix.expires_in_seconds aceita de ${PIX_EXPIRACAO_MINIMA} a ` +
          `${PIX_EXPIRACAO_MAXIMA} segundos.`
      );
    }
  }

  if (corpo.postback_url && !corpo.postback_url.startsWith("https://")) {
    throw new Error("postback_url precisa ser https e acessível publicamente.");
  }

  return requisitar<Transacao>({
    metodo: "POST",
    caminho: CAMINHO_TRANSACOES,
    corpo,
    idempotencyKey,
  });
}

/**
 * Consulta uma transação por id.
 *
 * É esta chamada que vale como verdade na reconciliação: o corpo do webhook
 * pode chegar fora de ordem ("Os eventos podem até chegar fora de ordem no
 * seu endpoint", diz a documentação), então o estado é sempre o que a API
 * responde agora, não o que o evento carregava.
 */
export async function consultarTransacao(
  id: string
): Promise<RespostaLezty<Transacao>> {
  return requisitar<Transacao>({
    metodo: "GET",
    caminho: `${CAMINHO_TRANSACOES}/${encodeURIComponent(id)}`,
  });
}

/**
 * Chave de idempotência para uma tentativa de cobrança.
 *
 * Deriva do id do pedido para ser reconstruível: se o processo cair antes de
 * gravar a chave, a mesma entrada produz a mesma chave e a repetição ainda
 * encontra a cobrança original em vez de criar outra. O sufixo existe para
 * quando você quiser DE PROPÓSITO uma cobrança nova para o mesmo pedido (a
 * anterior expirou, por exemplo).
 */
export function chaveDeCobranca(pedidoId: string, tentativa = 1): string {
  const limpo = pedidoId.replace(/[^A-Za-z0-9_\-:.]/g, "-").slice(0, 200);
  return `cobranca:${limpo}:${tentativa}`;
}
