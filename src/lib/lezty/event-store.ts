/**
 * Deduplicação dos eventos recebidos.
 *
 * A documentação é direta: "Cada evento chega pelo menos uma vez, não
 * exatamente uma vez" e "Ordem não é garantida". São até 6 tentativas por
 * entrega, e o ambiente de teste tem inclusive um valor que manda o mesmo
 * evento duas vezes de propósito. Sem registro do que já passou por aqui, o
 * efeito colateral (liberar acesso, enviar e-mail, dar baixa) roda de novo.
 *
 * A chave da deduplicação é o id do EVENTO (`evt_...`), nunca o
 * `X-Delivery-Id` — esse muda a cada tentativa, então dedup por ele não
 * deduplica nada.
 *
 * ATENÇÃO, PRECISA DE DECISÃO: este projeto não tem banco. O `wrangler.jsonc`
 * não declara KV, D1 nem Durable Object. A implementação de memória abaixo
 * serve para `next dev` e só: no Worker cada isolate tem a própria memória e
 * ela evapora, então dois entregadores simultâneos processam o mesmo evento.
 * Antes de ir para `sk_live_`, ligue o D1 (instruções em
 * `src/lib/lezty/README.md`) ou aponte para o banco que você já usa.
 */

/**
 * O mínimo do D1 que usamos aqui.
 *
 * O projeto não tem @cloudflare/workers-types instalado, e trazer o pacote
 * inteiro para tipar três métodos sairia mais caro do que descrevê-los. A
 * forma abaixo é estrutural: qualquer binding D1 de verdade a satisfaz.
 */
export interface D1Minimo {
  prepare(sql: string): {
    bind(...valores: unknown[]): {
      run(): Promise<{ meta?: { changes?: number } }>;
    };
  };
}

export interface ArmazemEventos {
  /**
   * Marca o evento como recebido.
   *
   * @returns true quando é a primeira vez (siga o processamento), false
   *          quando já havia registro (ignore a entrega).
   */
  registrarSeNovo(eventoId: string, tipo: string): Promise<boolean>;

  /** Marca o processamento como concluído. */
  concluir(eventoId: string): Promise<void>;

  /** Marca falha, para dar visibilidade ao que precisa ser refeito. */
  falhar(eventoId: string, motivo: string): Promise<void>;
}

/**
 * D1. É a opção recomendada: a escrita é transacional, então duas entregas
 * simultâneas do mesmo evento não passam as duas — a segunda esbarra na
 * chave primária.
 */
export class ArmazemD1 implements ArmazemEventos {
  constructor(private readonly db: D1Minimo) {}

  async registrarSeNovo(eventoId: string, tipo: string): Promise<boolean> {
    // INSERT ... ON CONFLICT DO NOTHING: quem conseguir inserir processa.
    // `meta.changes` conta as linhas realmente escritas.
    const r = await this.db
      .prepare(
        `INSERT INTO lezty_eventos (id, tipo, estado, recebido_em)
         VALUES (?, ?, 'recebido', ?)
         ON CONFLICT(id) DO NOTHING`
      )
      .bind(eventoId, tipo, new Date().toISOString())
      .run();

    return (r.meta?.changes ?? 0) > 0;
  }

  async concluir(eventoId: string): Promise<void> {
    await this.db
      .prepare(
        `UPDATE lezty_eventos
            SET estado = 'concluido', concluido_em = ?, erro = NULL
          WHERE id = ?`
      )
      .bind(new Date().toISOString(), eventoId)
      .run();
  }

  async falhar(eventoId: string, motivo: string): Promise<void> {
    // O registro volta para 'falhou' em vez de ser apagado: a Lezty vai
    // reentregar, e aí a tentativa seguinte encontra a linha e sabe que o
    // efeito ainda não aconteceu. Quem decide reprocessar é o fluxo de
    // reconciliação, não a dedup.
    await this.db
      .prepare(
        `UPDATE lezty_eventos SET estado = 'falhou', erro = ? WHERE id = ?`
      )
      .bind(motivo.slice(0, 500), eventoId)
      .run();
  }
}

/**
 * Memória. Só para desenvolvimento — ver o aviso no topo do arquivo.
 */
export class ArmazemMemoria implements ArmazemEventos {
  private readonly vistos = new Map<string, string>();

  async registrarSeNovo(eventoId: string): Promise<boolean> {
    if (this.vistos.has(eventoId)) return false;
    this.vistos.set(eventoId, "recebido");
    return true;
  }

  async concluir(eventoId: string): Promise<void> {
    this.vistos.set(eventoId, "concluido");
  }

  async falhar(eventoId: string): Promise<void> {
    // Some do registro para a reentrega poder tentar de novo: em memória
    // não há fluxo de reconciliação para consertar depois.
    this.vistos.delete(eventoId);
  }
}
