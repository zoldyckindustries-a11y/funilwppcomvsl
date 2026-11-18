import { useEffect, useState } from "react";
import { PREVIA_SEGUNDOS } from "../app/data/previaAoVivo";

// A âncora da prévia vive no localStorage porque abrir uma conversa desmonta
// a lista: sem isso o relógio reiniciaria a cada ida e volta, e a janela
// nunca fecharia. A chave é limpada a cada nova busca (ver useNavigation) e
// gravada aqui pela primeira tela que precisar dela.
const CHAVE_INICIO = "previewStartedAt";

export function lerInicioPrevia(): number {
  if (typeof window === "undefined") return Date.now();
  const bruto = localStorage.getItem(CHAVE_INICIO);
  if (bruto) {
    const valor = Number(bruto);
    if (Number.isFinite(valor)) return valor;
  }
  const agora = Date.now();
  localStorage.setItem(CHAVE_INICIO, String(agora));
  return agora;
}

export interface EstadoPrevia {
  /** Instante em que a prévia começou (ms). 0 antes do primeiro tique. */
  inicio: number;
  /** Segundos decorridos desde o início. */
  decorrido: number;
  /** Segundos restantes até o re-bloqueio. */
  restante: number;
  /** A janela fechou. */
  expirada: boolean;
}

/**
 * Relógio único da prévia, compartilhado pela lista e pela conversa.
 *
 * O ponto é que a janela corre em qualquer tela: o lead não escapa do
 * cronômetro entrando numa conversa, que era o buraco da versão anterior.
 *
 * O primeiro render devolve a janela cheia e só o efeito lê o armazenamento —
 * o servidor não tem como saber que horas são no navegador, e um número
 * diferente aqui quebraria a hidratação.
 */
export function usePrevia(): EstadoPrevia {
  const [estado, setEstado] = useState<EstadoPrevia>({
    inicio: 0,
    decorrido: 0,
    restante: PREVIA_SEGUNDOS,
    expirada: false,
  });

  useEffect(() => {
    const inicio = lerInicioPrevia();

    const calcular = (): EstadoPrevia => {
      const decorrido = Math.floor((Date.now() - inicio) / 1000);
      return {
        inicio,
        decorrido,
        restante: Math.max(0, PREVIA_SEGUNDOS - decorrido),
        expirada: decorrido >= PREVIA_SEGUNDOS,
      };
    };

    setEstado(calcular());
    const tick = setInterval(() => setEstado(calcular()), 250);
    return () => clearInterval(tick);
  }, []);

  return estado;
}
