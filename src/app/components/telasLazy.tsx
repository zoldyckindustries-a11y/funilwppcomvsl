"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";

// Carregamento sob demanda das telas do funil.
//
// Antes `page.tsx` importava as seis telas de forma estática. Como todas são
// client components, o Next juntava tudo num chunk só: PitchPage (4.6 mil
// linhas), ChatIndividual, InstagramDirect, LoadingAnalysis e, com elas, o
// framer-motion inteiro. O resultado era 224 kB de First Load JS para
// mostrar uma abertura que não usa nenhum desses arquivos — num Moto G
// Power em 4G lenta, isso é mais de um segundo só de download e outro tanto
// de parse, tudo disputando a thread com a hidratação e com os pixels.
//
// Agora a abertura e o formulário são o único JavaScript do primeiro load.
// Cada tela seguinte chega no seu próprio chunk, e `usePrefetchTelas` manda
// buscar a próxima com antecedência — então o split não troca peso por
// espera: quando a pessoa avança, o arquivo já está no cache.

/** Enquanto o chunk baixa, pinta o fundo da tela que está chegando. Sem
 *  isto o salto de tela pisca branco no meio do funil. */
const fundo = (cor: string) => {
  const Fundo = () => (
    <div className="fixed inset-0 z-[60]" style={{ backgroundColor: cor }} />
  );
  Fundo.displayName = `Fundo(${cor})`;
  return Fundo;
};

const Nada = () => null;

export const ProfileConfirmModal = dynamic(
  () => import("./ProfileConfirmModal"),
  { ssr: false, loading: Nada }
);

export const LoadingAnalysis = dynamic(() => import("./LoadingAnalysis"), {
  ssr: false,
  loading: fundo("#FFFFFF"),
});

export const InstagramDirect = dynamic(() => import("./InstagramDirect"), {
  ssr: false,
  loading: fundo("#D9DBD5"),
});

export const ChatIndividual = dynamic(() => import("./ChatIndividual"), {
  ssr: false,
  loading: fundo("#D9DBD5"),
});

export const PitchPage = dynamic(() => import("./PitchPage"), {
  ssr: false,
  loading: fundo("#0A1419"),
});

type Carga = () => Promise<unknown>;

// O script do player da VSL (ConverteAI). Tem que bater com o `SCRIPT_SRC`
// de VslPlayer.tsx — se um dia o vídeo mudar, os dois mudam juntos.
const VSL_SCRIPT =
  "https://scripts.converteai.net/b0f41f85-0c7a-4222-adab-eff21b86bf8b/players/6af757b3bb399ceddba025da/v4/player.js";

/**
 * Põe o script do player no cache do navegador sem executá-lo.
 *
 * O `VslPlayer` só injeta o `<script>` quando a oferta monta, e aí o vídeo
 * — que é a peça de que a venda inteira depende — ainda espera download e
 * parse de um terceiro. Um `rel="preload"` disparado uma tela antes resolve
 * isso: quando o player pedir o arquivo, ele já está no cache.
 *
 * Não executa nada: `preload` só baixa. Quem roda continua sendo o
 * `<script>` do VslPlayer, então a lógica de script único dele segue valendo.
 *
 * Sem `crossOrigin` de propósito: o VslPlayer também injeta sem, e um
 * preload que não casa o modo de requisição com o uso real faz o navegador
 * baixar o arquivo DUAS vezes.
 */
function prepararVsl() {
  if (typeof document === "undefined") return;
  if (document.querySelector(`link[data-vsl-preload]`)) return;
  const link = document.createElement("link");
  link.rel = "preload";
  link.as = "script";
  link.href = VSL_SCRIPT;
  link.setAttribute("data-vsl-preload", "1");
  document.head.appendChild(link);
}

const CARGAS: Record<string, Carga[]> = {
  // Logo depois da hidratação: o modal e a análise são as duas telas que
  // qualquer lead vê, e as duas mais leves.
  inicio: [
    () => import("./ProfileConfirmModal"),
    () => import("./LoadingAnalysis"),
  ],
  // Da análise saem ~31 s de tela: tempo de sobra para o Direct chegar.
  loading: [() => import("./InstagramDirect")],
  // Da lista, os dois destinos possíveis — e, com eles, o player da VSL,
  // porque os dois caminhos terminam na oferta.
  direct: [
    () => import("./ChatIndividual"),
    () => import("./PitchPage"),
    async () => prepararVsl(),
  ],
  // Quem abriu uma conversa está a um toque da oferta.
  chat: [() => import("./PitchPage"), async () => prepararVsl()],
};

const jaPedido = new Set<string>();

function quandoOcioso(fn: () => void) {
  if (typeof window === "undefined") return;
  const ric = (
    window as Window & {
      requestIdleCallback?: (
        cb: () => void,
        opts?: { timeout: number }
      ) => number;
    }
  ).requestIdleCallback;
  if (ric) ric(fn, { timeout: 2500 });
  else setTimeout(fn, 800);
}

/**
 * Busca com antecedência o chunk da próxima tela.
 *
 * O `import()` é idempotente — o segundo pedido devolve o módulo já
 * carregado —, mas o Set evita até a chamada repetida a cada render.
 */
export function usePrefetchTelas(etapa: string) {
  useEffect(() => {
    for (const chave of ["inicio", etapa]) {
      if (jaPedido.has(chave)) continue;
      const cargas = CARGAS[chave];
      if (!cargas) continue;
      jaPedido.add(chave);
      quandoOcioso(() => cargas.forEach((carregar) => void carregar()));
    }
  }, [etapa]);
}
