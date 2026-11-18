/**
 * Catálogo do checkout.
 *
 * Preço em CENTAVOS, inteiro, sempre — é o formato que a Lezty exige em
 * todos os campos monetários, e converter de real para centavo em dois
 * lugares diferentes é como nasce cobrança errada. Aqui já nasce certo.
 *
 * Os nomes, preços e a ordem vieram do checkout antigo. As miniaturas são
 * as artes oficiais de cada produto, convertidas para webp a 192px: a
 * original da principal tinha 2048px e 1,2 MB, o que é banda jogada fora numa
 * tela onde a pessoa está decidindo pagar. O ícone continua no catálogo como
 * reserva, para o caso de a imagem não carregar.
 */
import {
  Infinity as InfinityIcon,
  RotateCcw,
  MapPin,
  Camera,
  Instagram,
  Heart,
  type LucideIcon,
} from "lucide-react";

export interface Produto {
  id: string;
  nome: string;
  /** Centavos. */
  preco: number;
  /**
   * Preço cheio, em centavos. É contra ele que o desconto do checkout é
   * calculado — nenhuma porcentagem aparece na tela sem este número por
   * trás. "Até 80% de desconto" só pode ser dito porque o maior corte aqui
   * é exatamente esse.
   */
  precoDe: number;
  /** A promessa, em uma linha. */
  gancho: string;
  /** O que o item entrega, logo abaixo. */
  detalhe: string;
  icone: LucideIcon;
  /** Cor do selo do item. */
  tom: string;
  /** Arte oficial, em public/produtos. */
  imagem: string;
}

/** O produto principal. É o que o botão da oferta leva para o checkout. */
export const PRODUTO_PRINCIPAL: Produto = {
  id: "zaplens",
  nome: "ZapLens | Detetive I.A",
  preco: 3790,
  precoDe: 29700,
  gancho: "Acesso completo ao WhatsApp do número investigado",
  detalhe:
    "Conversas apagadas, áudios, fotos de visualização única e localização. Liberação na hora, sem aviso no aparelho dele.",
  icone: Camera,
  tom: "#25D366",
  imagem: "/produtos/zaplens.webp",
};

/**
 * Order bumps, na ordem em que aparecem.
 *
 * A sequência é a do checkout antigo e tem lógica: começa no mais barato
 * (7,90) e sobe até o mais caro (37,90). Quem marca o primeiro já quebrou a
 * resistência de marcar, e cada item seguinte parece pequeno perto do que
 * ele acabou de aceitar.
 */
export const ORDER_BUMPS: Produto[] = [
  {
    id: "vitalicio",
    nome: "Acesso Vitalício",
    preco: 790,
    precoDe: 3990,
    gancho: "Espione quantos números quiser, para sempre",
    detalhe:
      "Sem limite de consultas e sem renovação. O acesso de hoje passa a valer para qualquer número, quando você quiser.",
    icone: InfinityIcon,
    tom: "#25D366",
    imagem: "/produtos/vitalicio.webp",
  },
  {
    id: "recuperacao",
    nome: "Recuperação de Arquivos",
    preco: 1490,
    precoDe: 4990,
    gancho: "Recupere tudo o que já foi excluído",
    detalhe:
      "Vai além das últimas 72 horas: mensagens, fotos e áudios apagados há meses voltam do backup.",
    icone: RotateCcw,
    tom: "#F59E0B",
    imagem: "/produtos/recuperacao.webp",
  },
  {
    id: "gpsfind",
    nome: "GPSFind",
    preco: 1790,
    precoDe: 5990,
    gancho: "Localização exata em segundos, sem tocar no aparelho",
    detalhe:
      "Trajeto completo, histórico de paradas e alerta instantâneo quando ele sai da rotina.",
    icone: MapPin,
    tom: "#3B82F6",
    imagem: "/produtos/gpsfind.webp",
  },
  {
    id: "camremota",
    nome: "CamRemota",
    preco: 2790,
    precoDe: 8990,
    gancho: "Não só onde ele está: veja o que acontece ao redor",
    detalhe:
      "Câmera e áudio ambiente, sem acender luz, emitir som ou deixar notificação no aparelho.",
    icone: Camera,
    tom: "#A855F7",
    imagem: "/produtos/camremota.webp",
  },
  {
    id: "instaspy",
    nome: "InstaSpy",
    preco: 3790,
    precoDe: 9790,
    gancho: "Instagram completo em modo fantasma",
    detalhe:
      "Directs, stories ocultos, curtidas e novas conexões no seu painel, sem deixar rastro de visualização.",
    icone: Instagram,
    tom: "#EC4899",
    imagem: "/produtos/instaspy.webp",
  },
];

/**
 * O produto da oferta de retorno.
 *
 * É o mesmo acesso da oferta principal, por menos. A âncora é justamente o
 * preço que ele acabou de recusar: quem chega aqui viu R$ 37,90 trinta
 * segundos atrás, e é contra esse número que o R$ 17,90 pesa. Inventar uma
 * âncora maior quebraria a conta na cabeça dele.
 */
export const PRODUTO_RESGATE: Produto = {
  id: "zaplens-resgate",
  nome: "ZapLens | Detetive I.A",
  preco: 1790,
  precoDe: 3790,
  gancho: "Cancele o alerta e libere o acesso completo",
  detalhe:
    "Conversas apagadas, áudios, fotos e localização. O aparelho monitorado não recebe aviso nenhum.",
  icone: Camera,
  tom: "#25D366",
  imagem: "/produtos/zaplens.webp",
};

/**
 * O produto do upsell 1.
 *
 * Vendido na página upsell.zaplens.online, que é outro deploy. Ela não
 * precisa de checkout próprio nem de chave da Lezty: manda para cá, e aqui
 * já existe a cobrança, o webhook e o lugar onde o segredo mora. Um gateway
 * configurado em dois projetos é duas vezes a chance de um deles ficar para
 * trás numa rotação de chave.
 */
export const PRODUTO_UPSELL1: Produto = {
  id: "relatorio-relacionamento",
  nome: "Relatório de Apps de Relacionamento",
  preco: 6790,
  precoDe: 13790,
  gancho: "Descubra em quais apps de namoro o número está ativo",
  detalhe:
    "Perfis encontrados, fotos usadas, última atividade e alterações recentes de bio.",
  icone: Heart,
  // A arte deste produto ainda não existe em public/produtos. Enquanto não
  // existir, a miniatura cai sozinha no ícone (ver o onError do componente).
  imagem: "/produtos/upsell1.webp",
  tom: "#EC4899",
};

/**
 * O downsell do upsell 1.
 *
 * Mesmo relatório, sem a parte de monitoramento contínuo, por pouco mais da
 * metade. A âncora é o preço que ele acabou de recusar — é contra esse
 * número que o novo pesa, e não contra o preço cheio que ele já ignorou uma
 * vez.
 */
export const PRODUTO_DOWNSELL1: Produto = {
  id: "relatorio-relacionamento-light",
  nome: "Relatório de Apps de Relacionamento",
  preco: 3790,
  precoDe: 6790,
  gancho: "A versão essencial do relatório, por quase metade",
  detalhe:
    "Os perfis encontrados, as fotos usadas e a última atividade. Entrega única, sem acompanhamento mensal.",
  icone: Heart,
  imagem: "/produtos/upsell1.webp",
  tom: "#EC4899",
};

/**
 * As ofertas que o checkout sabe vender.
 *
 * O checkout é um só; o que muda é o que está sendo vendido e se há módulos
 * para oferecer. A oferta de retorno vai sem order bumps de propósito: quem
 * chega lá estava saindo da página, e pedir mais uma decisão a quem já estava
 * de saída é a forma mais rápida de perder os dois.
 */
export interface Oferta {
  id: string;
  produto: Produto;
  bumps: Produto[];
  /** Chamada do passo de pagamento. */
  titulo: string;
  /**
   * Para onde o comprador segue depois da confirmação.
   *
   * Cada oferta tem o seu destino: quem compra a principal vai para o
   * upsell; quem acabou de comprar o upsell não pode voltar para ele, senão
   * a esteira vira um laço e a pessoa acha que a compra não passou.
   */
  proximoPasso: string;
}

const UPSELL_1 = "https://upsell.zaplens.online";

export const OFERTAS: Record<string, Oferta> = {
  principal: {
    id: "principal",
    produto: PRODUTO_PRINCIPAL,
    bumps: ORDER_BUMPS,
    titulo: "Acesso completo ao WhatsApp",
    proximoPasso: UPSELL_1,
  },
  resgate: {
    id: "resgate",
    produto: PRODUTO_RESGATE,
    bumps: [],
    titulo: "Cancele o alerta e libere tudo",
    proximoPasso: UPSELL_1,
  },
  upsell1: {
    id: "upsell1",
    produto: PRODUTO_UPSELL1,
    bumps: [],
    titulo: "Libere o relatório de apps de relacionamento",
    // Quem comprou o upsell vai para a página de obrigado do próprio
    // upsell, não de volta para a oferta que acabou de aceitar.
    proximoPasso: `${UPSELL_1}/obrigado`,
  },
  downsell1: {
    id: "downsell1",
    produto: PRODUTO_DOWNSELL1,
    bumps: [],
    titulo: "Leve a versão essencial do relatório",
    // Fim da esteira: comprando ou não, daqui ele vai para o obrigado.
    proximoPasso: `${UPSELL_1}/obrigado`,
  },
};

export const OFERTA_PADRAO = OFERTAS.principal;

/** Oferta pedida na URL, ou a principal quando o id não existe. */
export function lerOferta(id?: string | null): Oferta {
  if (!id) return OFERTA_PADRAO;
  return OFERTAS[id] ?? OFERTA_PADRAO;
}

export const TODOS_OS_PRODUTOS = [
  PRODUTO_PRINCIPAL,
  PRODUTO_RESGATE,
  PRODUTO_UPSELL1,
  PRODUTO_DOWNSELL1,
  ...ORDER_BUMPS,
];

/** Quanto por cento o preço atual corta do preço cheio. */
export function descontoPercentual(produto: {
  preco: number;
  precoDe: number;
}): number {
  if (produto.precoDe <= produto.preco) return 0;
  return Math.round((1 - produto.preco / produto.precoDe) * 100);
}

/** O maior desconto do conjunto — é o número que a chamada do passo 2 usa. */
export function maiorDesconto(produtos: { preco: number; precoDe: number }[]): number {
  return produtos.reduce((maior, p) => Math.max(maior, descontoPercentual(p)), 0);
}

/** Centavos para "R$ 37,90". */
export function emReais(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/**
 * Soma do pedido a partir da oferta e dos ids escolhidos.
 *
 * O produto da oferta entra sempre, mesmo que não venha na lista: é o que
 * está sendo comprado. Módulo que não pertence à oferta é ignorado em
 * silêncio — sem isso, bastaria mandar os ids dos bumps numa compra de
 * resgate para montar um pedido que não existe em lugar nenhum.
 *
 * O total é montado aqui no servidor, a partir do catálogo, nunca a partir
 * de um valor que o navegador tenha mandado.
 */
export function somarPedido(
  idsExtras: string[],
  ofertaId?: string | null
): { itens: Produto[]; total: number; oferta: Oferta } {
  const oferta = lerOferta(ofertaId);
  const escolhidos = new Set(idsExtras);
  const itens = [
    oferta.produto,
    ...oferta.bumps.filter((b) => escolhidos.has(b.id)),
  ];
  return {
    itens,
    total: itens.reduce((soma, item) => soma + item.preco, 0),
    oferta,
  };
}
