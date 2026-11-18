# Versão com VSL

Cópia do funil `funilwppsemvsl`, com uma diferença: a oferta abre depois de
**4 minutos de vídeo**, em vez de 1 minuto de barra de análise.

Os dois projetos são independentes — deploy, domínio e Worker separados. O
que muda aqui:

| | sem VSL | com VSL |
|---|---|---|
| `package.json` / `wrangler.jsonc` | `detetivewhite` / `instaspy` | `zaplens-funil-vsl` |
| `ANALYSIS_DURATION_MS` | 60 000 (1 min) | **240 000 (4 min)** |
| Player | — | `src/app/components/VslPlayer.tsx` |

## Como a VSL se encaixa

O player fica **acima** do bloco de análise e **não some** quando a análise
termina: a barra desaparece, a oferta entra embaixo, e quem estava assistindo
continua de onde parou. Ninguém é obrigado a terminar o vídeo — aos 4 minutos
a oferta abre sozinha.

A barra de progresso é a única pista visível de quanto falta. Por isso ela e
o vídeo usam o mesmo tempo: se discordarem, a pessoa passa a conferir o
relógio em vez de assistir. Mudou a duração do vídeo? Mude
`ANALYSIS_DURATION_MS` junto, e confira os cortes de `estimativaRestante()`.

O contador de escassez (5 min) só começa a correr **depois** que a oferta
abre — antes disso a faixa do topo mostra "análise em andamento". Não há
relógio congelado na tela durante o vídeo.

## O player

`VslPlayer.tsx` monta o elemento `<vturb-smartplayer>` e injeta o script da
ConverteAI uma única vez. Dois detalhes que o embed cru não resolve sozinho
dentro do React:

- **script único**: em desenvolvimento o React executa cada efeito duas
  vezes, e dois scripts iguais registram o mesmo elemento duas vezes (o
  player some ou duplica). A marca `data-vsl-zaplens` evita isso.
- **hidratação**: o conteúdo que o player injeta não corresponde ao que o
  servidor renderizou. Sem `suppressHydrationWarning`, o React "conserta" e
  apaga o vídeo.

Para trocar o vídeo, mude `PLAYER_ID` e `SCRIPT_SRC` no topo do arquivo —
os dois vêm juntos no embed que a ConverteAI gera.
