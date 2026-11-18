"use client";

import { useEffect } from "react";

/**
 * Intercepta o botão "voltar" em páginas fora do funil principal.
 *
 * O navegador não deixa cancelar uma navegação de volta, então o truque é
 * empilhar um estado extra no histórico: o "voltar" consome esse estado em
 * vez de sair do site.
 *
 * A primeira volta só TRAVA — repõe a entrada e a pessoa continua onde
 * estava, sem nada na tela. O gesto de voltar do Android é a borda inteira
 * da tela, e um toque sem querer não pode jogar ninguém numa página de
 * retenção que ele não pediu. Quem insiste dentro da janela está querendo
 * sair de verdade: esse vê a oferta de retorno, uma vez por sessão.
 *
 * O funil principal tem a sua própria versão disto, em useNavigation, porque
 * lá a volta também serve para navegar entre as etapas.
 */
const CHAVE_SESSAO = "backRedirectUsado";
const CHAVE_VOLTAS = "voltasBloqueadas";
const CHAVE_ULTIMA_VOLTA = "ultimaVoltaEm";

const VOLTAS_ANTES_DA_OFERTA = 1;
const JANELA_INSISTENCIA_MS = 30_000;

export function useBackRedirect(destino = "/back-redirect") {
  useEffect(() => {
    if (typeof window === "undefined") return;
    // não arma na própria página de destino, senão vira laço
    if (window.location.pathname === destino) return;
    if (sessionStorage.getItem(CHAVE_SESSAO) === "1") return;

    window.history.pushState(null, "", window.location.href);

    const aoVoltar = () => {
      const agora = Date.now();
      const ultima = Number(sessionStorage.getItem(CHAVE_ULTIMA_VOLTA) || 0);
      const dentroDaJanela =
        Number.isFinite(ultima) && agora - ultima <= JANELA_INSISTENCIA_MS;

      const voltas = dentroDaJanela
        ? Number(sessionStorage.getItem(CHAVE_VOLTAS) || 0) + 1
        : 1;

      sessionStorage.setItem(CHAVE_VOLTAS, String(voltas));
      sessionStorage.setItem(CHAVE_ULTIMA_VOLTA, String(agora));

      if (voltas <= VOLTAS_ANTES_DA_OFERTA) {
        // Trava: repõe a entrada que o navegador acabou de consumir.
        window.history.pushState(null, "", window.location.href);
        return;
      }

      sessionStorage.setItem(CHAVE_SESSAO, "1");
      window.location.href = destino;
    };

    window.addEventListener("popstate", aoVoltar);
    return () => window.removeEventListener("popstate", aoVoltar);
  }, [destino]);
}
