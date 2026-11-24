"use client";

/**
 * Player da VSL (VTurb / ConverteAI).
 *
 * O embed oficial é um elemento próprio (`<vturb-smartplayer>`) mais um
 * script que o registra. No React isso exige dois cuidados:
 *
 * 1. O script entra uma vez só. Em desenvolvimento o React monta e desmonta
 *    cada efeito duas vezes, e dois scripts iguais registram o mesmo
 *    elemento duas vezes — o player some ou duplica.
 * 2. O elemento não pode ser recriado pelo React depois que o script tomou
 *    conta dele. Por isso o container é marcado com
 *    `suppressHydrationWarning`: o conteúdo que o player injeta por dentro
 *    não corresponde ao que o servidor renderizou, e sem isso o React tenta
 *    "consertar" e apaga o vídeo.
 *
 * A moldura é a mesma dos blocos de prova da oferta: painel escuro, borda
 * verde discreta e cantos arredondados. Um player cru, com as bordas
 * quadradas do iframe, denuncia conteúdo colado de fora.
 */

import { useEffect, useRef } from "react";

const PLAYER_ID = "vid-6af757b3bb399ceddba025da";
// ATENÇÃO: esta URL também está em `telasLazy.tsx`, como `VSL_SCRIPT`, onde
// serve para dar `rel="preload"` no script uma tela antes de a oferta abrir.
// Trocou o vídeo? Troque nos DOIS lugares, senão o preload baixa o player
// velho e o ganho vira download desperdiçado.
const SCRIPT_SRC =
  "https://scripts.converteai.net/b0f41f85-0c7a-4222-adab-eff21b86bf8b/players/6af757b3bb399ceddba025da/v4/player.js";

/** Marca no próprio script para reconhecê-lo entre remontagens. */
const MARCA = "data-vsl-zaplens";

declare module "react" {
  // O React 19 moveu o namespace JSX para dentro do módulo "react", e
  // declarar um elemento customizado exige mencioná-lo. A regra que proíbe
  // namespace existe para código novo em ES2015; aqui não há alternativa:
  // é assim que se ensina o TypeScript a aceitar <vturb-smartplayer>.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "vturb-smartplayer": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & { id?: string };
    }
  }
}

export default function VslPlayer({ className = "" }: { className?: string }) {
  const montado = useRef(false);

  useEffect(() => {
    if (montado.current) return;
    montado.current = true;

    // Já carregado numa montagem anterior (ou por outra instância): não
    // acrescenta um segundo.
    if (document.querySelector(`script[${MARCA}]`)) return;

    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.setAttribute(MARCA, "1");
    document.head.appendChild(script);
  }, []);

  return (
    <div
      className={`relative rounded-2xl overflow-hidden shadow-2xl ${className}`}
      style={{
        backgroundColor: "#0B141A",
        border: "1px solid rgba(37,211,102,0.22)",
        boxShadow: "0 18px 44px rgba(0,0,0,0.3)",
      }}
    >
      <vturb-smartplayer
        id={PLAYER_ID}
        suppressHydrationWarning
        style={{ display: "block", margin: "0 auto", width: "100%" }}
      >
        {/* Reserva da proporção 16:9 antes de o script assumir. Sem ela a
            página dá um salto quando o vídeo entra, e salto de layout em
            cima de um play é clique perdido. */}
        <div
          className="vturb-player-placeholder"
          style={{
            position: "relative",
            width: "100%",
            padding: "56.25% 0 0",
            zIndex: 0,
            backgroundColor: "black",
          }}
        />
      </vturb-smartplayer>
    </div>
  );
}
