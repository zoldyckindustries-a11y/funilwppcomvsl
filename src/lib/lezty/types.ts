/**
 * Tipos da Lezty Pay.
 *
 * Todo campo aqui foi conferido na documentação (docs.leztypay.com,
 * llms-full.txt e openapi.json) — nenhum nome saiu de memória. Onde a
 * documentação não descreve o tipo exato, o campo fica `unknown` em vez de
 * receber um palpite.
 *
 * Regra que vale para a API inteira: todo valor monetário é INTEIRO EM
 * CENTAVOS. A documentação é explícita: "`amount` é sempre inteiro em
 * centavos: `10000` são cem reais". Não existe campo em reais nem em ponto
 * flutuante no fluxo PIX.
 */

/** Estados possíveis de uma transação (tabela de status da documentação). */
export type StatusTransacao =
  | "pending"
  | "paid"
  | "expired"
  | "failed"
  | "refunded"
  | "chargeback";

/**
 * Bloco PIX da transação. Os três campos são obrigatórios no schema do
 * openapi.json, e todos vêm nulos quando a cobrança nasce `failed`.
 */
export interface PixTransacao {
  /** O "copia e cola" (BR Code). É exatamente o que o QR codifica. */
  payload: string | null;
  /** PNG do QR Code em base64. */
  qr_base64: string | null;
  /** Prazo real de expiração. */
  expires_at: string | null;
}

/**
 * Transação. Os campos abaixo são os `required` do schema do openapi.json,
 * na ordem em que aparecem lá.
 */
export interface Transacao {
  id: string;
  object: string;
  mode: "test" | "live";
  status: StatusTransacao;
  payment_method: string;
  /** Centavos. */
  amount: number;
  /** Centavos. */
  fee: number;
  /** Centavos. */
  net: number;
  /** Centavos. Sempre 0 no PIX. */
  reserve: number;
  reserve_released_at: string | null;
  customer: ClienteTransacao;
  items: unknown[] | null;
  pix: PixTransacao | null;
  postback_url: string | null;
  metadata: Record<string, string> | null;
  acquirer: unknown;
  paid_at: string | null;
  expired_at: string | null;
  refunded_at: string | null;
  chargeback_at: string | null;
  failure_reason: string | null;
  end_to_end_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Cliente. A documentação cita `name`, `email` e `document` (CPF/CNPJ, e diz
 * que é validado); o openapi.json acrescenta `phone`. Não há no texto que
 * pudemos ler a marcação de quais são obrigatórios DENTRO do objeto — só que
 * o objeto inteiro é obrigatório na criação.
 */
export interface ClienteTransacao {
  name?: string;
  email?: string;
  document?: string;
  phone?: string;
  [extra: string]: unknown;
}

/**
 * Corpo da criação de cobrança.
 *
 * A documentação é explícita sobre o mínimo: "Só `amount` e `customer` são
 * obrigatórios". Os demais campos aparecem descritos no texto, mas o exemplo
 * completo da requisição não está no arquivo (ficou dentro de uma tag de
 * template não renderizada), então os opcionais estão tipados pelo que o
 * texto descreve, e nada além disso.
 */
export interface CriarCobrancaPix {
  /** Centavos. PIX aceita de 300 a 10000000. */
  amount: number;
  customer: ClienteTransacao;
  /** Padrão `pix` quando omitido. */
  payment_method?: "pix";
  currency?: string;
  description?: string;
  items?: unknown[];
  /** Máx. 20 chaves, chave até 40 caracteres, valor até 500, 4 KB no total. */
  metadata?: Record<string, string>;
  /** Precisa ser https e público. */
  postback_url?: string;
  /** De 300 a 2592000 segundos; padrão 3600. */
  pix?: { expires_in_seconds?: number };
  tracking?: Record<string, string>;
  splits?: unknown[];
}

/** Envelope de erro da API. A documentação manda programar contra `code`. */
export interface ErroLezty {
  type: string;
  code: string;
  message: string;
  param?: string | null;
  request_id?: string | null;
  details?: unknown;
}

/** Tipos de evento de transação entregues por webhook. */
export type TipoEventoTransacao =
  | "transaction.paid"
  | "transaction.expired"
  | "transaction.failed"
  | "transaction.refunded"
  | "transaction.chargeback"
  | "transaction.reserve_released"
  | "transaction.split.settled"
  | "transaction.split.reversed";

/**
 * Evento de webhook. O formato abaixo é o que aparece literalmente nos
 * exemplos da documentação.
 *
 * `data.object` NÃO é a fonte da verdade: a documentação avisa que os
 * eventos podem chegar fora de ordem, então o estado atual vem sempre de uma
 * consulta à transação por id.
 */
export interface EventoLezty<T = unknown> {
  id: string;
  object: "event";
  type: string;
  mode: "live" | "test";
  created_at: string;
  data: { object: T };
}
