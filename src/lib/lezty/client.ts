/**
 * Cliente HTTP da Lezty Pay.
 *
 * Só roda no servidor. A chave entra no header `Authorization: Bearer` e não
 * aparece em log, em mensagem de erro nem no objeto de erro que sobe para
 * quem chamou.
 */
import { LEZTY_BASE_URL, credenciais } from "./config";
import type { ErroLezty } from "./types";

/**
 * Erro vindo da API, já com o `code` à mão.
 *
 * A documentação diz, com todas as letras, para programar contra `code` — e
 * não contra a mensagem, que é texto para humano e pode mudar.
 */
export class LeztyApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly type: string;
  readonly param: string | null;
  readonly requestId: string | null;
  readonly retryAfter: number | null;

  constructor(
    status: number,
    erro: Partial<ErroLezty>,
    requestId: string | null,
    retryAfter: number | null
  ) {
    super(erro.message || `Lezty Pay respondeu ${status}`);
    this.name = "LeztyApiError";
    this.status = status;
    this.code = erro.code || "unknown_error";
    this.type = erro.type || "unknown";
    this.param = erro.param ?? null;
    this.requestId = requestId ?? erro.request_id ?? null;
    this.retryAfter = retryAfter;
  }

  /**
   * A mesma Idempotency-Key pode ser repetida?
   *
   * A documentação separa os casos: 400, 403 e a maioria dos 409 limpam o
   * registro, então a chave serve de novo; `acquirer_timeout` guarda o
   * resultado e pede a MESMA chave depois de 60 s; `acquirer_rejected` e
   * `acquirer_unavailable` ficam gravados, então exigem chave nova.
   */
  get permiteMesmaChave(): boolean {
    if (this.code === "acquirer_timeout") return true;
    if (this.code === "acquirer_rejected") return false;
    if (this.code === "acquirer_unavailable") return false;
    if (this.status === 400 || this.status === 403) return true;
    if (this.status === 409 && this.code !== "idempotency_conflict") {
      return true;
    }
    return false;
  }
}

export interface RespostaLezty<T> {
  dados: T;
  /** `X-Request-Id`, o mesmo valor que vem em `error.request_id`. */
  requestId: string | null;
  /** `Idempotent-Replayed: true` quando a resposta é a gravada antes. */
  repetida: boolean;
  /** Quantas requisições ainda cabem na janela de 60 s. */
  limiteRestante: number | null;
}

interface OpcoesRequisicao {
  metodo: "GET" | "POST";
  caminho: string;
  corpo?: unknown;
  /**
   * Obrigatória na criação de cobrança e de saque. A documentação aceita de
   * 1 a 255 caracteres em [A-Za-z0-9_-:.].
   */
  idempotencyKey?: string;
  sinal?: AbortSignal;
}

const FORMATO_IDEMPOTENCY_KEY = /^[A-Za-z0-9_\-:.]{1,255}$/;

export async function requisitar<T>({
  metodo,
  caminho,
  corpo,
  idempotencyKey,
  sinal,
}: OpcoesRequisicao): Promise<RespostaLezty<T>> {
  const { chave } = await credenciais();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${chave}`,
    Accept: "application/json",
  };

  if (corpo !== undefined) headers["Content-Type"] = "application/json";

  if (idempotencyKey !== undefined) {
    if (!FORMATO_IDEMPOTENCY_KEY.test(idempotencyKey)) {
      throw new Error(
        "Idempotency-Key fora do formato aceito: 1 a 255 caracteres entre " +
          "A-Z a-z 0-9 _ - : ."
      );
    }
    headers["Idempotency-Key"] = idempotencyKey;
  }

  const resposta = await fetch(`${LEZTY_BASE_URL}${caminho}`, {
    method: metodo,
    headers,
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    signal: sinal,
  });

  const requestId = resposta.headers.get("X-Request-Id");
  const restante = resposta.headers.get("X-RateLimit-Remaining");
  const retryAfter = resposta.headers.get("Retry-After");

  const texto = await resposta.text();
  let json: unknown = null;
  if (texto) {
    try {
      json = JSON.parse(texto);
    } catch {
      // Resposta não-JSON só importa quando o status já indica falha; no
      // caminho feliz um corpo ilegível é erro de verdade.
      if (resposta.ok) {
        throw new LeztyApiError(
          resposta.status,
          { code: "invalid_json", message: "Resposta não é JSON válido." },
          requestId,
          null
        );
      }
    }
  }

  if (!resposta.ok) {
    const envelope =
      (json as { error?: Partial<ErroLezty> } | null)?.error ?? {};
    throw new LeztyApiError(
      resposta.status,
      envelope,
      requestId,
      retryAfter ? Number(retryAfter) : null
    );
  }

  return {
    dados: json as T,
    requestId,
    repetida: resposta.headers.get("Idempotent-Replayed") === "true",
    limiteRestante: restante === null ? null : Number(restante),
  };
}
