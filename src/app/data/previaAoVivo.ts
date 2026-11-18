// Ritmo da prévia — a "janela de descriptografia".
//
// Sem VSL, é esta etapa que tem de carregar a emoção inteira. A versão
// anterior dava 120s de navegação livre, com convite dispensável e tempo
// ilimitado dentro das conversas: tempo demais para o lead racionalizar,
// fechar a aba e "pensar depois". Aqui a prévia é curta e acontece NA FRENTE
// dele — chega mensagem, aparece "digitando", a linha salta para o topo — e
// termina no auge, jogando direto na oferta.
//
// Todos os números do ritmo moram neste arquivo de propósito: é o que se
// mexe para calibrar o teste A/B sem tocar em componente.

/** Janela total da prévia, em segundos (lista + conversas somadas). */
export const PREVIA_SEGUNDOS = 45;

/** Quando a conversa de um contato novo (velada) entra na lista. */
export const NOVO_CONTATO_EM = 4;

/** Quanto tempo o lead fica dentro da conversa legível antes de ela voltar
 *  a ser criptografada. Curto: a leitura é um relance, não um estudo. */
export const JANELA_CHAT_SEGUNDOS = 14;

/** Numa conversa bloqueada não há nada para ler — a espera só daria tempo
 *  de pensar. Fecha mais rápido ainda. */
export const JANELA_CHAT_BLOQUEADO_SEGUNDOS = 6;

/** Respiro entre o re-bloqueio e a oferta: o suficiente para a pessoa ver a
 *  criptografia voltar e entender o que acabou de perder. */
export const LOCKDOWN_MS = 1800;

/** Rolagem: piso de leitura antes de o convite poder aparecer. */
export const MIN_LEITURA_SEGUNDOS = 8;

export type TipoEvento = "texto" | "audio" | "imagem";

export interface EventoAoVivo {
  /** Segundo da prévia em que a mensagem é entregue. */
  em: number;
  /** Segundo em que o "digitando…" começa a aparecer. */
  digitandoDe: number;
  tipo: TipoEvento;
  /** Trecho legível (só o texto tem). O resto é a isca do bloqueio. */
  texto?: string;
  /** Rabo borrado da mensagem — o que a oferta vende. */
  oculto?: string;
  /** Duração do áudio, quando for áudio. */
  duracao?: string;
}

/**
 * O que chega AO VIVO na conversa descriptografada enquanto o lead olha.
 *
 * Vem sempre do lado esquerdo (o contato, não o alvo): é a prova de que a
 * outra pessoa está mexendo no celular agora. A escalada é proposital —
 * texto legível pela metade, depois um áudio que ele não pode ouvir, depois
 * uma foto que ele não pode ver. Cada um tira mais do que entrega.
 */
export const EVENTOS_CONVERSA_LIBERADA: EventoAoVivo[] = [
  {
    em: 12,
    digitandoDe: 9,
    tipo: "texto",
    texto: "não consigo parar de pensar em ontem,",
    oculto: "mesma hora hoje? 😈",
  },
  {
    em: 24,
    digitandoDe: 22,
    tipo: "audio",
    duracao: "0:14",
  },
  {
    em: 34,
    digitandoDe: 32,
    tipo: "imagem",
  },
];

/** Eventos já entregues até o segundo informado. */
export function eventosAte(decorrido: number): EventoAoVivo[] {
  return EVENTOS_CONVERSA_LIBERADA.filter((e) => decorrido >= e.em);
}

/** Verdadeiro enquanto o contato está "digitando…" para o próximo evento. */
export function digitandoAgora(decorrido: number): boolean {
  return EVENTOS_CONVERSA_LIBERADA.some(
    (e) => decorrido >= e.digitandoDe && decorrido < e.em
  );
}

/** Como o evento aparece na linha da lista de conversas. */
export function previaDoEvento(evento: EventoAoVivo): {
  legivel: string;
  oculto?: string;
} {
  if (evento.tipo === "audio") {
    return { legivel: `🎤 Áudio (${evento.duracao ?? "0:14"})` };
  }
  if (evento.tipo === "imagem") {
    return { legivel: "📷 Foto" };
  }
  return { legivel: evento.texto ?? "", oculto: evento.oculto };
}

/** Horário "agora" no formato do app, a partir do instante da entrega. */
export function horarioDoEvento(inicioPrevia: number, evento: EventoAoVivo) {
  const quando = new Date(inicioPrevia + evento.em * 1000);
  return `${String(quando.getHours()).padStart(2, "0")}:${String(
    quando.getMinutes()
  ).padStart(2, "0")}`;
}
