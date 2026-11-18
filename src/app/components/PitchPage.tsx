"use client";

import { useState, useEffect, useRef, useCallback, Fragment } from "react";
import Image from "next/image";
import {
  ShieldCheck,
  MessageCircle,
  Eye,
  MapPin,
  Trash2,
  Heart,
  Lock,
  TriangleAlert,
  BadgeCheck,
  Sparkles,
  Gift,
  Rocket,
  Clock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Volume2,
  Image as ImageIcon,
  Users,
  Star,
  CheckCircle2,
  HelpCircle,
  Phone,
  Video,
  MoreVertical,
  ArrowLeft,
  CheckCheck,
  Smile,
  Paperclip,
  Mic,
  QrCode,
  CreditCard,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useParams, usePathname } from "next/navigation";
import { SUB_PARAM, lerParam } from "../../lib/urlState";
import { useCheckoutUrl } from "../../lib/upsell";
import { linkDaOferta } from "../../lib/checkout/destinos";
import { AvatarContato } from "./AvatarContato";
import VslPlayer from "./VslPlayer";

// Destino do botão de compra. Sai de lib/checkout/destinos.ts, que é o
// interruptor único entre o checkout interno (PIX pela Lezty) e o externo
// da PerfectPay — hoje no externo, porque o gateway caiu.
//
// Indo para fora do domínio, a identificação do lead precisa viajar na URL
// de novo: é o que useCheckoutUrl faz, carimbando lid, nome, telefone e
// cidade para o upsell recuperar depois da compra.
const CHECKOUT_URL = linkDaOferta("principal");

// A oferta não tem volta: nem botão na tela, nem "voltar" do navegador
// (esse é interceptado pelo useNavigation e cai na recuperação). Quem chegou
// na análise fica na análise.
interface PitchPageProps {
  userName: string;
}

interface FAQ {
  question: string;
  answer: string;
}

// Variantes de animação melhoradas e mais suaves
const fadeInUp = {
  hidden: {
    opacity: 0,
    y: 40,
    scale: 0.95,
  },
  visible: (i: number = 1) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      delay: i * 0.1,
      duration: 0.8,
      ease: [0.25, 0.46, 0.45, 0.94], // ease-out-quart
    },
  }),
};

const fadeInLeft = {
  hidden: {
    opacity: 0,
    x: -50,
    scale: 0.9,
  },
  visible: (i: number = 1) => ({
    opacity: 1,
    x: 0,
    scale: 1,
    transition: {
      delay: i * 0.15,
      duration: 0.7,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  }),
};

const scaleIn = {
  hidden: {
    opacity: 0,
    scale: 0.8,
    y: 20,
  },
  visible: (i: number = 1) => ({
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      delay: i * 0.12,
      duration: 0.6,
      ease: [0.34, 1.56, 0.64, 1], // ease-out-back
    },
  }),
};

const slideInRight = {
  hidden: {
    opacity: 0,
    x: 60,
    scale: 0.95,
  },
  visible: (i: number = 1) => ({
    opacity: 1,
    x: 0,
    scale: 1,
    transition: {
      delay: i * 0.08,
      duration: 0.6,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  }),
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

// Variantes para cards com hover melhorado
const cardHover = {
  rest: {
    scale: 1,
    y: 0,
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
  },
  hover: {
    scale: 1.02,
    y: -5,
    boxShadow: "0 8px 25px rgba(0, 0, 0, 0.15)",
    transition: {
      duration: 0.3,
      ease: "easeOut",
    },
  },
};

const primaryColor = "#128C7E";
const primaryDark = "#075E54";
const primaryBright = "#25D366";
// Verde sólido real do WhatsApp (o app original não usa degradê)
const primaryGradient = "#25D366";

// ─── Análise ──────────────────────────────────────────────────────────────
// Como o alvo é chamado quando o número não chegou até aqui.
const ALVO_PADRAO = "esse número";

// Duração total da análise, em milissegundos.
//
// Nesta versão com VSL, este relógio é o tempo de vídeo que a pessoa assiste
// antes de a oferta abrir: 4 minutos. Ela não é obrigada a terminar o vídeo
// — quando a barra fecha, a oferta aparece embaixo e o player continua lá,
// para quem quiser ver o resto.
//
// O número é o mesmo nos dois lugares de propósito: a barra de progresso é a
// única pista visível de quanto falta, e se ela não acompanhar o vídeo a
// pessoa passa a conferir o relógio em vez de assistir.
const ANALYSIS_DURATION_MS = 4 * 60 * 1000;
const ANALYSIS_DURATION_S = ANALYSIS_DURATION_MS / 1000;
const ANALYSIS_COMPLETE_HOLD_MS = 1200;
const ANALYSIS_RADIUS = 26;
const ANALYSIS_CIRCUMFERENCE = 2 * Math.PI * ANALYSIS_RADIUS;

// Volume do backup. Não corresponde a nada real — serve para a análise ter
// uma unidade de trabalho própria, que avança junto com a barra e dá a
// sensação de processo em andamento.
const BACKUP_TOTAL_REGISTROS = 12480;
const BACKUP_LOTES = 7;

const formatarMilhar = (n: number) => n.toLocaleString("pt-BR");

/**
 * Tempo restante da análise, em linguagem de processo.
 *
 * Uma estimativa grossa, que acompanha o progresso e termina em
 * "finalizando" — informa duração e avanço sem prometer um cronômetro exato.
 * Os cortes acompanham a análise de 4 minutos (ANALYSIS_DURATION_S): uma
 * estimativa calibrada para outro tempo entrega na hora que a barra é
 * decorativa.
 */
function estimativaRestante(segundos: number): string {
  if (segundos <= 20) return "finalizando";
  if (segundos <= 60) return "menos de 1 min";
  if (segundos <= 120) return "~2 min";
  if (segundos <= 180) return "~3 min";
  return "~4 min";
}

interface AnalysisChecklistItem {
  icon: typeof MessageCircle;
  title: string;
  description: string;
  bg: string;
  color: string;
  threshold: number;
}

// Achados que pipocam durante a análise. Ficam ancorados no rodapé, para não
// competir com o card de progresso.
interface AnalysisFinding {
  icon: typeof MessageCircle;
  title: (alvo: string) => string;
  detail: string;
  bg: string;
  color: string;
  at: number;
}

// Mockups das provas, desenhados em CSS no visual do WhatsApp escuro.
// Substituem os vídeos antigos, que estavam em inglês e com fotos sem blur —
// qualquer um dos dois entrega a farsa na hora.
const WA_DARK = "#0B141A";
const WA_PANEL = "#202C33";
const WA_BUBBLE_IN = "#202C33";
const WA_BUBBLE_OUT = "#005C4B";
const WA_MUTED = "#8696A0";

/**
 * Faixa de contexto do dossiê: de quem é o backup que está aberto.
 *
 * Ela existe para resolver uma inversão de lógica. O cabeçalho do WhatsApp
 * mostra SEMPRE a outra ponta da conversa, nunca o dono do aparelho. Com o
 * número consultado no cabeçalho, a tela dizia "esta é a conversa do lead COM
 * o alvo" — e aí o balão verde da direita virava mensagem do próprio lead, o
 * oposto do que a manchete acima promete ("recuperamos as mensagens que o
 * alvo apagou").
 *
 * Com a faixa, as duas informações param de brigar: aqui fica a conta cujo
 * backup foi aberto, e lá dentro o WhatsApp volta a se comportar como
 * WhatsApp, com o contato do outro lado. É também a mesma leitura que a
 * engenharia do zap já entrega antes do pitch: lista do alvo, cabeçalho com o
 * contato, balão verde com a fala do alvo.
 *
 * É só etiqueta, sem miniatura: uma foto de perfil crua em tamanho de ícone
 * destoava de tudo nesta página, e quem mostra rosto é o cabeçalho.
 */
function FaixaBackup({ alvo, foto }: { alvo: string; foto?: string | null }) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-2"
      style={{
        backgroundColor: "#0A1419",
        borderBottom: "1px solid rgba(37,211,102,0.16)",
      }}
    >
      <span
        className="text-[9.5px] font-bold uppercase tracking-wider flex-shrink-0"
        style={{ color: WA_MUTED }}
      >
        Backup de
      </span>
      <span className="text-[11px] font-bold text-white truncate min-w-0">
        {alvo}
      </span>
      <Lock
        className="w-3 h-3 flex-shrink-0 ml-auto"
        style={{ color: primaryBright }}
      />
    </div>
  );
}

/**
 * Cabeçalho da conversa, do jeito que o WhatsApp faz: quem aparece aqui é a
 * OUTRA ponta.
 *
 * Por isso `velado` desfoca o NOME: dentro do backup do alvo, o outro lado é
 * um contato que o lead ainda não pode identificar, e saber com quem é
 * justamente o que a oferta vende. A foto continua entrando nos dois modos,
 * desfocada, porque é ela que faz a tela ser a consulta deste lead e não um
 * print qualquer.
 */
function MockHeader({
  nome,
  foto,
  status = "online",
  velado = false,
}: {
  nome: string;
  foto?: string | null;
  status?: string;
  velado?: boolean;
}) {
  return (
    <div
      className="flex items-center gap-2 px-2.5 py-2"
      style={{ backgroundColor: WA_PANEL }}
    >
      <ArrowLeft
        className="w-4 h-4 flex-shrink-0"
        style={{ color: "#AEBAC1" }}
      />
      {/* A foto é a do número consultado, vinda de /api/whatsapp-profile, e
          entra desfocada: no tamanho do cabeçalho o borrão lê como "tem um
          rosto aqui que você ainda não pode ver", que é exatamente o que a
          oferta vende. Sem foto (número sem imagem, ou chave da API ausente)
          entra o avatar genérico do WhatsApp — nunca um rosto de banco de
          imagem, que seria mentir sobre quem é o alvo. */}
      {foto ? (
        <div
          className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0"
          style={{ backgroundColor: "#2A3942" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={foto}
            alt=""
            aria-hidden
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover"
            style={{
              filter: "blur(3px) brightness(0.9)",
              transform: "scale(1.4)",
            }}
          />
        </div>
      ) : (
        <AvatarContato
          nome={nome}
          tamanho={32}
          tone="#6B7C85"
          desfocarInicial={velado}
        />
      )}
      <div className="min-w-0 flex-1">
        <p
          className={`text-[12px] font-semibold text-white truncate ${
            velado ? "blur-[3px] select-none" : ""
          }`}
        >
          {nome}
        </p>
        <p className="text-[10px]" style={{ color: "#8696A0" }}>
          {status}
        </p>
      </div>
      {/* Chamadas e menu: sem eles o topo não lê como uma conversa aberta */}
      <div className="flex items-center gap-3.5 flex-shrink-0 pr-0.5">
        <Video className="w-[18px] h-[18px]" style={{ color: "#AEBAC1" }} />
        <Phone className="w-4 h-4" style={{ color: "#AEBAC1" }} />
        <MoreVertical className="w-4 h-4" style={{ color: "#AEBAC1" }} />
      </div>
    </div>
  );
}

function MockChat({ alvo, foto }: { alvo: string; foto?: string | null }) {
  const bolhas = [
    { out: false, w: "68%", h: 28, hora: "23:14" },
    { out: true, w: "54%", h: 24, hora: "23:16" },
    { out: false, w: "78%", h: 40, hora: "23:21" },
  ];
  return (
    <div
      className="w-full"
      style={{
        backgroundColor: WA_DARK,
        // trama do papel de parede do WhatsApp, bem discreta
        backgroundImage:
          "radial-gradient(rgba(255,255,255,0.025) 1px, transparent 1px)",
        backgroundSize: "18px 18px",
      }}
    >
      <FaixaBackup alvo={alvo} foto={foto} />
      <MockHeader
        nome="+55 43 9•••• ••••"
        foto={foto}
        velado
        status="visto por último ontem às 23:58"
      />
      <div className="px-3 py-2.5 space-y-1.5">
        {/* Divisor de data, como no app */}
        <div className="flex justify-center pb-1">
          <span
            className="text-[9px] font-medium px-2 py-0.5 rounded"
            style={{ backgroundColor: "#182229", color: WA_MUTED }}
          >
            ONTEM
          </span>
        </div>

        {bolhas.map((b, i) => (
          <div
            key={i}
            className={`flex ${b.out ? "justify-end" : "justify-start"}`}
          >
            <div
              className="rounded-lg relative px-2 pb-3.5 pt-1.5"
              style={{
                width: b.w,
                backgroundColor: b.out ? WA_BUBBLE_OUT : WA_BUBBLE_IN,
              }}
            >
              {/* corpo da mensagem, ilegível de propósito */}
              <div
                className="rounded blur-[3px]"
                style={{
                  height: b.h - 14,
                  backgroundColor: "rgba(255,255,255,0.22)",
                }}
              />
              <span
                className="absolute bottom-0.5 right-2 flex items-center gap-0.5 text-[8px]"
                style={{ color: "rgba(255,255,255,0.45)" }}
              >
                {b.hora}
                {b.out && (
                  <CheckCheck className="w-2.5 h-2.5" style={{ color: "#53BDEB" }} />
                )}
              </span>
            </div>
          </div>
        ))}

        {/* As duas legíveis: o gancho.
            Ambas do lado de fora (direita), porque é o alvo que apaga e é a
            fala dele que incrimina. Com a mensagem apagada vindo da esquerda,
            quem tinha apagado era o contato, e a manchete do bloco promete o
            contrário. */}
        <div className="flex justify-end">
          <div
            className="rounded-lg px-2.5 py-1.5 flex items-center gap-1.5"
            style={{ backgroundColor: WA_BUBBLE_OUT, maxWidth: "85%" }}
          >
            <Trash2
              className="w-3 h-3 flex-shrink-0"
              style={{ color: "rgba(255,255,255,0.6)" }}
            />
            <span
              className="text-[11px] italic"
              style={{ color: "rgba(255,255,255,0.72)" }}
            >
              Esta mensagem foi apagada
            </span>
            <span
              className="text-[8px] ml-1"
              style={{ color: "rgba(255,255,255,0.45)" }}
            >
              23:48
            </span>
          </div>
        </div>

        <div className="flex justify-end">
          <div
            className="rounded-lg px-2.5 pt-1.5 pb-1 relative"
            style={{ backgroundColor: WA_BUBBLE_OUT, maxWidth: "85%" }}
          >
            <span className="text-[11px] text-white">
              foi ótimo te ver hoje
            </span>
            <span
              className="flex items-center justify-end gap-0.5 text-[8px] mt-0.5"
              style={{ color: "rgba(255,255,255,0.5)" }}
            >
              23:52
              <CheckCheck className="w-2.5 h-2.5" style={{ color: "#53BDEB" }} />
            </span>
          </div>
        </div>
      </div>

      {/* Barra de digitação: fecha a moldura da conversa */}
      <div className="flex items-center gap-1.5 px-2 py-2">
        <div
          className="flex items-center gap-2 flex-1 rounded-full px-2.5 py-1.5"
          style={{ backgroundColor: WA_PANEL }}
        >
          <Smile className="w-3.5 h-3.5 flex-shrink-0" style={{ color: WA_MUTED }} />
          <span className="text-[10.5px] flex-1" style={{ color: WA_MUTED }}>
            Mensagem
          </span>
          <Paperclip
            className="w-3.5 h-3.5 flex-shrink-0"
            style={{ color: WA_MUTED }}
          />
        </div>
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: "#00A884" }}
        >
          <Mic className="w-3.5 h-3.5 text-white" />
        </div>
      </div>
    </div>
  );
}

// Fotos reais desfocadas. Gradiente em CSS não engana: não tem grão, nem
// pele, nem a luz irregular de uma foto tirada no celular.
//
// Origem: public/wppgalery, uma imagem por quadro. Lembre que o desfoque
// daqui é CSS: os arquivos continuam servidos inteiros em /wppgalery/*.png
// para quem abrir a URL direto, então o que vale é o que já está no arquivo.
//
// O recorte varia pelo translate. Com scale 1.25 a imagem sobra 12,5% para
// cada lado, então deslocar até 7% nunca descobre a borda do quadro.
const MIDIA_PRIVADA = [
  { src: "/wppgalery/1.png", t: "translate(-2%, -3%)" },
  { src: "/wppgalery/2.png", t: "translate(-3%, -2%)" },
  { src: "/wppgalery/3.png", t: "translate(2%, -4%)" },
  { src: "/wppgalery/4.png", t: "translate(-1%, 3%)" },
  { src: "/wppgalery/5.png", t: "translate(4%, 1%)" },
  { src: "/wppgalery/6.png", t: "translate(-4%, 3%)" },
];

function MockGallery({ alvo, foto }: { alvo: string; foto?: string | null }) {
  return (
    <div className="w-full" style={{ backgroundColor: WA_DARK }}>
      <FaixaBackup alvo={alvo} foto={foto} />
      <MockHeader
        nome="+55 43 9•••• ••••"
        foto={foto}
        velado
        status="mídia, links e documentos"
      />
      <div className="px-2.5 pt-2.5 pb-1">
        <p
          className="text-[10px] font-semibold uppercase tracking-wide mb-2"
          style={{ color: WA_MUTED }}
        >
          Mídia enviada em privado
        </p>
        <div className="grid grid-cols-3 gap-1">
          {MIDIA_PRIVADA.map((foto, i) => (
            <div
              key={i}
              className="relative rounded-md overflow-hidden"
              style={{ aspectRatio: "1 / 1", backgroundColor: "#2A3942" }}
            >
              <img
                src={foto.src}
                alt=""
                aria-hidden
                loading="lazy"
                decoding="async"
                className="absolute inset-0 w-full h-full object-cover"
                style={{
                  filter: "blur(7px) saturate(1.05) brightness(0.98)",
                  transform: `scale(1.25) ${foto.t}`,
                }}
              />
              {/* Escurecimento por cima: iguala as fotos, que vêm de luzes
                  diferentes, e mantém o cadeado legível em todas. Leve de
                  propósito: estas fotos já são escuras, e somar véu com
                  brightness apagava o tom de pele que faz o quadro ler como
                  foto. */}
              <div
                className="absolute inset-0"
                style={{ backgroundColor: "rgba(11,20,26,0.18)" }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <Lock className="w-3.5 h-3.5 text-white/75" />
              </div>
              {i === 1 && (
                <div
                  className="absolute bottom-1 left-1 px-1 py-0.5 rounded"
                  style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
                >
                  <span className="text-[7px] font-bold text-white">1x</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Camada de mapa sem chave de API, montada com os tiles do OpenStreetMap.
//
// O quadro lógico é 480x330, exatamente a proporção 16/11 do contêiner, então
// posicionar os tiles em PORCENTAGEM faz o mapa escalar sozinho em qualquer
// largura — sem medir o elemento nem recalcular no resize.
//
// Atenção para produção: a política do OSM desaconselha uso pesado dos tiles
// públicos. Com tráfego de campanha, coloque o token do Mapbox em
// NEXT_PUBLIC_MAPBOX_TOKEN — o código volta a usá-lo sozinho.
const TILE_PX = 256;
const FRAME_W = 480;
const FRAME_H = 330;

function tilesDoMapa(lat: number, lon: number, zoom = 14) {
  const n = 2 ** zoom;
  const xFrac = ((lon + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const yFrac =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;

  // Canto superior esquerdo do quadro, em pixels do mundo.
  const esqX = xFrac * TILE_PX - FRAME_W / 2;
  const topY = yFrac * TILE_PX - FRAME_H / 2;

  const x0 = Math.floor(esqX / TILE_PX);
  const y0 = Math.floor(topY / TILE_PX);
  const x1 = Math.floor((esqX + FRAME_W) / TILE_PX);
  const y1 = Math.floor((topY + FRAME_H) / TILE_PX);

  const lista: Array<{ url: string; left: number; top: number }> = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      // Fora do intervalo vertical do mundo não existe tile.
      if (y < 0 || y >= n) continue;
      const xEnvolto = ((x % n) + n) % n;
      lista.push({
        url: `https://tile.openstreetmap.org/${zoom}/${xEnvolto}/${y}.png`,
        left: ((x * TILE_PX - esqX) / FRAME_W) * 100,
        top: ((y * TILE_PX - topY) / FRAME_H) * 100,
      });
    }
  }
  return lista;
}

function MockMap({
  alvo,
  place,
  coords,
  foto,
}: {
  alvo: string;
  place: string | null;
  coords: { lat: number; lon: number } | null;
  foto?: string | null;
}) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  // Zoom de bairro: ruas e quarteirões aparecem, mas o endereço exato não.
  const mapUrl =
    token && coords
      ? `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${coords.lon},${coords.lat},14,0/480x330?access_token=${token}&attribution=false&logo=false`
      : null;

  // Sem token do Mapbox, o mapa virava uma malha cinza e o bloco inteiro
  // perdia a força. Os tiles do OpenStreetMap não pedem chave e seguram a
  // cena enquanto o token não entra.
  const tiles = !mapUrl && coords ? tilesDoMapa(coords.lat, coords.lon) : [];

  return (
    <div className="w-full" style={{ backgroundColor: WA_DARK }}>
      <FaixaBackup alvo={alvo} foto={foto} />
      <MockHeader
        nome="+55 43 9•••• ••••"
        foto={foto}
        velado
        status="localização compartilhada ontem"
      />
      <div
        className="relative w-full overflow-hidden"
        style={{ aspectRatio: "16 / 11", backgroundColor: "#1B2B33" }}
      >
        {mapUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={mapUrl}
            alt=""
            aria-hidden="true"
            draggable={false}
            className="absolute inset-0 w-full h-full object-cover select-none"
            style={{ filter: "blur(3px)", transform: "scale(1.06)" }}
          />
        ) : tiles.length > 0 ? (
          /* Tiles do OSM. O filtro inverte e dessatura para o mapa claro do
             OSM virar escuro e combinar com o tema do WhatsApp. */
          <div
            className="absolute inset-0 overflow-hidden"
            style={{
              filter:
                "invert(0.92) hue-rotate(180deg) saturate(0.55) brightness(0.82) blur(3px)",
              transform: "scale(1.06)",
            }}
          >
            {tiles.map((t) => (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                key={t.url}
                src={t.url}
                alt=""
                aria-hidden
                loading="lazy"
                decoding="async"
                draggable={false}
                className="absolute select-none"
                style={{
                  left: `${t.left}%`,
                  top: `${t.top}%`,
                  width: `${(TILE_PX / FRAME_W) * 100}%`,
                  height: `${(TILE_PX / FRAME_H) * 100}%`,
                }}
              />
            ))}
          </div>
        ) : (
          /* Sem coordenadas: malha neutra no lugar do mapa */
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "repeating-linear-gradient(0deg, transparent, transparent 26px, rgba(255,255,255,0.06) 26px, rgba(255,255,255,0.06) 28px), repeating-linear-gradient(90deg, transparent, transparent 38px, rgba(255,255,255,0.06) 38px, rgba(255,255,255,0.06) 40px)",
            }}
          />
        )}

        {/* Atribuição exigida pela licença do OSM. Discreta, mas presente:
            usar os tiles sem creditar viola a licença. */}
        {tiles.length > 0 && (
          <span
            className="absolute bottom-1 right-1.5 z-10 text-[8px] leading-none"
            style={{ color: "rgba(255,255,255,0.45)" }}
          >
            © OpenStreetMap
          </span>
        )}

        {/* Véu leve: escurece o suficiente para o pin ler, sem apagar as
            cores do mapa — são elas que fazem parecer um print de verdade */}
        <div
          className="absolute inset-0"
          style={{ backgroundColor: "rgba(11,20,26,0.28)" }}
        />

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            animate={{ scale: [1, 2.1], opacity: [0.35, 0] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeOut" }}
            className="absolute w-12 h-12 rounded-full"
            style={{ backgroundColor: "#25D366" }}
          />
          {/* Pin de mapa com o cadeado dentro */}
          <div className="relative z-10 flex flex-col items-center">
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center shadow-lg"
              style={{
                backgroundColor: "#25D366",
                border: "3px solid rgba(255,255,255,0.9)",
              }}
            >
              <Lock className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <div
              style={{
                width: 0,
                height: 0,
                borderLeft: "7px solid transparent",
                borderRight: "7px solid transparent",
                borderTop: "10px solid rgba(255,255,255,0.9)",
                marginTop: -3,
              }}
            />
          </div>
          <span
            className="relative z-10 mt-2 text-[12px] font-bold text-white"
            style={{ textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}
          >
            Localização bloqueada
          </span>
        </div>
      </div>
      <div className="px-3 py-2.5 flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-[11.5px] font-semibold text-white truncate">
            {place ? `Visto em ${place}` : "Localização em tempo real"}
          </p>
          <p className="text-[10px]" style={{ color: WA_MUTED }}>
            Ontem, 23h47 · a 4,2 km do endereço habitual
          </p>
        </div>
        <Lock
          className="w-3.5 h-3.5 flex-shrink-0 ml-2"
          style={{ color: WA_MUTED }}
        />
      </div>
    </div>
  );
}

function MockAudio({ alvo, foto }: { alvo: string; foto?: string | null }) {
  const audios = [
    { out: false, dur: "0:47", hora: "01:12" },
    { out: true, dur: "1:23", hora: "02:38" },
    { out: false, dur: "0:19", hora: "03:04" },
  ];
  return (
    <div className="w-full" style={{ backgroundColor: WA_DARK }}>
      <FaixaBackup alvo={alvo} foto={foto} />
      <MockHeader
        nome="+55 43 9•••• ••••"
        foto={foto}
        velado
        status="visto por último hoje às 04:12"
      />
      <div className="px-3 py-3 space-y-2.5">
        {audios.map((a, i) => (
          <div
            key={i}
            className={`flex ${a.out ? "justify-end" : "justify-start"}`}
          >
            <div
              className="rounded-lg px-2.5 py-2 flex items-center gap-2"
              style={{
                backgroundColor: a.out ? WA_BUBBLE_OUT : WA_BUBBLE_IN,
                width: "82%",
              }}
            >
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: "rgba(255,255,255,0.14)" }}
              >
                <Lock className="w-3 h-3 text-white/80" />
              </div>
              {/* onda sonora */}
              <div className="flex items-center gap-[2px] flex-1 h-5">
                {Array.from({ length: 22 }).map((_, b) => (
                  <span
                    key={b}
                    className="flex-1 rounded-full"
                    style={{
                      height: `${25 + ((b * 37) % 70)}%`,
                      backgroundColor: "rgba(255,255,255,0.4)",
                    }}
                  />
                ))}
              </div>
              <span
                className="text-[9.5px] flex-shrink-0"
                style={{ color: "rgba(255,255,255,0.65)" }}
              >
                {a.dur}
              </span>
            </div>
          </div>
        ))}
        <p
          className="text-[10px] text-center pt-1"
          style={{ color: WA_MUTED }}
        >
          Enviados entre 01h e 03h
        </p>
      </div>
    </div>
  );
}

/**
 * Registro de conexão: a que horas o aparelho esteve online de verdade.
 *
 * É a prova mais barata de entender e a mais difícil de explicar em casa.
 * Mensagem apagada ainda comporta desculpa ("era brincadeira do grupo"); já
 * "esteve online às 02:41 na noite em que disse que tinha dormido cedo" é um
 * horário contra uma frase. O WhatsApp mostra "visto por último" — e é
 * justamente isso que a pessoa oculta quando tem o que esconder.
 */
function MockConexao({ alvo, foto }: { alvo: string; foto?: string | null }) {
  const registros = [
    { dia: "Hoje", hora: "02:41", duracao: "1h 12min", alerta: true },
    { dia: "Ontem", hora: "03:07", duracao: "48min", alerta: true },
    { dia: "Ontem", hora: "23:52", duracao: "36min", alerta: false },
    { dia: "Sábado", hora: "01:19", duracao: "2h 04min", alerta: true },
  ];
  return (
    <div className="w-full" style={{ backgroundColor: WA_DARK }}>
      <FaixaBackup alvo={alvo} foto={foto} />

      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ backgroundColor: "#182229" }}
      >
        <span className="text-[10.5px] font-semibold" style={{ color: WA_MUTED }}>
          Visto por último · status oculto
        </span>
        <span className="flex items-center gap-1">
          <Lock className="w-3 h-3" style={{ color: "#F59E0B" }} />
          <span className="text-[10px] font-bold" style={{ color: "#F59E0B" }}>
            recuperado
          </span>
        </span>
      </div>

      <div className="px-3 py-3 space-y-2">
        {registros.map((r, i) => (
          <div
            key={i}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2.5"
            style={{
              backgroundColor: WA_BUBBLE_IN,
              borderLeft: `3px solid ${r.alerta ? "#EF4444" : "rgba(255,255,255,0.12)"}`,
            }}
          >
            <Clock
              className="w-3.5 h-3.5 flex-shrink-0"
              style={{ color: r.alerta ? "#EF4444" : WA_MUTED }}
            />
            <p className="text-[12px] text-white font-semibold flex-1 min-w-0">
              {r.dia}, às{" "}
              <span className="tabular-nums" style={{ color: r.alerta ? "#F87171" : "#fff" }}>
                {r.hora}
              </span>
              <span className="block text-[10px] font-normal" style={{ color: WA_MUTED }}>
                conectado por {r.duracao}
              </span>
            </p>
            <span
              className="text-[9.5px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 blur-[3px] select-none"
              style={{
                backgroundColor: "rgba(255,255,255,0.08)",
                color: "rgba(255,255,255,0.7)",
              }}
            >
              com quem
            </span>
          </div>
        ))}
        <p className="text-[10px] text-center pt-1" style={{ color: WA_MUTED }}>
          4 conexões registradas entre 23h e 04h nesta semana
        </p>
      </div>
    </div>
  );
}

// Blocos de evidência da oferta. Cada um é um "dossiê" fechado: etiqueta da
// categoria, o que foi achado, a prova em vídeo e o selo de bloqueio.
interface EvidenceBlock {
  tag: string;
  icon: typeof MessageCircle;
  headline: (alvo: string) => { before: string; target: string; after: string };
  body: (alvo: string) => string;
  mock: "chat" | "gallery" | "map" | "audio" | "conexao";
  lockLabel: string;
}

const EVIDENCE_BLOCKS: EvidenceBlock[] = [
  {
    tag: "Mensagens apagadas recuperadas",
    icon: MessageCircle,
    headline: (alvo) => ({
      before: "Recuperamos as mensagens excluídas do WhatsApp de",
      target: alvo,
      after: "",
    }),
    body: (alvo) =>
      `Conversas que ${alvo} apagou achando que ninguém mais veria. Nosso sistema restaurou o conteúdo direto do backup.`,
    mock: "chat" as const,
    lockLabel: "Conversas bloqueadas",
  },
  {
    tag: "Fotos privadas encontradas",
    icon: ImageIcon,
    headline: (alvo) => ({
      before: "Encontramos fotos enviadas em privado por",
      target: alvo,
      after: "",
    }),
    body: () =>
      "Imagens trocadas em conversas privadas, incluindo as de visualização única que desaparecem depois de abertas.",
    mock: "gallery" as const,
    lockLabel: "Mídia bloqueada",
  },
  {
    tag: "Última conexão detectada",
    icon: Clock,
    headline: (alvo) => ({
      before: "",
      target: alvo,
      after: "esteve online nos horários que jurou estar dormindo",
    }),
    body: () =>
      "O aparelho registra cada conexão mesmo com o \"visto por último\" desativado. Recuperamos os horários reais, com a duração de cada uma.",
    mock: "conexao" as const,
    lockLabel: "Registros bloqueados",
  },
  {
    tag: "Localização em segredo",
    icon: MapPin,
    headline: (alvo) => ({
      before: "",
      target: alvo,
      after: "compartilhou a localização em horários suspeitos",
    }),
    body: () =>
      "Detectamos a rota real percorrida e os locais fora da rotina habitual, com data e hora de cada parada.",
    mock: "map" as const,
    lockLabel: "Localização bloqueada",
  },
  {
    tag: "Áudios interceptados",
    icon: Volume2,
    headline: (alvo) => ({
      before: "Interceptamos os áudios enviados por",
      target: alvo,
      after: "",
    }),
    body: () =>
      "Mensagens de voz capturadas e transcritas, inclusive as enviadas de madrugada e apagadas em seguida.",
    mock: "audio" as const,
    lockLabel: "Áudios bloqueados",
  },
];

/**
 * A oferta no meio da escada de provas.
 *
 * A oferta principal fica no fim da página, depois de garantia, depoimentos
 * e dossiê inteiro. Isso funciona quando uma VSL já nutriu o lead: ele chega
 * embaixo decidido. Sem VSL, o pico emocional acontece MUITO antes — logo
 * depois de ver as conversas apagadas e as fotos privadas —, e nesse ponto
 * não havia onde comprar. Quem decidia ali tinha que percorrer meia página
 * procurando um botão, e decisão por impulso não sobrevive a essa rolagem.
 *
 * Este bloco é o preço onde a emoção está. O dossiê continua abaixo dele
 * para quem ainda não decidiu, e a oferta completa segue no fim.
 */
/**
 * Formas de pagamento aceitas no checkout.
 *
 * O checkout cobra tanto por PIX quanto por cartão de crédito, mas a página
 * só falava em PIX — e quem não usa PIX desistia antes de clicar, achando
 * que não tinha como pagar. Estes selos mostram as duas opções no mesmo
 * ponto em que o preço aparece, antes do botão.
 */
function FormasDePagamento() {
  return (
    <div
      className="flex items-center justify-center gap-2 mt-3 pt-3"
      style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
    >
      {[
        { icon: QrCode, label: "PIX" },
        { icon: CreditCard, label: "Cartão de crédito" },
      ].map((f) => {
        const Icon = f.icon;
        return (
          <span
            key={f.label}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
            style={{
              backgroundColor: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <Icon
              className="w-3.5 h-3.5 flex-shrink-0"
              style={{ color: primaryBright }}
            />
            <span className="text-[11px] font-semibold text-white whitespace-nowrap">
              {f.label}
            </span>
          </span>
        );
      })}
    </div>
  );
}

function OfertaAntecipada({
  alvo,
  checkoutUrl,
  tempo,
}: {
  alvo: string;
  checkoutUrl: string;
  tempo: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.5 }}
      className="rounded-3xl overflow-hidden shadow-2xl"
      style={{
        backgroundColor: "#0B141A",
        border: `1px solid ${primaryBright}66`,
        boxShadow: `0 0 36px ${primaryBright}1F, 0 18px 44px rgba(0,0,0,0.3)`,
      }}
    >
      <div
        className="flex items-center justify-between gap-2 px-5 py-3"
        style={{
          backgroundColor: "rgba(37,211,102,0.10)",
          borderBottom: "1px solid rgba(37,211,102,0.14)",
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Lock className="w-4 h-4 flex-shrink-0" style={{ color: primaryBright }} />
          <span
            className="text-[11px] font-bold uppercase tracking-wider truncate"
            style={{ color: primaryBright }}
          >
            Desbloqueio imediato
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Clock className="w-3.5 h-3.5" style={{ color: "#F59E0B" }} />
          <span
            className="text-[12px] font-bold tabular-nums"
            style={{ color: "#F59E0B" }}
          >
            {tempo}
          </span>
        </div>
      </div>

      <div className="px-5 pt-5 pb-5 text-left">
        <h3 className="text-[20px] sm:text-[22px] font-bold text-white leading-snug mb-1.5">
          Abra agora tudo o que está borrado aí em cima
        </h3>
        <p className="text-[13.5px] leading-relaxed mb-4" style={{ color: "#8696A0" }}>
          Conversas apagadas, fotos privadas, áudios e localização de{" "}
          <span className="font-bold" style={{ color: primaryBright }}>
            {alvo}
          </span>
          . Liberação na hora, sem notificação no aparelho dele.
        </p>

        <div
          className="rounded-2xl px-4 py-4 mb-4 text-center"
          style={{
            backgroundColor: "#111B21",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <p className="flex items-center justify-center gap-2 text-[12.5px] mb-1.5" style={{ color: "#8696A0" }}>
            <span className="line-through" style={{ color: "#EF4444" }}>
              R$ 297,00
            </span>
            <span
              className="px-2 py-0.5 rounded-full text-[10.5px] font-extrabold"
              style={{ backgroundColor: "#DC2626", color: "#fff" }}
            >
              87% OFF
            </span>
          </p>

          <p className="flex items-baseline justify-center gap-1 whitespace-nowrap">
            <span className="text-[19px] font-bold" style={{ color: primaryBright }}>
              R$
            </span>
            <span
              className="text-[46px] font-bold leading-none"
              style={{ color: primaryBright }}
            >
              37
            </span>
            <span className="text-[24px] font-bold" style={{ color: primaryBright }}>
              ,90
            </span>
          </p>
          {/* Sem número de parcelas: o checkout aceita cartão, mas quem
              define as condições é o gateway. Prometer "9x de" aqui seria
              anunciar o que a página não controla. */}
          <p className="text-[12.5px] text-white mt-1">
            no <span className="font-bold">PIX</span> ou no{" "}
            <span className="font-bold">cartão</span>, liberação na hora
          </p>
          <FormasDePagamento />
        </div>

        <motion.a
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          href={checkoutUrl}
          onClick={() => {
            import("react-facebook-pixel")
              .then((x) => x.default)
              .then((ReactPixel) => {
                ReactPixel.track("InitiateCheckout", {
                  value: "37.90",
                  currency: "BRL",
                  content_type: "product",
                  content_ids: ["relatorio-completo"],
                });
              });
          }}
          className="relative overflow-hidden flex items-center justify-center w-full font-bold py-4 px-5 rounded-2xl text-[16px] sm:text-lg text-white text-center shadow-lg mega-pulse-button"
          style={{
            background: primaryGradient,
            backgroundSize: "200% 200%",
            boxShadow: `0 0 24px ${primaryBright}4D, 0 6px 20px rgba(0,0,0,0.25)`,
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-20 shine-animation" />
          <span className="relative z-10 mega-pulse-text">DESBLOQUEAR ACESSO AGORA</span>
        </motion.a>

        <div className="grid grid-cols-2 gap-2 mt-3.5">
          {[
            { icon: ShieldCheck, label: "Garantia de 7 dias" },
            { icon: Lock, label: "Compra 100% segura" },
            { icon: Eye, label: "Acesso anônimo" },
            { icon: Rocket, label: "Liberação imediata" },
          ].map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.label}
                className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl min-w-0"
                style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
              >
                <Icon
                  className="w-3.5 h-3.5 flex-shrink-0"
                  style={{ color: primaryBright }}
                />
                <span
                  className="text-[10.5px] font-semibold truncate"
                  style={{ color: "#8696A0" }}
                >
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

// Depoimentos em vídeo (public/depoimentos)
const DEPOIMENTOS = [
  {
    arquivo: "1.mp4",
    nome: "Marcelo R.",
    legenda: "Descobri em 3 minutos o que suspeitei por meses.",
  },
  {
    arquivo: "2.mp4",
    nome: "Diego A.",
    legenda: "Valeu cada centavo pela paz de espírito.",
  },
  {
    arquivo: "3.mp4",
    nome: "Juliana M.",
    legenda: "Ela nunca soube que eu tinha visto.",
  },
];

// Carrossel dos depoimentos.
//
// A rolagem por arraste sozinha não se anuncia: no desktop não há gesto, e no
// celular o terceiro vídeo fica fora da tela sem nada indicando que existe.
// As setas resolvem os dois casos e somem nas pontas, para não sugerir um
// quarto vídeo que não existe.
function DepoimentosCarrossel() {
  const trilhoRef = useRef<HTMLDivElement>(null);
  const [temAntes, setTemAntes] = useState(false);
  const [temDepois, setTemDepois] = useState(true);

  const medir = () => {
    const el = trilhoRef.current;
    if (!el) return;
    // A folga de 4px evita que o arredondamento de subpixel deixe a seta
    // acesa no fim da trilha.
    setTemAntes(el.scrollLeft > 4);
    setTemDepois(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    medir();
    const el = trilhoRef.current;
    if (!el) return;
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const mover = (direcao: -1 | 1) => {
    const el = trilhoRef.current;
    if (!el) return;
    // Anda um cartão por clique: rolar a largura visível pularia vídeos no
    // desktop, onde cabem dois e meio.
    const cartao = el.querySelector("figure");
    const passo = cartao ? cartao.clientWidth + 12 : el.clientWidth * 0.8;
    el.scrollBy({ left: passo * direcao, behavior: "smooth" });
  };

  return (
    <div className="relative">
      <div
        ref={trilhoRef}
        onScroll={medir}
        className="flex gap-3 overflow-x-auto px-5 pb-5 pt-3 snap-x snap-mandatory [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {DEPOIMENTOS.map((d) => (
          <figure
            key={d.arquivo}
            className="snap-center flex-shrink-0 w-[208px] rounded-2xl overflow-hidden"
            style={{
              backgroundColor: "#111B21",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <video
              src={`/depoimentos/${d.arquivo}#t=1.5`}
              controls
              playsInline
              preload="metadata"
              className="w-full bg-black"
              style={{ aspectRatio: "1 / 1", objectFit: "cover" }}
            />
            <figcaption className="px-3 py-2.5">
              <div className="flex items-center gap-1 mb-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className="w-3 h-3"
                    style={{ color: "#F59E0B" }}
                    fill="#F59E0B"
                  />
                ))}
              </div>
              <p className="text-[12.5px] font-bold text-white leading-tight">
                {d.nome}
              </p>
              <p
                className="text-[11px] leading-snug mt-0.5"
                style={{ color: "#8696A0" }}
              >
                {d.legenda}
              </p>
            </figcaption>
          </figure>
        ))}
      </div>

      {/* As setas ficam sobre o trilho, alinhadas ao miolo do vídeo e não ao
          cartão inteiro: no rodapé do cartão elas cairiam sobre a legenda. */}
      <SetaDepoimento lado="esquerda" ativa={temAntes} aoClicar={() => mover(-1)} />
      <SetaDepoimento lado="direita" ativa={temDepois} aoClicar={() => mover(1)} />
    </div>
  );
}

function SetaDepoimento({
  lado,
  ativa,
  aoClicar,
}: {
  lado: "esquerda" | "direita";
  ativa: boolean;
  aoClicar: () => void;
}) {
  const Icone = lado === "esquerda" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={aoClicar}
      aria-label={
        lado === "esquerda" ? "Depoimento anterior" : "Próximo depoimento"
      }
      aria-hidden={!ativa}
      tabIndex={ativa ? 0 : -1}
      /* Nada de backdrop-filter aqui: o botão fica por cima dos <video> dos
         depoimentos, e o Chrome repinta a área desfocada a cada quadro do
         vídeo — ao passar o mouse ou o dedo, o círculo piscava e deixava um
         retângulo preto. Fundo opaco resolve e não muda a aparência. */
      className={`absolute top-[116px] -translate-y-1/2 z-10 grid place-items-center w-9 h-9 rounded-full border transition duration-200 hover:scale-105 active:scale-95 ${
        lado === "esquerda" ? "left-1.5" : "right-1.5"
      } ${ativa ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      style={{
        backgroundColor: "#0B141A",
        borderColor: "rgba(37,211,102,0.45)",
        boxShadow: "0 2px 10px rgba(0,0,0,0.5)",
        // Sem isto o toque no celular espera 300ms e pode virar duplo-toque
        // de zoom em vez de clique.
        touchAction: "manipulation",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <Icone className="w-5 h-5" style={{ color: primaryBright }} />
    </button>
  );
}

const ANALYSIS_FINDINGS: AnalysisFinding[] = [
  {
    icon: MessageCircle,
    title: () => "47 mensagens apagadas recuperadas",
    detail: "Excluídas nas últimas 72 horas",
    bg: "#DCFCE7",
    color: "#16A34A",
    at: 14,
  },
  {
    icon: ImageIcon,
    title: (alvo) => `Fotos enviadas em privado por ${alvo}`,
    detail: "8 arquivos restaurados do backup",
    bg: "#FCE7F3",
    color: "#DB2777",
    at: 30,
  },
  {
    icon: Eye,
    title: () => "3 fotos de visualização única restauradas",
    detail: "Quem enviou acredita que sumiram",
    bg: "#EDE9FE",
    color: "#7C3AED",
    at: 46,
  },
  {
    icon: MapPin,
    title: (alvo) => `${alvo} compartilhou localização em segredo`,
    detail: "Ontem, 23h47, fora da rota habitual",
    bg: "#FEF3C7",
    color: "#D97706",
    at: 62,
  },
  {
    icon: Volume2,
    title: () => "12 áudios interceptados de madrugada",
    detail: "Enviados entre 00h e 04h",
    bg: "#DBEAFE",
    color: "#2563EB",
    at: 78,
  },
  {
    icon: Users,
    title: () => "2 conversas arquivadas em segredo",
    detail: "Ocultas da lista principal",
    bg: "#FEE2E2",
    color: "#DC2626",
    at: 91,
  },
];

// O laudo do topo da oferta.
//
// Sem VSL, é este bloco que tem de fazer o trabalho que o vídeo fazia:
// provar que a desconfiança do lead tinha razão de ser. Por isso ele não
// promete nada — relata. São os mesmos achados que a análise mostrou um a um
// (ANALYSIS_FINDINGS), reunidos aqui como um resumo de ocorrência, com
// quantidade, horário e janela de tempo. Número e hora são o que separa um
// alerta de verdade de um texto de propaganda.
// A lista é longa de propósito. Quatro linhas genéricas ("atividade
// suspeita", "conteúdo apagado") o lead lê como texto de anúncio; nove linhas
// com contagem, palavra encontrada, horário e cidade ele lê como relatório —
// e relatório é o que faz alguém parar de achar que está imaginando coisa.
// As palavras citadas ("amor", "saudade") fazem o trabalho mais pesado: cada
// uma obriga o lead a montar a cena na cabeça dele.
const alertasCriticos = (cidade: string | null) => [
  {
    icon: MessageCircle,
    texto: "58 mensagens suspeitas identificadas",
    detalhe: "nas últimas duas semanas",
    cor: "#DC2626",
  },
  {
    icon: Heart,
    texto: '41 mensagens contendo a palavra "amor"',
    detalhe: "trocadas com um contato fora da agenda",
    cor: "#DC2626",
  },
  {
    icon: MessageCircle,
    texto: '13 mensagens contendo "saudade" e "gostoso(a)"',
    detalhe: "concentradas à noite e de madrugada",
    cor: "#DC2626",
  },
  {
    icon: Trash2,
    texto: "47 mensagens apagadas do aparelho",
    detalhe: "excluídas nas últimas 72 horas",
    cor: "#DC2626",
  },
  {
    icon: ImageIcon,
    texto: "20 fotos e 5 vídeos protegidos por senha",
    detalhe: "escondidos em pasta privada do telefone",
    cor: "#D97706",
  },
  {
    icon: Eye,
    texto: "9 imagens de visualização única restauradas",
    detalhe: "quem enviou acredita que elas sumiram",
    cor: "#D97706",
  },
  {
    icon: Volume2,
    texto: "12 áudios enviados entre 00h e 04h",
    detalhe: "apagados logo depois de ouvidos",
    cor: "#D97706",
  },
  {
    icon: MapPin,
    texto: cidade
      ? `7 paradas fora da rotina nas proximidades de ${cidade}`
      : "7 paradas fora da rotina habitual",
    detalhe: "a mais recente ontem, 23h47",
    cor: "#D97706",
  },
  {
    icon: Users,
    texto: "2 conversas arquivadas em segredo",
    detalhe: "ocultas da lista principal do aplicativo",
    cor: "#DC2626",
  },
];

const analysisChecklist: AnalysisChecklistItem[] = [
  {
    icon: MessageCircle,
    title: "Mensagens apagadas",
    description: "Conversas excluídas",
    bg: "#DCFCE7",
    color: "#16A34A",
    threshold: 20,
  },
  {
    icon: ImageIcon,
    title: "Fotos e vídeos privados",
    description: "Imagens em conversas privadas",
    bg: "#FCE7F3",
    color: "#DB2777",
    threshold: 40,
  },
  {
    icon: Clock,
    title: "Última conexão real",
    description: "Horário exato mesmo que oculto",
    bg: "#FEF3C7",
    color: "#D97706",
    threshold: 60,
  },
  {
    icon: Users,
    title: "Contatos e grupos ocultos",
    description: "Pessoas e grupos em segredo",
    bg: "#EDE9FE",
    color: "#7C3AED",
    threshold: 80,
  },
  {
    icon: MapPin,
    title: "Localização em tempo real",
    description: "Localização compartilhada detectada",
    bg: `${primaryColor}1A`,
    color: primaryColor,
    threshold: 100,
  },
];

// Componente para o item do Acordeão FAQ com animações melhoradas
const AccordionItem = ({ faq, index }: { faq: FAQ; index: number }) => {
  const [isOpen, setIsOpen] = useState(index === 0);

  return (
    <motion.div
      variants={fadeInUp}
      custom={index}
      initial="hidden"
      animate="visible"
      className="rounded-2xl overflow-hidden"
      style={{
        backgroundColor: "#111B21",
        border: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      <h2>
        <button
          type="button"
          className="flex items-center justify-between gap-3 w-full px-4 py-3.5 text-left"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
        >
          <span className="text-[13.5px] font-semibold text-white leading-snug">
            {faq.question}
          </span>
          <motion.div
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="flex-shrink-0"
          >
            <ChevronDown
              className="w-4 h-4"
              style={{ color: primaryBright }}
            />
          </motion.div>
        </button>
      </h2>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="content"
            initial={{ opacity: 0, height: 0, y: -10 }}
            animate={{
              opacity: 1,
              height: "auto",
              y: 0,
              transition: {
                height: {
                  duration: 0.4,
                  ease: [0.25, 0.46, 0.45, 0.94],
                },
                opacity: {
                  duration: 0.3,
                  delay: 0.1,
                },
                y: {
                  duration: 0.3,
                  delay: 0.1,
                },
              },
            }}
            exit={{
              opacity: 0,
              height: 0,
              y: -10,
              transition: {
                height: {
                  duration: 0.3,
                  ease: [0.25, 0.46, 0.45, 0.94],
                },
                opacity: {
                  duration: 0.2,
                },
              },
            }}
            className="overflow-hidden"
          >
            <motion.div
              className="text-[12.5px] leading-relaxed whitespace-pre-line px-4 pb-3.5"
              style={{ color: "#8696A0" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.3 }}
            >
              {faq.answer}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default function PitchPage({ userName }: PitchPageProps) {
  const checkoutUrl = useCheckoutUrl(CHECKOUT_URL);
  const [timeLeft, setTimeLeft] = useState(5 * 60);
  // Sem número (link direto para ?etapa=pitch, ou localStorage limpo), as
  // manchetes terminavam em "enviadas em privado por" e paravam no vazio.
  const [currentUsername, setCurrentUsername] = useState(
    userName || ALVO_PADRAO
  );
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
  const [analysisPercent, setAnalysisPercent] = useState(0);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [showAnalise, setShowAnalise] = useState(true);

  // Ritmo da análise. Em ref, não em estado: é lido de dentro do intervalo,
  // onde um valor congelado no closure levaria a barra a reiniciar ou travar.
  const maiorPercentRef = useRef(0);
  const concluirRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showFloatingCta, setShowFloatingCta] = useState(false);
  const [activeFinding, setActiveFinding] = useState<number | null>(null);
  const [leadPlace, setLeadPlace] = useState<string | null>(null);
  const [leadCoords, setLeadCoords] = useState<{
    lat: number;
    lon: number;
  } | null>(null);
  const shownFindings = useRef<Set<number>>(new Set());
  const heroRef = useRef<HTMLDivElement>(null);

  // Horário da última atividade detectada. Sai do relógio do próprio lead —
  // "23h47" é uma data qualquer; "há 9 minutos, 19:07" é uma coisa que
  // acabou de acontecer no celular que ele conhece. Calculado no efeito
  // porque o servidor não tem como saber que horas são no navegador.
  const [horaDeteccao, setHoraDeteccao] = useState<string | null>(null);
  // Carimbo do relatório, com segundos. É um detalhe bobo que muda tudo:
  // "gerado em 16/11/2026 19:30:50" é como um sistema fala; uma página de
  // venda não teria por que inventar os segundos.
  const [carimboRelatorio, setCarimboRelatorio] = useState<string | null>(null);
  useEffect(() => {
    const dois = (n: number) => String(n).padStart(2, "0");
    const quando = new Date(Date.now() - 9 * 60 * 1000);
    setHoraDeteccao(`${dois(quando.getHours())}:${dois(quando.getMinutes())}`);

    const agora = new Date();
    setCarimboRelatorio(
      `${dois(agora.getDate())}/${dois(agora.getMonth() + 1)}/${agora.getFullYear()} ` +
        `${dois(agora.getHours())}:${dois(agora.getMinutes())}:${dois(agora.getSeconds())}`
    );
  }, []);

  // Só a cidade: "Andirá, PR" numa frase corrida fica burocrático.
  const cidadeLead = leadPlace ? leadPlace.split(",")[0].trim() : null;
  const pricingRef = useRef<HTMLDivElement>(null);

  const pathname = usePathname();

  // Botão flutuante de desbloqueio: aparece depois que a pessoa rola para
  // além da seção herói, e some assim que o bloco de oferta entra na tela
  // (evita duplicar o CTA quando o botão real já está visível).
  useEffect(() => {
    if (!isUnlocked) return;
    const handleScroll = () => {
      const heroBottom = heroRef.current?.getBoundingClientRect().bottom ?? Infinity;
      const pricingTop = pricingRef.current?.getBoundingClientRect().top ?? Infinity;
      const pastHero = heroBottom < 0;
      const reachedPricing = pricingTop < window.innerHeight;
      setShowFloatingCta(pastHero && !reachedPricing);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [isUnlocked]);

  // Timer de acesso exclusivo — só começa a contar depois que o conteúdo é liberado
  useEffect(() => {
    if (!isUnlocked || timeLeft === 0) return;
    const timer = setInterval(() => {
      setTimeLeft((prevTime) => (prevTime > 0 ? prevTime - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [isUnlocked, timeLeft]);

  // Depois de desbloquear, recolhe o bloco de análise e leva o usuário
  // direto para o topo da oferta — sem precisar rolar a página
  useEffect(() => {
    if (!isUnlocked) return;
    const t = setTimeout(() => {
      setShowAnalise(false);
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }, 1400);
    return () => clearTimeout(t);
  }, [isUnlocked]);

  // A barra nunca anda para trás: uma análise que regride não existe.
  const publicarProgresso = useCallback((percent: number) => {
    const limitado = Math.min(100, Math.max(0, percent));
    if (limitado <= maiorPercentRef.current) return;
    maiorPercentRef.current = limitado;
    setAnalysisPercent(limitado);

    if (limitado >= 100 && !concluirRef.current) {
      concluirRef.current = setTimeout(
        () => setIsUnlocked(true),
        ANALYSIS_COMPLETE_HOLD_MS
      );
    }
  }, []);

  // Relógio da análise: avança sozinho do início ao fim e libera a oferta
  // ao concluir. Sem VSL, não há outra fonte de ritmo.
  useEffect(() => {
    // Atalho de teste: ?sub=oferta abre a página já com o conteúdo liberado,
    // sem esperar a análise terminar. O bloco de análise segue o mesmo
    // caminho de sempre (some 1,4s depois, como no fluxo normal).
    if (lerParam(SUB_PARAM) === "oferta") {
      maiorPercentRef.current = 100;
      setAnalysisPercent(100);
      setIsUnlocked(true);
      return;
    }

    const inicio = Date.now();

    const relogio = setInterval(() => {
      const decorrido = Date.now() - inicio;
      publicarProgresso((decorrido / ANALYSIS_DURATION_MS) * 100);
    }, 150);

    return () => {
      clearInterval(relogio);
      if (concluirRef.current) clearTimeout(concluirRef.current);
    };
  }, [publicarProgresso]);

  // Dispara cada achado uma única vez, quando a análise passa do seu marco
  useEffect(() => {
    if (isUnlocked) return;
    const next = ANALYSIS_FINDINGS.findIndex(
      (f, i) => analysisPercent >= f.at && !shownFindings.current.has(i)
    );
    if (next === -1) return;
    shownFindings.current.add(next);
    setActiveFinding(next);
  }, [analysisPercent, isUnlocked]);

  // Recolhe o achado sozinho — separado do disparo para o timer não ser
  // cancelado a cada avanço da barra de progresso
  useEffect(() => {
    if (activeFinding === null) return;
    const t = setTimeout(() => setActiveFinding(null), 4600);
    return () => clearTimeout(t);
  }, [activeFinding]);

  useEffect(() => {
    // Atualiza o username quando o componente monta
    const searchedUsername = localStorage.getItem("searchedUsername");
    if (searchedUsername) {
      setCurrentUsername(searchedUsername);
    }

    const storedProfilePic = localStorage.getItem("userProfilePic");
    if (storedProfilePic) {
      setProfileImageUrl(storedProfilePic);
    }

    // Cidade real do lead, gravada pelo locationService na busca
    const storedLocation = localStorage.getItem("userLocation");
    if (storedLocation) {
      try {
        const loc = JSON.parse(storedLocation);
        if (loc?.city) {
          setLeadPlace(loc.state ? `${loc.city}, ${loc.state}` : loc.city);
        }
        if (
          typeof loc?.latitude === "number" &&
          typeof loc?.longitude === "number"
        ) {
          setLeadCoords({ lat: loc.latitude, lon: loc.longitude });
        }
      } catch {
        // localStorage corrompido não pode derrubar a página
      }
    }

    // Escuta o evento de atualização do username
    const handleUsernameUpdate = (event: CustomEvent) => {
      setCurrentUsername(event.detail.username);
    };

    window.addEventListener(
      "updatePitchUsername",
      handleUsernameUpdate as EventListener
    );

    return () => {
      window.removeEventListener(
        "updatePitchUsername",
        handleUsernameUpdate as EventListener
      );
    };
  }, []);

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

  const features = [
    {
      icon: MessageCircle,
      title: "Conversas Completas",
      description:
        "Acesse o histórico completo de todas as conversas do Direct, sem exceção.",
    },
    {
      icon: Eye,
      title: "Mensagens Apagadas",
      description: `Veja mensagens que foram enviadas e depois apagadas por ${userName} ou outros contatos.`,
    },
    {
      icon: Trash2,
      title: "Mídia Oculta",
      description:
        "Descubra fotos e vídeos que foram arquivados ou nunca publicados.",
    },
    {
      icon: MapPin,
      title: "Localização Detalhada",
      description: `Saiba a localização em tempo real e o histórico de lugares visitados por ${userName}.`,
    },
    {
      icon: Lock,
      title: "Contas Vinculadas",
      description: `Identifique perfis falsos ou alternativos que ${userName} usa secretamente.`,
    },
    {
      icon: Sparkles,
      title: "Relatório de IA",
      description:
        "Receba uma análise comportamental baseada em IA, indicando padrões suspeitos e interações.",
    },
  ];

  const features2 = [
    {
      icon: MessageCircle,
      title: "Conversas Extraídas via Algoritmo",
      description:
        "A IA simula interações e desbloqueia o histórico completo das mensagens diretas, incluindo as arquivadas.",
    },
    {
      icon: Trash2,
      title: "Mensagens Apagadas Reconstruídas",
      description:
        "Com base no comportamento da conta, a IA recria conteúdos apagados, identificando possíveis tentativas de ocultação.",
    },
    {
      icon: Eye,
      title: "Mídia Oculta Revelada",
      description:
        "Fotos e vídeos que foram escondidos ou arquivados agora são expostos com o poder da inteligência artificial.",
    },
    {
      icon: MapPin,
      title: "Rastreamento em Tempo Real",
      description:
        "A IA cruza dados de geolocalização e padrões de acesso para mapear os movimentos recentes da conta.",
    },
    {
      icon: Lock,
      title: "Contas Falsas Identificadas",
      description:
        "Detecte contas alternativas, perfis secundários e interações suspeitas conectadas ao perfil original.",
    },
    {
      icon: Sparkles,
      title: "Relatório Comportamental de IA",
      description:
        "Receba uma análise automática sobre padrões de uso, horários críticos, interlocutores prioritários e sinais de infidelidade.",
    },
  ];

  const features3 = [
    {
      icon: MessageCircle,
      title: "Relatórios Completos de Conversas",
      description:
        "Acesse o histórico completo das mensagens diretas da conta, sem filtros ou limitações.",
    },
    {
      icon: Trash2,
      title: "Mensagens Apagadas Rastreáveis",
      description:
        "A ferramenta reconstrói conversas apagadas, mesmo que tenham sido excluídas semanas atrás.",
    },
    {
      icon: Eye,
      title: "Mídia Oculta Desbloqueada",
      description:
        "Fotos, vídeos e arquivos que foram arquivados ou restritos são expostos pelo sistema.",
    },
    {
      icon: MapPin,
      title: "Localizações Atuais e Históricas",
      description:
        "Monitore em tempo real e veja os lugares visitados pela conta com precisão.",
    },
    {
      icon: Lock,
      title: "Perfis Falsos e Contas Secretas",
      description:
        "Veja todos os perfis conectados e usados pelo mesmo dispositivo. O sistema rastreia tudo.",
    },
    {
      icon: Sparkles,
      title: "Relatório de Investigação Automatizado",
      description:
        "Comportamento suspeito, horários de pico e interação com contatos marcados como 'recorrentes'.",
    },
  ];

  const features4 = [
    {
      icon: MessageCircle,
      title: "Histórico Completo de Conversas",
      description:
        "Veja todas as DMs trocadas pela conta, até as que foram apagadas.",
    },
    {
      icon: Trash2,
      title: "Mensagens Apagadas Rastreáveis",
      description:
        "O sistema reconstrói mensagens apagadas com base no tráfego comportamental da conta.",
    },
    {
      icon: Eye,
      title: "Mídia Oculta e Arquivada",
      description:
        "Imagens e vídeos que foram salvos ou nunca publicados, agora visíveis com um clique.",
    },
    {
      icon: MapPin,
      title: "Geolocalização em Tempo Real",
      description:
        "Saiba os lugares visitados pela pessoa e onde ela está agora, cruzando dados da rede móvel.",
    },
    {
      icon: Lock,
      title: "Contas e Perfis Vinculados",
      description:
        "O sistema localiza perfis conectados ao mesmo chip, IP ou dispositivo.",
    },
    {
      icon: Sparkles,
      title: "Relatório Completo de Atividade",
      description:
        "Com base nos padrões de uso da operadora, revela horários suspeitos, mensagens recorrentes e possíveis interações secretas.",
    },
  ];

  const features5 = [
    {
      icon: MessageCircle,
      title: "Histórico Total de Conversas do Direct",
      description:
        "Acesse todas as mensagens trocadas, até as que foram apagadas ou nunca respondidas.",
    },
    {
      icon: Trash2,
      title: "Mensagens Apagadas Recuperadas",
      description:
        "A falha permite reconstruir mensagens apagadas e até conversas arquivadas.",
    },
    {
      icon: Eye,
      title: "Fotos e Vídeos Ocultos",
      description:
        "Veja tudo o que foi salvo em privado, arquivado ou nunca publicado.",
    },
    {
      icon: MapPin,
      title: "Localização em Tempo Real e Rotina Padrão",
      description:
        "Saiba aonde a pessoa vai e com quem interage, cruzando dados comportamentais com geolocalização.",
    },
    {
      icon: Lock,
      title: "Perfis Vinculados ao Mesmo Login",
      description:
        "Detecte contas secundárias conectadas ao mesmo e-mail, número ou dispositivo.",
    },
    {
      icon: Sparkles,
      title: "Relatório Inteligente de Atividade",
      description:
        "Veja horários, interações suspeitas e frequência de contato com determinados perfis.",
    },
  ];

  const features7 = [
    {
      icon: MessageCircle,
      title: "Conversas Extraídas via Algoritmo",
      description:
        "A IA acessa brechas no banco de dados e desbloqueia o histórico completo de mensagens arquivadas e apagadas dos últimos 5 anos.",
    },
    {
      icon: Trash2,
      title: "Mensagens Apagadas Reconstruídas",
      description:
        "Com base no comportamento da conta e em vestígios no banco de dados, a IA recria conteúdos apagados, identificando possíveis tentativas de ocultação.",
    },
    {
      icon: Eye,
      title: "Mídia Oculta Revelada",
      description:
        "Fotos e vídeos que foram escondidos ou arquivados agora são expostos com o poder da inteligência artificial.",
    },
    {
      icon: MapPin,
      title: "Rastreamento em Tempo Real",
      description:
        "A IA cruza dados de geolocalização e padrões de acesso para mapear os movimentos recentes da conta.",
    },
    {
      icon: Lock,
      title: "Contas Falsas Identificadas",
      description:
        "Detecte contas alternativas, perfis secundários e interações suspeitas conectadas ao perfil original.",
    },
    {
      icon: Sparkles,
      title: "Relatório Comportamental de IA",
      description:
        "Receba uma análise automática sobre padrões de uso, contatos frequentes e sinais de infidelidade.",
    },
  ];

  const includedItems = [
    {
      text: "Acesso TOTAL e IRRESTRITO à ferramenta.",
      icon: BadgeCheck,
    },
    {
      text: "Garantia de 7 dias: Satisfação ou seu dinheiro de volta.",
      icon: Gift,
    },
    {
      text: "Suporte individualizado via WhatsApp.",
      icon: MessageCircle,
    },
    {
      text: "ANONIMATO GARANTIDO: " + userName + " NUNCA vai saber.",
      icon: ShieldCheck,
    },
  ];

  const feedbacks = [
    {
      name: "Vanessa Moura",
      stars: 5,
      verified: true,
      quote:
        "Eu sempre desconfiei, mas não tinha provas. Com a ferramenta, vi conversas arquivadas, mensagens apagadas e até fotos salvas só para outra pessoa. Hoje tenho certeza: me livrei de um mentiroso.",
      location: "São Paulo, há 2 dias",
    },
    {
      name: "Rafael Cunha",
      stars: 5,
      verified: true,
      quote:
        "Achei que fosse paranoia. Mas quando a ferramenta mostrou a localização batendo com as DMs ocultas... foi como levar um soco. Descobri tudo que ele estava apagando.",
      location: "Rio de Janeiro, há 5 dias",
    },
    {
      name: "Juliana Duarte",
      stars: 4,
      verified: true,
      quote:
        "A ferramenta me deu acesso ao que nem um detetive conseguiria. Vi contas falsas, mensagens enviadas às 3h da manhã e contatos fixos que ele jurava não falar mais.",
      location: "Fortaleza, há 3 dias",
    },
    {
      name: "Diego Farias",
      stars: 5,
      verified: true,
      quote:
        "As fotos estavam salvas no arquivo. As mensagens, nas ocultas. A ferramenta mostrou tudo, sem que ele sequer desconfiasse. Se eu não tivesse usado, ainda estaria sendo feito de bobo.",
      location: "Curitiba, há 1 dia",
    },
  ];

  const feedbacks2 = [
    {
      name: "Juliana Duarte",
      stars: 5,
      verified: true,
      quote:
        "A IA mostrou tudo que ele estava apagando. Até conversas de madrugada com uma conta falsa. O mais estranho? Ele nunca soube.",
      location: "Fortaleza, há 3 dias",
    },
    {
      name: "Rafael Cunha",
      stars: 5,
      verified: true,
      quote:
        "A inteligência artificial rastreou localizações e horários e cruzou com prints do Direct. Não era ciúme. Era realidade.",
      location: "Rio de Janeiro, há 5 dias",
    },
    {
      name: "Vanessa Moura",
      stars: 5,
      verified: true,
      quote:
        "A IA me deu acesso ao tipo de verdade que ninguém te conta. Se você tem dúvidas, isso resolve.",
      location: "São Paulo, há 2 dias",
    },
  ];

  const feedbacks3 = [
    {
      name: "Diego Farias",
      stars: 5,
      verified: true,
      quote:
        "É surreal. Senti que tinha acesso ao banco de dados da Polícia Federal. Vi conversas, prints, localização... Tudo em silêncio.",
      location: "Curitiba, há 1 dia",
    },
    {
      name: "Vanessa Moura",
      stars: 5,
      verified: true,
      quote:
        "Não é só uma ferramenta. É praticamente uma investigação completa. E ninguém jamais vai saber que fui eu.",
      location: "São Paulo, há 2 dias",
    },
    {
      name: "Rafael Cunha",
      stars: 5,
      verified: true,
      quote:
        "Parece filme, mas é real. Senti que virei um agente por 10 minutos. E descobri coisas que nem um detetive me mostraria.",
      location: "Rio de Janeiro, há 5 dias",
    },
  ];

  const feedbacks4 = [
    {
      name: "Vanessa Moura",
      stars: 5,
      verified: true,
      quote:
        "É como se eu tivesse virado uma funcionária da operadora por 10 minutos. Vi tudo que estava sendo escondido.",
      location: "São Paulo, há 2 dias",
    },
    {
      name: "Rafael Cunha",
      stars: 5,
      verified: true,
      quote:
        "A ferramenta rastreou a localização e mostrou um segundo perfil conectado ao mesmo número. Eu nunca saberia disso sozinho.",
      location: "Rio de Janeiro, há 5 dias",
    },
    {
      name: "Juliana Duarte",
      stars: 5,
      verified: true,
      quote:
        "O nível de detalhe é absurdo. Mídia oculta, mensagens apagadas e até prints de conversas só com certas pessoas. Vale cada centavo.",
      location: "Fortaleza, há 3 dias",
    },
  ];

  const feedbacks5 = [
    {
      name: "Juliana Duarte",
      stars: 5,
      verified: true,
      quote:
        "É bizarro pensar que uma falha da Meta me deu acesso a tudo. Conversas, fotos, até contas secretas. Tudo com um @.",
      location: "Fortaleza, há 3 dias",
    },
    {
      name: "Diego Farias",
      stars: 5,
      verified: true,
      quote:
        "O sistema mostrou localização e prints de conversas arquivadas. Eu nunca imaginei que isso seria possível.",
      location: "Curitiba, há 1 dia",
    },
    {
      name: "Vanessa Moura",
      stars: 5,
      verified: true,
      quote:
        "O melhor? A pessoa nem recebeu notificação. É como se nada tivesse acontecido. Mas eu vi tudo.",
      location: "São Paulo, há 2 dias",
    },
  ];

  const feedbacks7 = [
    {
      name: "Juliana Duarte",
      stars: 5,
      verified: true,
      quote:
        "A IA mostrou tudo que ele estava apagando. Até conversas de madrugada com uma conta falsa. O mais estranho é que eu joguei tudo na cara dele e até hoje ele nunca soube como eu descobri.",
      location: "Fortaleza, há 3 dias",
    },
    {
      name: "Rafael Cunha",
      stars: 5,
      verified: true,
      quote:
        "A inteligência artificial rastreou localizações e horários e cruzou com prints do Direct. Achei que fosse ciúme doentio, coisa da minha cabeça... mas era realidade. Eu estava sendo traído.",
      location: "Rio de Janeiro, há 5 dias",
    },
    {
      name: "Vanessa Moura",
      stars: 5,
      verified: true,
      quote:
        "A IA me deu acesso a toda a verdade que provavelmente eu nunca saberia. Se você tem dúvidas sobre algo, isso resolve.",
      location: "São Paulo, há 2 dias",
    },
  ];

  const faqs = [
    {
      question: "Preciso da senha do WhatsApp da pessoa para usar a ferramenta?",
      answer:
        "Não. A ferramenta simula o acesso comportamental via algoritmo interno. Você só precisa do número de telefone da pessoa. O sistema cruza dados públicos e privados disponíveis através de brechas técnicas autorizadas internamente.",
    },
    {
      question: "A pessoa vai saber que foi investigada?",
      answer:
        "De jeito nenhum. O acesso é feito por um servidor espelhado, com protocolos militares de anonimato. Nenhuma notificação é gerada e nenhum vestígio fica na conta da pessoa investigada.",
    },
    {
      question: "É legal usar essa ferramenta?",
      answer:
        "Você está acessando informações do seu próprio relacionamento. A ferramenta interpreta dados com base em conexões existentes e contextos interpessoais. Você não está invadindo, está validando sua dúvida com recursos avançados. Segurança emocional também é um direito.",
    },
    {
      question: "Quanto tempo leva para acessar as informações?",
      answer:
        "O processo leva de 1 a 3 minutos após a confirmação do pagamento. Você receberá um link de acesso seguro com um painel interativo para navegar entre conversas, fotos arquivadas, localização e muito mais.",
    },
    {
      question: "Que tipo de conteúdo eu posso ver?",
      answer:
        '- Mensagens arquivadas e apagadas\n- Fotos e vídeos da galeria (incluindo os removidos)\n- Lista de contatos frequentes\n- Localização por geotag\n- Números ou contas secundárias vinculadas\n- Status e atualizações privadas\n- Horários suspeitos e atividade de interação',
    },
    {
      question: "E se eu não encontrar nada?",
      answer:
        "Excelente. Isso significa que você estava certo em confiar, e agora pode dormir tranquilo. A ferramenta existe para acabar com a dúvida, não para criar problemas. Mas se houver algo, você vai ver.",
    },
  ];

  function getTitle() {
    switch (pathname) {
      case "/02":
        return `ACESSO TOTAL via Inteligência Artificial`;
      case "/03":
        return "Acesso Secreto à Ferramenta Federal";
      case "/04":
        return `Descubra a Verdade Sobre ${userName}`;
      case "/05":
        return "Acesso via Vazamento da Meta";
      case "/07":
        return "Desbloqueie a Ferramenta com IA";
      default:
        // "Acesso Total à Verdade" nomeia o produto. O lead que chega aqui
        // não está atrás de um produto: está atrás de saber se enlouqueceu
        // ou não. A manchete responde isso primeiro — o acesso ele compra
        // depois, por consequência.
        return (
          <>
            Não era{" "}
            <span style={{ color: "#DC2626" }}>coisa da sua cabeça</span>.
          </>
        );
    }
  }

  function getSubtitle() {
    switch (pathname) {
      case "/02":
        return (
          <>
            Descubra a verdade sobre <b>{userName}</b> com tecnologia de
            ponta. Esta IA foi treinada para quebrar padrões, senhas e
            silêncios.
          </>
        );
      case "/03":
        return (
          <>
            Descubra a Verdade Sobre <b>{userName}</b>
            <br />
            Uma tecnologia confidencial usada pela Polícia Federal, agora
            vazada e disponível para uso público.
          </>
        );
      case "/04":
        return (
          <>
            Antes restrita às operadoras de celular, agora liberada.
            <br />
            Uma ferramenta usada para identificar criminosos, agora
            disponível para qualquer pessoa.
          </>
        );
      case "/05":
        return (
          <>
            Descubra a Verdade Sobre <b>{userName}</b>
            <br />
            Um vazamento recente do WhatsApp comprometeu milhares de contas.
            Agora, com essa falha ainda ativa, você pode acessar tudo com
            apenas o {userName}.
          </>
        );
      case "/07":
        return (
          <>
            A verdade por trás da conversa com <b>{userName}</b> não precisa
            mais ficar escondida. Esta IA foi treinada para quebrar padrões,
            senhas e silêncios.
          </>
        );
      default:
        // Antes: só acolhimento ("você já perdeu noites de sono"), que
        // conforta e não move. O acolhimento continua na primeira frase, mas
        // agora ele desemboca no achado: tinha coisa apagada, e ela voltou.
        return (
          <>
            Te chamaram de ciumento, mandaram você parar de inventar coisa. A
            varredura no backup de <b>{currentUsername}</b> encontrou{" "}
            <b>conteúdo apagado do aparelho</b>. E recuperou.
            <br className="hidden sm:block" /> Não é suspeita. É registro.
          </>
        );
    }
  }

  return (
    <>
      {/* Só o conteúdo que anima a saída fica dentro do AnimatePresence. Com
          os blocos fixos aqui dentro, cada irmão sem key virava key "" e o
          React acusava chaves duplicadas a cada render. */}
      <AnimatePresence>
      {(
        <motion.div
          key="pitch-page-content"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.4 } }}
          exit={{
            opacity: 0,
            scale: 0.95,
            transition: { duration: 0.3 },
          }}
          className="min-h-screen bg-white text-gray-800 font-sans pt-12 md:pt-10"
        >
          {/* Barra Fixa no Topo: análise em andamento, depois timer de acesso */}
          {!isUnlocked ? (
            <motion.div
              initial={{ opacity: 0, y: -50 }}
              animate={{
                opacity: 1,
                y: 0,
                transition: { duration: 0.6, delay: 0.2, ease: "easeOut" },
              }}
              className="fixed top-0 left-0 right-0 z-50 px-4 py-2.5 text-center shadow-lg"
              style={{ background: primaryGradient }}
            >
              <div className="flex items-center justify-center space-x-2">
                <TriangleAlert className="w-4 h-4 md:w-5 md:h-5 text-yellow-300 flex-shrink-0" />
                <p className="text-xs md:text-sm font-semibold text-white">
                  Análise do backup em andamento. Não feche esta página
                </p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: -50 }}
              animate={{
                opacity: 1,
                y: 0,
                transition: { duration: 0.5, ease: "easeOut" },
              }}
              className="fixed top-0 left-0 right-0 z-50 px-4 py-2.5 text-center shadow-lg"
              style={{
                background: "linear-gradient(135deg, #DC2626 0%, #EF4444 100%)",
              }}
            >
              <div className="flex items-center justify-center">
                <Clock className="w-5 h-5 md:w-6 md:h-6 mr-2 text-white flex-shrink-0" />
                {/* "Acesso exclusivo expira" é relógio de promoção, e o lead
                    já viu mil. O que ele não quer perder não é um desconto: é
                    o que foi recuperado do aparelho. */}
                <p className="text-sm md:text-base font-semibold text-white">
                  Os arquivos recuperados saem do ar em{" "}
                  <span className="font-bold tabular-nums">
                    {formatTime(timeLeft)}
                  </span>
                </p>
              </div>
            </motion.div>
          )}

          {/* Conteúdo da Página */}
          <main className="max-w-2xl mx-auto px-4 md:px-6 lg:px-8 py-4 space-y-8 md:space-y-12">
            {/* A VSL.
                Fica acima da análise e NÃO desaparece quando ela termina: a
                barra some, a oferta entra embaixo, e quem estava assistindo
                continua de onde estava. Tirar o vídeo no meio para mostrar
                preço é o jeito mais rápido de perder quem já estava
                convencido pela metade. */}
            <section className="max-w-md mx-auto">
              <VslPlayer />
            </section>

            {/* Seção de Análise — libera o restante da página ao concluir, depois recolhe sozinha */}
            <AnimatePresence initial={false}>
              {showAnalise && (
                <motion.section
                  key="analise-section"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0, height: "auto" }}
                  exit={{
                    opacity: 0,
                    height: 0,
                    marginBottom: 0,
                    transition: { duration: 0.5, ease: "easeInOut" },
                  }}
                  transition={{ duration: 0.5 }}
                  style={{ overflow: "hidden" }}
                  className="max-w-md mx-auto space-y-5 pt-2"
                >
              {/* Status da análise + texto de apoio */}
              <div className="text-center">
                <div
                  className="inline-flex items-center space-x-2 px-6 py-2.5 rounded-full font-bold text-white text-sm select-none status-pulse"
                  style={{ background: primaryGradient }}
                >
                  {isUnlocked ? (
                    <BadgeCheck className="w-4 h-4" />
                  ) : (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  )}
                  <span>
                    {isUnlocked ? "ANÁLISE CONCLUÍDA" : "ANALISANDO BACKUP"}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mt-3 leading-relaxed">
                  {isUnlocked
                    ? "Análise do backup concluída! Veja abaixo tudo o que encontramos."
                    : `Assista enquanto terminamos a varredura no backup de ${currentUsername}. O resultado abre sozinho ao fim do vídeo.`}
                </p>
              </div>

              {/* Card de progresso da análise */}
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="relative w-14 h-14 flex-shrink-0">
                      <svg
                        width="56"
                        height="56"
                        viewBox="0 0 56 56"
                        className="absolute inset-0 -rotate-90"
                      >
                        <circle
                          cx="28"
                          cy="28"
                          r={ANALYSIS_RADIUS}
                          fill="none"
                          stroke="#E5E7EB"
                          strokeWidth="3"
                        />
                        <circle
                          cx="28"
                          cy="28"
                          r={ANALYSIS_RADIUS}
                          fill="none"
                          stroke={primaryColor}
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeDasharray={ANALYSIS_CIRCUMFERENCE}
                          strokeDashoffset={
                            ANALYSIS_CIRCUMFERENCE -
                            (analysisPercent / 100) * ANALYSIS_CIRCUMFERENCE
                          }
                          style={{ transition: "stroke-dashoffset 0.15s linear" }}
                        />
                      </svg>
                      <div
                        className="absolute inset-[5px] rounded-full overflow-hidden"
                        style={{ backgroundColor: `${primaryColor}20` }}
                      >
                        {profileImageUrl ? (
                          <Image
                            src={profileImageUrl}
                            alt="Foto do contato"
                            width={46}
                            height={46}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="relative w-full h-full overflow-hidden">
                            {/* Avatar padrão, no estilo do contato sem foto no WhatsApp */}
                            <div
                              className="absolute rounded-full"
                              style={{
                                width: "38%",
                                height: "38%",
                                top: "16%",
                                left: "31%",
                                backgroundColor: primaryColor,
                                opacity: 0.45,
                              }}
                            />
                            <div
                              className="absolute rounded-full"
                              style={{
                                width: "78%",
                                height: "78%",
                                bottom: "-30%",
                                left: "11%",
                                backgroundColor: primaryColor,
                                opacity: 0.45,
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 text-base">
                        {currentUsername}
                      </p>
                      <div
                        className="inline-flex items-center space-x-1.5 mt-1 px-2.5 py-0.5 rounded-full"
                        style={{
                          backgroundColor: isUnlocked
                            ? "#16A34A15"
                            : `${primaryColor}15`,
                        }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full animate-pulse-gentle"
                          style={{
                            backgroundColor: isUnlocked ? "#16A34A" : primaryColor,
                          }}
                        />
                        <span
                          className="text-xs font-semibold"
                          style={{ color: isUnlocked ? "#16A34A" : primaryColor }}
                        >
                          {isUnlocked ? "Análise concluída" : "Analisando backup agora"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p
                      className="text-2xl font-bold leading-none"
                      style={{ color: primaryColor }}
                    >
                      {Math.round(analysisPercent)}%
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {isUnlocked
                        ? "Concluído"
                        : /* Estimativa grossa, não cronômetro. Ver
                             estimativaRestante(). */
                          estimativaRestante(
                            Math.max(
                              0,
                              Math.ceil(
                                ANALYSIS_DURATION_S * (1 - analysisPercent / 100)
                              )
                            )
                          )}
                    </p>
                  </div>
                </div>

                {/* Unidade de trabalho própria da análise. É daqui que vem a
                    sensação de avanço: o número sobe em registros, não em
                    segundos de vídeo. */}
                <div className="flex items-baseline justify-between mt-4 mb-1.5">
                  <span className="text-[11px] font-semibold text-gray-500">
                    {isUnlocked
                      ? `Lote ${BACKUP_LOTES} de ${BACKUP_LOTES}`
                      : `Lote ${Math.min(
                          BACKUP_LOTES,
                          Math.floor((analysisPercent / 100) * BACKUP_LOTES) + 1
                        )} de ${BACKUP_LOTES}`}
                  </span>
                  <span className="text-[11px] text-gray-500 tabular-nums">
                    {formatarMilhar(
                      Math.round(
                        (analysisPercent / 100) * BACKUP_TOTAL_REGISTROS
                      )
                    )}{" "}
                    de {formatarMilhar(BACKUP_TOTAL_REGISTROS)} registros
                  </span>
                </div>

                <div className="w-full h-1.5 rounded-full bg-gray-200 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${analysisPercent}%`,
                      background: primaryGradient,
                      transition: "width 0.15s linear",
                    }}
                  />
                </div>

                <div className="text-center mt-4">
                  <p
                    className="text-xs font-bold tracking-wide"
                    style={{ color: primaryColor }}
                  >
                    {isUnlocked ? "TUDO PRONTO!" : "POR FAVOR AGUARDE..."}
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    {isUnlocked ? (
                      <>
                        Encontramos informações sensíveis no backup de{" "}
                        <span className="font-semibold">
                          {currentUsername}
                        </span>
                      </>
                    ) : (
                      <>
                        O backup do WhatsApp de{" "}
                        <span className="font-semibold">
                          {currentUsername}
                        </span>{" "}
                        está sendo analisado
                      </>
                    )}
                  </p>
                </div>
              </div>

              {/* Checklist da análise */}
              <div className="space-y-3">
                {analysisChecklist.map((item, index) => {
                  const isDone = analysisPercent >= item.threshold;
                  const Icon = item.icon;
                  return (
                    <motion.div
                      key={item.title}
                      initial={{ opacity: 0, x: -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.4, delay: 0.1 + index * 0.06 }}
                      className={`flex items-center space-x-3 p-3.5 rounded-2xl border transition-colors duration-500 ${
                        isDone
                          ? "bg-green-50 border-green-200"
                          : "bg-white border-gray-100"
                      }`}
                    >
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: item.bg }}
                      >
                        <Icon className="w-5 h-5" style={{ color: item.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-gray-900">
                          {item.title}
                        </p>
                        <p className="text-xs text-gray-500">
                          {item.description}
                        </p>
                      </div>
                      {isDone ? (
                        <CheckCircle2
                          className="w-6 h-6 flex-shrink-0"
                          style={{ color: primaryColor }}
                          fill={primaryColor}
                          stroke="white"
                        />
                      ) : (
                        <span className="w-5 h-5 rounded-full border-2 flex-shrink-0 border-gray-300" />
                      )}
                    </motion.div>
                  );
                })}
              </div>

              {!isUnlocked ? (
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 text-center">
                  <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-amber-100 flex items-center justify-center">
                    <Lock className="w-5 h-5 text-amber-600" />
                  </div>
                  <p className="text-sm font-bold" style={{ color: primaryColor }}>
                    Esta ferramenta é 100% anônima
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Não responda mensagens para se manter discreto.
                  </p>
                </div>
              ) : (
                <motion.div
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4 }}
                  className="rounded-2xl p-5 text-center text-white shadow-lg"
                  style={{ background: primaryGradient }}
                >
                  <BadgeCheck className="w-8 h-8 mx-auto mb-2" />
                  <p className="font-bold text-base">
                    Análise concluída com sucesso!
                  </p>
                  <p className="text-sm text-white/90 mt-1">
                    Liberando seu relatório completo agora...
                  </p>
                </motion.div>
              )}
                </motion.section>
              )}
            </AnimatePresence>

            {/* Conteúdo completo da oferta — liberado após a análise */}
            <AnimatePresence>
              {isUnlocked && (
                <motion.div
                  key="oferta-liberada"
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6 }}
                  className="space-y-8 md:space-y-12"
                >
            {/* Seção Herói */}
            <motion.section
              ref={heroRef}
              variants={fadeInUp}
              custom={0}
              initial="hidden"
              animate="visible"
              className="text-center pt-4 pb-2"
            >
              <motion.div
                variants={scaleIn}
                custom={0}
                initial="hidden"
                animate="visible"
              >
                {/* Era um foguete sobre verde: o gesto de "parabéns, chegou".
                    Quem acabou de descobrir que o backup tinha coisa escondida
                    não precisa ser cumprimentado — precisa ser avisado. O
                    pulso vermelho é o mesmo de um alarme ativo. */}
                <div className="relative w-16 h-16 mx-auto mb-5">
                  <motion.span
                    animate={{ scale: [1, 1.55], opacity: [0.4, 0] }}
                    transition={{ duration: 1.9, repeat: Infinity, ease: "easeOut" }}
                    className="absolute inset-0 rounded-2xl"
                    style={{ backgroundColor: "#DC2626" }}
                  />
                  <div
                    className="relative w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg"
                    style={{
                      background: "linear-gradient(135deg, #DC2626 0%, #EF4444 100%)",
                    }}
                  >
                    <TriangleAlert className="w-8 h-8 text-white" strokeWidth={2.2} />
                  </div>
                </div>
              </motion.div>
              <motion.h1
                variants={fadeInUp}
                custom={1}
                className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight leading-tight text-gray-900 mb-4"
              >
                {getTitle()}
              </motion.h1>

              {/* "Alto nível de atividade suspeita detectado" em verde era um
                  carimbo tranquilizador dizendo algo grave. Verde é a cor de
                  "está tudo certo". Aqui o selo passa a soar como o que é: uma
                  ocorrência confirmada, com hora. */}
              <motion.div
                variants={fadeInUp}
                custom={2}
                className="flex flex-col items-center gap-2 mb-4"
              >
                <div
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-bold uppercase tracking-wide"
                  style={{
                    backgroundColor: "#FEE2E2",
                    color: "#B91C1C",
                    border: "1px solid #FCA5A5",
                  }}
                >
                  <motion.span
                    animate={{ opacity: [1, 0.2, 1] }}
                    transition={{ duration: 1.1, repeat: Infinity }}
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: "#DC2626" }}
                  />
                  Atividade oculta confirmada
                </div>
                {horaDeteccao && (
                  <p className="text-[12px] text-gray-500 font-medium">
                    Último registro recuperado hoje, às{" "}
                    <span className="font-bold text-gray-700 tabular-nums">
                      {horaDeteccao}
                    </span>
                  </p>
                )}
              </motion.div>

              <motion.p
                variants={fadeInUp}
                custom={3}
                className="text-base sm:text-lg text-gray-600 font-normal leading-relaxed mb-5 max-w-xl mx-auto"
              >
                {getSubtitle()}
              </motion.p>

              {/* A ficha do número investigado.
                  Faltava o elo entre "achamos coisa" e "achamos coisa NESTE
                  número". Sem ele o alerta podia ser sobre qualquer pessoa —
                  com ele o lead vê o número que ele mesmo digitou, marcado
                  como investigado, com a cidade de onde fala o outro lado. */}
              <motion.div variants={fadeInUp} custom={3.5} className="mb-5">
                <div className="max-w-md mx-auto text-left rounded-2xl bg-white border border-gray-200 shadow-sm overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="relative flex-shrink-0">
                      {profileImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={profileImageUrl}
                          alt=""
                          aria-hidden="true"
                          className="w-11 h-11 rounded-full object-cover"
                        />
                      ) : (
                        <div
                          className="w-11 h-11 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: `${primaryColor}1A` }}
                        >
                          <Users className="w-5 h-5" style={{ color: primaryColor }} />
                        </div>
                      )}
                      <span
                        className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white"
                        style={{ backgroundColor: primaryBright }}
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-bold text-gray-900 truncate">
                        {currentUsername}
                      </p>
                      <p className="text-[11.5px] font-semibold text-gray-500">
                        Número investigado ·{" "}
                        <span style={{ color: primaryColor }}>WhatsApp ativo</span>
                      </p>
                    </div>

                    <div className="flex-shrink-0 text-right">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                        Precisão
                      </p>
                      <p className="text-[15px] font-extrabold" style={{ color: primaryColor }}>
                        98%
                      </p>
                    </div>
                  </div>

                  <p
                    className="px-4 py-2.5 text-[12px] leading-snug text-gray-600"
                    style={{ backgroundColor: "#F9FAFB", borderTop: "1px solid #F3F4F6" }}
                  >
                    Este número troca mensagens com frequência com um contato
                    {cidadeLead ? (
                      <>
                        {" "}localizado perto de{" "}
                        <span className="font-bold text-gray-800">{cidadeLead}</span>
                      </>
                    ) : (
                      " que não está salvo na agenda"
                    )}
                    .
                  </p>
                </div>
              </motion.div>

              {/* O laudo.
                  Sem VSL, faltava a peça que dizia ao lead "você não está
                  imaginando coisas". Texto não faz isso: o que faz é
                  quantidade, horário e janela de tempo, escritos como relatório
                  e não como promessa. Estes são os mesmos achados que
                  passaram na análise — aqui eles param na tela e podem ser
                  lidos com calma, logo antes do dossiê abrir cada um. */}
              <motion.div variants={fadeInUp} custom={4} className="mb-5">
                <div
                  className="max-w-md mx-auto text-left rounded-2xl overflow-hidden shadow-sm"
                  style={{
                    border: "1px solid #FECACA",
                    borderLeft: "4px solid #DC2626",
                    backgroundColor: "#FFFBFB",
                  }}
                >
                  <div
                    className="flex items-center justify-between px-4 py-2.5"
                    style={{ backgroundColor: "#FEF2F2", borderBottom: "1px solid #FEE2E2" }}
                  >
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-gray-500">
                      Resultados da análise
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="flex gap-[3px]" aria-hidden="true">
                        {[0, 1, 2, 3].map((i) => (
                          <span
                            key={i}
                            className="block w-4 h-[5px] rounded-full"
                            style={{ backgroundColor: i < 3 ? "#DC2626" : "#FECACA" }}
                          />
                        ))}
                      </span>
                      <span className="text-[12px] font-extrabold" style={{ color: "#B91C1C" }}>
                        ALTO
                      </span>
                    </span>
                  </div>

                  <ul className="divide-y" style={{ borderColor: "#FEE2E2" }}>
                    {alertasCriticos(cidadeLead).map((alerta) => (
                      <li key={alerta.texto} className="flex items-start gap-3 px-4 py-2.5">
                        <alerta.icon
                          className="w-4 h-4 flex-shrink-0 mt-[3px]"
                          style={{ color: alerta.cor }}
                          strokeWidth={2.2}
                        />
                        <p className="text-[13.5px] leading-snug text-gray-800 font-semibold min-w-0">
                          {alerta.texto}
                          <span className="block text-[11.5px] font-medium text-gray-500">
                            {alerta.detalhe}
                          </span>
                        </p>
                      </li>
                    ))}
                  </ul>

                  <div
                    className="px-4 py-2.5"
                    style={{ backgroundColor: "#FEF2F2", borderTop: "1px solid #FEE2E2" }}
                  >
                    <p className="text-[11.5px] leading-snug text-gray-600">
                      Tudo isto foi recuperado do backup de{" "}
                      <span className="font-bold text-gray-800">{currentUsername}</span> e
                      está esperando liberação. Nada foi aberto ainda.
                    </p>
                    {carimboRelatorio && (
                      <p className="text-[10.5px] text-gray-400 mt-1.5 tabular-nums">
                        Relatório gerado em {carimboRelatorio}
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>

              <motion.div
                variants={fadeInUp}
                custom={5}
                className="flex justify-center"
              >
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gray-50 border border-gray-200 text-xs font-semibold text-gray-600">
                  <Lock className="w-3.5 h-3.5" style={{ color: primaryColor }} />
                  100% anônima · {currentUsername} não recebe nenhum aviso
                </div>
              </motion.div>
            </motion.section>

            {/* Seção de Benefícios (Cards) */}
            <motion.section
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
            >
              <motion.h2
                variants={fadeInUp}
                className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-center text-gray-800 mb-6"
              >
                {pathname == "/02" ? "O Que Você Vai Desbloquear com a IA" : ""}
                {pathname == "/03"
                  ? "O Que Você Vai Acessar com a Ferramenta Interna:"
                  : ""}
                {pathname == "/04"
                  ? "O Que Você Vai Desbloquear com o Sistema da Operadora:"
                  : ""}
                {pathname == "/05"
                  ? "O Acesso Profundo que Você Precisa:"
                  : ""}

                {pathname == "/" || pathname == "/01" || pathname == "/roc"
                  ? ""
                  : ""}
              </motion.h2>

              {/* Abertura do dossiê — só na oferta principal */}
              {(pathname == "/" ||
                pathname == "/01" ||
                pathname == "/roc") && (
                <motion.div variants={fadeInUp} className="text-center mb-7">
                  <div
                    className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full mb-4"
                    style={{
                      backgroundColor: `${primaryColor}14`,
                      color: primaryColor,
                    }}
                  >
                    <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="text-[11px] font-bold uppercase tracking-wider">
                      Dossiê recuperado
                    </span>
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 leading-tight">
                    O que estava escondido no WhatsApp de{" "}
                    <span style={{ color: primaryColor }}>
                      {currentUsername}
                    </span>
                  </h2>
                  {/* O que segurava este parágrafo era a promessa ("pronto
                      para ser liberado"). O que o faz pesar é o contrário:
                      lembrar que alguém apagou isso de propósito. */}
                  <p className="text-sm text-gray-500 mt-2.5 max-w-md mx-auto leading-relaxed">
                    Cada item abaixo foi apagado do aparelho e devolvido pelo
                    backup. Enquanto este acesso estiver aberto, você pode abrir
                    um por um.
                  </p>
                </motion.div>
              )}

              <div
                style={pathname == "/02" ? {} : { display: "none" }}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8"
              >
                {features2.map((feature, index) => (
                  <motion.div
                    key={index}
                    variants={scaleIn}
                    custom={index}
                    initial="hidden"
                    animate="visible"
                    whileHover="hover"
                    className="bg-white rounded-xl shadow-lg p-6 transition-shadow duration-300 border border-gray-100 cursor-default"
                    {...cardHover}
                  >
                    <motion.div
                      whileHover={{ scale: 1.1, rotate: 5 }}
                      transition={{ duration: 0.2 }}
                    >
                      <feature.icon
                        className="w-10 h-10 mb-4"
                        style={{ color: primaryColor }}
                      />
                    </motion.div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">
                      {feature.title.replace("${userName}", currentUsername)}
                    </h3>
                    <p className="text-gray-600 text-sm leading-relaxed">
                      {feature.description.replace(
                        "${userName}",
                        currentUsername
                      )}
                    </p>
                  </motion.div>
                ))}
              </div>

              <div
                style={pathname == "/03" ? {} : { display: "none" }}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8"
              >
                {features3.map((feature, index) => (
                  <motion.div
                    key={index}
                    variants={scaleIn}
                    custom={index}
                    initial="hidden"
                    animate="visible"
                    whileHover="hover"
                    className="bg-white rounded-xl shadow-lg p-6 transition-shadow duration-300 border border-gray-100 cursor-default"
                    {...cardHover}
                  >
                    <motion.div
                      whileHover={{ scale: 1.1, rotate: 5 }}
                      transition={{ duration: 0.2 }}
                    >
                      <feature.icon
                        className="w-10 h-10 mb-4"
                        style={{ color: primaryColor }}
                      />
                    </motion.div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">
                      {feature.title.replace("${userName}", currentUsername)}
                    </h3>
                    <p className="text-gray-600 text-sm leading-relaxed">
                      {feature.description.replace(
                        "${userName}",
                        currentUsername
                      )}
                    </p>
                  </motion.div>
                ))}
              </div>

              <div
                style={pathname == "/04" ? {} : { display: "none" }}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8"
              >
                {features4.map((feature, index) => (
                  <motion.div
                    key={index}
                    variants={scaleIn}
                    custom={index}
                    initial="hidden"
                    animate="visible"
                    whileHover="hover"
                    className="bg-white rounded-xl shadow-lg p-6 transition-shadow duration-300 border border-gray-100 cursor-default"
                    {...cardHover}
                  >
                    <motion.div
                      whileHover={{ scale: 1.1, rotate: 5 }}
                      transition={{ duration: 0.2 }}
                    >
                      <feature.icon
                        className="w-10 h-10 mb-4"
                        style={{ color: primaryColor }}
                      />
                    </motion.div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">
                      {feature.title.replace("${userName}", currentUsername)}
                    </h3>
                    <p className="text-gray-600 text-sm leading-relaxed">
                      {feature.description.replace(
                        "${userName}",
                        currentUsername
                      )}
                    </p>
                  </motion.div>
                ))}
              </div>

              <div
                style={pathname == "/05" ? {} : { display: "none" }}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8"
              >
                {features5.map((feature, index) => (
                  <motion.div
                    key={index}
                    variants={scaleIn}
                    custom={index}
                    initial="hidden"
                    animate="visible"
                    whileHover="hover"
                    className="bg-white rounded-xl shadow-lg p-6 transition-shadow duration-300 border border-gray-100 cursor-default"
                    {...cardHover}
                  >
                    <motion.div
                      whileHover={{ scale: 1.1, rotate: 5 }}
                      transition={{ duration: 0.2 }}
                    >
                      <feature.icon
                        className="w-10 h-10 mb-4"
                        style={{ color: primaryColor }}
                      />
                    </motion.div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">
                      {feature.title.replace("${userName}", currentUsername)}
                    </h3>
                    <p className="text-gray-600 text-sm leading-relaxed">
                      {feature.description.replace(
                        "${userName}",
                        currentUsername
                      )}
                    </p>
                  </motion.div>
                ))}
              </div>

              <div
                style={pathname == "/07" ? {} : { display: "none" }}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8"
              >
                {features7.map((feature, index) => (
                  <motion.div
                    key={index}
                    variants={scaleIn}
                    custom={index}
                    initial="hidden"
                    animate="visible"
                    whileHover="hover"
                    className="bg-white rounded-xl shadow-lg p-6 transition-shadow duration-300 border border-gray-100 cursor-default"
                    {...cardHover}
                  >
                    <motion.div
                      whileHover={{ scale: 1.1, rotate: 5 }}
                      transition={{ duration: 0.2 }}
                    >
                      <feature.icon
                        className="w-10 h-10 mb-4"
                        style={{ color: primaryColor }}
                      />
                    </motion.div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">
                      {feature.title.replace("${userName}", currentUsername)}
                    </h3>
                    <p className="text-gray-600 text-sm leading-relaxed">
                      {feature.description.replace(
                        "${userName}",
                        currentUsername
                      )}
                    </p>
                  </motion.div>
                ))}
              </div>

              <div
                style={
                  pathname == "/" || pathname == "/01" || pathname == "/roc"
                    ? {}
                    : { display: "none" }
                }
                className="space-y-5"
              >
                {EVIDENCE_BLOCKS.map((block, index) => {
                  const Icon = block.icon;
                  const h = block.headline(currentUsername);
                  return (
                    <Fragment key={block.tag}>
                    <motion.div
                      variants={scaleIn}
                      custom={index}
                      initial="hidden"
                      animate="visible"
                      className="rounded-3xl overflow-hidden shadow-2xl"
                      style={{
                        backgroundColor: "#0B141A",
                        border: "1px solid rgba(37,211,102,0.18)",
                      }}
                    >
                      {/* Etiqueta da categoria */}
                      <div
                        className="flex items-center gap-2 px-5 py-3"
                        style={{
                          backgroundColor: "rgba(37,211,102,0.10)",
                          borderBottom: "1px solid rgba(37,211,102,0.14)",
                        }}
                      >
                        <Icon
                          className="w-4 h-4 flex-shrink-0"
                          style={{ color: "#25D366" }}
                        />
                        <span
                          className="text-[11px] font-bold uppercase tracking-wider"
                          style={{ color: "#25D366" }}
                        >
                          {block.tag}
                        </span>
                      </div>

                      <div className="px-5 pt-5 pb-4 text-left">
                        <h3 className="text-[19px] sm:text-xl font-bold text-white leading-snug mb-2">
                          {h.before ? `${h.before} ` : ""}
                          <span style={{ color: "#25D366" }}>{h.target}</span>
                          {h.after ? ` ${h.after}` : ""}
                        </h3>
                        <p
                          className="text-[13.5px] leading-relaxed"
                          style={{ color: "#8696A0" }}
                        >
                          {block.body(currentUsername)}
                        </p>
                      </div>

                      {/* A prova em si */}
                      <div className="px-3">
                        <div
                          className="relative rounded-2xl overflow-hidden select-none"
                          style={{
                            backgroundColor: "#111B21",
                            border: "1px solid rgba(255,255,255,0.06)",
                          }}
                        >
                          {block.mock === "chat" && (
                            <MockChat alvo={currentUsername} foto={profileImageUrl} />
                          )}
                          {block.mock === "gallery" && (
                            <MockGallery alvo={currentUsername} foto={profileImageUrl} />
                          )}
                          {block.mock === "map" && (
                            <MockMap
                              alvo={currentUsername}
                              place={leadPlace}
                              coords={leadCoords}
                              foto={profileImageUrl}
                            />
                          )}
                          {block.mock === "audio" && (
                            <MockAudio alvo={currentUsername} foto={profileImageUrl} />
                          )}
                          {block.mock === "conexao" && (
                            <MockConexao alvo={currentUsername} foto={profileImageUrl} />
                          )}
                        </div>
                      </div>

                      {/* Selo de bloqueio ao pé do dossiê */}
                      <div className="flex items-center justify-center gap-2 px-5 py-4">
                        <Lock
                          className="w-3.5 h-3.5 flex-shrink-0"
                          style={{ color: "#8696A0" }}
                        />
                        <span
                          className="text-xs font-semibold"
                          style={{ color: "#8696A0" }}
                        >
                          {block.lockLabel}
                        </span>
                      </div>
                    </motion.div>

                    {/* Depois das duas primeiras provas — conversas apagadas e
                        fotos privadas — o lead está no ponto mais alto da
                        página. É aqui que entra o preço, não no fim. */}
                    {index === 1 && (
                      <OfertaAntecipada
                        alvo={currentUsername}
                        checkoutUrl={checkoutUrl}
                        tempo={formatTime(timeLeft)}
                      />
                    )}
                    </Fragment>
                  );
                })}
              </div>
            </motion.section>

            <motion.section
              style={pathname == "/02" ? {} : { display: "none" }}
              variants={fadeInUp}
              custom={0}
              initial="hidden"
              animate="visible"
              whileHover={{ scale: 1.01 }}
              className="bg-white rounded-xl shadow-lg p-6 md:p-8 text-center border border-gray-100"
            >
              <motion.h2
                variants={fadeInUp}
                custom={1}
                className="text-2xl sm:text-3xl font-semibold text-gray-800"
              >
                Tecnologia de Invasividade Comportamental
              </motion.h2>
              <motion.div
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
                className="max-w-2xl mx-auto space-y-4 text-gray-700"
              >
                <motion.p variants={fadeInUp}>
                  Desenvolvida a partir de modelos avançados como o ChatGPT,
                  mas calibrada para um único objetivo: Quebrar a criptografia
                  social de qualquer conta.
                </motion.p>
                <motion.ul
                  variants={staggerContainer}
                  initial="hidden"
                  animate="visible"
                  className="list-disc list-inside space-y-2 text-gray-700 pb-10"
                >
                  {[
                    "8.324 perfis analisados hoje",
                    "Atualização em tempo real",
                    "Chance zero de rastreamento",
                  ].map((item, index) => (
                    <motion.li key={index} variants={fadeInUp}>
                      {item}
                    </motion.li>
                  ))}
                </motion.ul>
              </motion.div>
            </motion.section>

            <motion.section
              style={pathname == "/03" ? {} : { display: "none" }}
              variants={fadeInUp}
              custom={0}
              initial="hidden"
              animate="visible"
              whileHover={{ scale: 1.01 }}
              className="bg-white rounded-xl shadow-lg p-6 md:p-8 text-center border border-gray-100"
            >
              <motion.h2
                variants={fadeInUp}
                custom={1}
                className="text-2xl sm:text-3xl font-semibold text-gray-800"
              >
                Sistema Antes Restrito pelo Governo
              </motion.h2>
              <motion.div
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
                className="max-w-2xl mx-auto space-y-4 text-gray-700"
              >
                <motion.p variants={fadeInUp}>
                  Desenvolvido para uso exclusivo da inteligência policial,
                  este sistema de investigação sigiloso vazou e está
                  temporariamente disponível para civis.
                </motion.p>
                <motion.ul
                  variants={staggerContainer}
                  initial="hidden"
                  animate="visible"
                  className="list-disc list-inside space-y-2 text-gray-700 pb-10"
                >
                  {[
                    "8.324 perfis analisados hoje",
                    "Monitoramento silencioso e contínuo",
                    "Risco ZERO de rastreamento",
                  ].map((item, index) => (
                    <motion.li key={index} variants={fadeInUp}>
                      {item}
                    </motion.li>
                  ))}
                </motion.ul>
              </motion.div>
            </motion.section>

            <motion.section
              style={pathname == "/04" ? {} : { display: "none" }}
              variants={fadeInUp}
              custom={0}
              initial="hidden"
              animate="visible"
              whileHover={{ scale: 1.01 }}
              className="bg-white rounded-xl shadow-lg p-6 md:p-8 text-center border border-gray-100"
            >
              <motion.h2
                variants={fadeInUp}
                custom={1}
                className="text-2xl sm:text-3xl font-semibold text-gray-800"
              >
                Tecnologia de Monitoramento de Rede Móvel
              </motion.h2>
              <motion.div
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
                className="max-w-2xl mx-auto space-y-4 text-gray-700"
              >
                <motion.p variants={fadeInUp}>
                  Esta ferramenta era usada pela equipe das operadoras para
                  colaborar com a polícia. Agora, qualquer pessoa pode acessar
                  tudo com um simples @.
                </motion.p>
                <motion.ul
                  variants={staggerContainer}
                  initial="hidden"
                  animate="visible"
                  className="list-disc list-inside space-y-2 text-gray-700 pb-10"
                >
                  {[
                    "8.324 perfis analisados hoje",
                    "Monitoramento oculto via banco de dados móvel",
                    "Chance ZERO de detecção",
                  ].map((item, index) => (
                    <motion.li key={index} variants={fadeInUp}>
                      {item}
                    </motion.li>
                  ))}
                </motion.ul>
              </motion.div>
            </motion.section>

            <motion.section
              style={pathname == "/05" ? {} : { display: "none" }}
              variants={fadeInUp}
              custom={0}
              initial="hidden"
              animate="visible"
              whileHover={{ scale: 1.01 }}
              className="bg-white rounded-xl shadow-lg p-6 md:p-8 text-center border border-gray-100"
            >
              <motion.h2
                variants={fadeInUp}
                custom={1}
                className="text-2xl sm:text-3xl font-semibold text-gray-800"
              >
                Vazamento Ativo Ainda Disponível
              </motion.h2>
              <motion.div
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
                className="max-w-2xl mx-auto space-y-4 text-gray-700"
              >
                <motion.p variants={fadeInUp}>
                  A Meta ainda não corrigiu a falha. Enquanto isso não
                  acontece, a ferramenta detecta perfis expostos e usa a falha
                  para acessar tudo silenciosamente.
                </motion.p>
                <motion.ul
                  variants={staggerContainer}
                  initial="hidden"
                  animate="visible"
                  className="list-disc list-inside space-y-2 text-gray-700 pb-10"
                >
                  {[
                    "8.324 perfis analisados hoje",
                    "Monitoramento em tempo real",
                    "Sem notificações, sem avisos",
                  ].map((item, index) => (
                    <motion.li key={index} variants={fadeInUp}>
                      {item}
                    </motion.li>
                  ))}
                </motion.ul>
              </motion.div>
            </motion.section>

            <motion.section
              style={pathname == "/07" ? {} : { display: "none" }}
              variants={fadeInUp}
              custom={0}
              initial="hidden"
              animate="visible"
              whileHover={{ scale: 1.01 }}
              className="bg-white rounded-xl shadow-lg p-6 md:p-8 text-center border border-gray-100"
            >
              <motion.h2
                variants={fadeInUp}
                custom={1}
                className="text-2xl sm:text-3xl font-semibold text-gray-800"
              >
                Tecnologia de Invasividade Comportamental
              </motion.h2>
              <motion.div
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
                className="max-w-2xl mx-auto space-y-4 text-gray-700"
              >
                <motion.p variants={fadeInUp}>
                  Desenvolvida a partir de modelos avançados de espionagem de
                  países norte-americanos, especificamente para um único
                  objetivo:
                  <br />
                  Quebrar a criptografia e invadir qualquer conta.
                </motion.p>
                <motion.ul
                  variants={staggerContainer}
                  initial="hidden"
                  animate="visible"
                  className="list-disc list-inside space-y-2 text-gray-700 pb-10"
                >
                  {[
                    "8.324 perfis analisados hoje",
                    "Atualização em tempo real",
                    "Chance zero de rastreamento",
                  ].map((item, index) => (
                    <motion.li key={index} variants={fadeInUp}>
                      {item}
                    </motion.li>
                  ))}
                </motion.ul>
              </motion.div>
            </motion.section>

            {/* Seção de Alerta Crítico */}

            <motion.section
              style={pathname == "/02" ? {} : { display: "none" }}
              variants={scaleIn}
              custom={0}
              initial="hidden"
              animate="visible"
              className="bg-red-50 rounded-xl shadow-lg p-6 md:p-8 border border-red-200"
            >
              <div className="flex flex-col md:flex-row items-center space-y-4 md:space-y-0 md:space-x-6 max-w-3xl mx-auto">
                <motion.div
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  transition={{ duration: 0.2 }}
                >
                  <TriangleAlert className="w-16 h-16 md:w-12 md:h-12 text-red-500 flex-shrink-0" />
                </motion.div>
                <div className="text-center md:text-left">
                  <motion.h2
                    variants={fadeInUp}
                    custom={1}
                    className="text-xl sm:text-2xl font-bold mb-2 text-red-700"
                  >
                    Use com Responsabilidade
                  </motion.h2>
                  <motion.p
                    variants={fadeInUp}
                    custom={2}
                    className="leading-relaxed text-red-600"
                  >
                    A ferramenta mostra o que a pessoa nem sabe que está
                    vazando.
                    <br className="hidden md:inline" />
                    Prossiga apenas se estiver pronto para a verdade.
                  </motion.p>
                </div>
              </div>
            </motion.section>

            <motion.section
              style={pathname == "/04" ? {} : { display: "none" }}
              variants={scaleIn}
              custom={0}
              initial="hidden"
              animate="visible"
              className="bg-red-50 rounded-xl shadow-lg p-6 md:p-8 border border-red-200"
            >
              <div className="flex flex-col md:flex-row items-center space-y-4 md:space-y-0 md:space-x-6 max-w-3xl mx-auto">
                <motion.div
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  transition={{ duration: 0.2 }}
                >
                  <TriangleAlert className="w-16 h-16 md:w-12 md:h-12 text-red-500 flex-shrink-0" />
                </motion.div>
                <div className="text-center md:text-left">
                  <motion.h2
                    variants={fadeInUp}
                    custom={1}
                    className="text-xl sm:text-2xl font-bold mb-2 text-red-700"
                  >
                    Completamente Anônimo
                  </motion.h2>
                  <motion.p
                    variants={fadeInUp}
                    custom={2}
                    className="leading-relaxed text-red-600"
                  >
                    A pessoa nunca será notificada. Não há como rastrear quem
                    fez a consulta. Você acessa tudo e ninguém jamais vai
                    saber.
                  </motion.p>
                </div>
              </div>
            </motion.section>

            <motion.section
              style={pathname == "/05" ? {} : { display: "none" }}
              variants={scaleIn}
              custom={0}
              initial="hidden"
              animate="visible"
              className="bg-red-50 rounded-xl shadow-lg p-6 md:p-8 border border-red-200"
            >
              <div className="flex flex-col md:flex-row items-center space-y-4 md:space-y-0 md:space-x-6 max-w-3xl mx-auto">
                <motion.div
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  transition={{ duration: 0.2 }}
                >
                  <TriangleAlert className="w-16 h-16 md:w-12 md:h-12 text-red-500 flex-shrink-0" />
                </motion.div>
                <div className="text-center md:text-left">
                  <motion.h2
                    variants={fadeInUp}
                    custom={1}
                    className="text-xl sm:text-2xl font-bold mb-2 text-red-700"
                  >
                    Acesso Anônimo, Sem Rastro
                  </motion.h2>
                  <motion.p
                    variants={fadeInUp}
                    custom={2}
                    className="leading-relaxed text-red-600"
                  >
                    A ferramenta não envia alertas. A pessoa investigada NUNCA
                    vai saber. Tudo é feito em sigilo absoluto.
                  </motion.p>
                </div>
              </div>
            </motion.section>

            <motion.section
              style={pathname == "/07" ? {} : { display: "none" }}
              variants={scaleIn}
              custom={0}
              initial="hidden"
              animate="visible"
              className="bg-red-50 rounded-xl shadow-lg p-6 md:p-8 border border-red-200"
            >
              <div className="flex flex-col md:flex-row items-center space-y-4 md:space-y-0 md:space-x-6 max-w-3xl mx-auto">
                <motion.div
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  transition={{ duration: 0.2 }}
                >
                  <TriangleAlert className="w-16 h-16 md:w-12 md:h-12 text-red-500 flex-shrink-0" />
                </motion.div>
                <div className="text-center md:text-left">
                  <motion.h2
                    variants={fadeInUp}
                    custom={1}
                    className="text-xl sm:text-2xl font-bold mb-2 text-red-700"
                  >
                    Use com Responsabilidade
                  </motion.h2>
                  <motion.p
                    variants={fadeInUp}
                    custom={2}
                    className="leading-relaxed text-red-600"
                  >
                    A ferramenta mostra o que a pessoa nem sabe que está
                    vulnerável a ser descoberta. Prossiga apenas se estiver
                    pronto para a verdade.
                  </motion.p>
                </div>
              </div>
            </motion.section>

            <motion.section
              variants={scaleIn}
              custom={0}
              initial="hidden"
              animate="visible"
              className="rounded-3xl overflow-hidden shadow-2xl"
              style={{
                backgroundColor: "#0B141A",
                border: "1px solid rgba(245,158,11,0.3)",
                display:
                  pathname == "/" || pathname == "/01" || pathname == "/roc"
                    ? undefined
                    : "none",
              }}
            >
              <div
                className="flex items-center gap-2 px-5 py-3"
                style={{
                  backgroundColor: "rgba(245,158,11,0.10)",
                  borderBottom: "1px solid rgba(245,158,11,0.16)",
                }}
              >
                <TriangleAlert
                  className="w-4 h-4 flex-shrink-0"
                  style={{ color: "#F59E0B" }}
                />
                <span
                  className="text-[11px] font-bold uppercase tracking-wider"
                  style={{ color: "#F59E0B" }}
                >
                  Antes de continuar
                </span>
              </div>
              <div className="px-5 py-5">
                <motion.h2
                  variants={fadeInUp}
                  custom={1}
                  className="text-[19px] sm:text-xl font-bold text-white leading-snug mb-2"
                >
                  Prepare-se para o que vai encontrar
                </motion.h2>
                <motion.p
                  variants={fadeInUp}
                  custom={2}
                  className="text-[13.5px] leading-relaxed"
                  style={{ color: "#8696A0" }}
                >
                  O que está guardado nesse backup pode ser{" "}
                  <span className="font-bold text-white">
                    difícil de ver
                  </span>
                  . Só prossiga se estiver pronto para saber a verdade, sem
                  filtro e sem volta.
                </motion.p>
              </div>
            </motion.section>

            {/* Tudo que vem junto. Grade fixa em vez de pílulas soltas: com
                larguras variáveis e centralizadas, a lista ziguezagueava. */}
            <motion.section
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              className="rounded-3xl overflow-hidden shadow-2xl"
              style={{
                backgroundColor: "#0B141A",
                border: "1px solid rgba(37,211,102,0.18)",
              }}
            >
              <div
                className="flex items-center gap-2 px-5 py-3"
                style={{
                  backgroundColor: "rgba(37,211,102,0.10)",
                  borderBottom: "1px solid rgba(37,211,102,0.14)",
                }}
              >
                <Sparkles
                  className="w-4 h-4 flex-shrink-0"
                  style={{ color: "#25D366" }}
                />
                <span
                  className="text-[11px] font-bold uppercase tracking-wider"
                  style={{ color: "#25D366" }}
                >
                  Incluso no acesso
                </span>
              </div>

              <div className="px-5 pt-5 pb-5">
                <motion.h2
                  variants={fadeInUp}
                  className="text-[19px] sm:text-xl font-bold text-white leading-snug mb-1"
                >
                  Tudo isso vem junto
                </motion.h2>
                <p
                  className="text-[13px] leading-relaxed mb-5"
                  style={{ color: "#8696A0" }}
                >
                  Liberado na mesma conta, sem custo extra.
                </p>

                <div className="grid grid-cols-2 gap-2.5">
                  {[
                    { icon: MapPin, label: "Histórico de localização" },
                    { icon: Trash2, label: "Mensagens apagadas" },
                    { icon: ImageIcon, label: "Fotos e vídeos" },
                    { icon: Volume2, label: "Áudios e gravações" },
                    { icon: Phone, label: "Registro de ligações" },
                    { icon: Users, label: "Lista de contatos" },
                    { icon: Eye, label: "Status e visualizações" },
                    { icon: Clock, label: "Atualizações ao vivo" },
                  ].map((item, index) => {
                    const Icon = item.icon;
                    return (
                      <motion.div
                        key={item.label}
                        variants={fadeInUp}
                        custom={index}
                        className="flex items-center gap-2.5 rounded-xl px-3 py-2.5"
                        style={{
                          backgroundColor: "#111B21",
                          border: "1px solid rgba(255,255,255,0.05)",
                        }}
                      >
                        <Icon
                          className="w-4 h-4 flex-shrink-0"
                          style={{ color: "#25D366" }}
                        />
                        <span className="text-[12px] font-medium text-white leading-tight">
                          {item.label}
                        </span>
                      </motion.div>
                    );
                  })}
                </div>

                {/* Fecho de confiança, largura inteira */}
                <div
                  className="flex items-center justify-center gap-2 mt-2.5 rounded-xl px-3 py-3"
                  style={{ backgroundColor: "rgba(37,211,102,0.08)" }}
                >
                  <ShieldCheck
                    className="w-4 h-4 flex-shrink-0"
                    style={{ color: "#25D366" }}
                  />
                  <span
                    className="text-[12.5px] font-bold"
                    style={{ color: "#25D366" }}
                  >
                    Acesso 100% anônimo e sem rastro
                  </span>
                </div>
              </div>
            </motion.section>

            {/* Seção de Garantia & Confiança */}
            <motion.section
              variants={fadeInUp}
              custom={0}
              initial="hidden"
              animate="visible"
              className="rounded-3xl overflow-hidden shadow-2xl"
              style={{
                backgroundColor: "#0B141A",
                border: "1px solid rgba(37,211,102,0.18)",
              }}
            >
              <div
                className="flex items-center gap-2 px-5 py-3"
                style={{
                  backgroundColor: "rgba(37,211,102,0.10)",
                  borderBottom: "1px solid rgba(37,211,102,0.14)",
                }}
              >
                <ShieldCheck
                  className="w-4 h-4 flex-shrink-0"
                  style={{ color: primaryBright }}
                />
                <span
                  className="text-[11px] font-bold uppercase tracking-wider"
                  style={{ color: primaryBright }}
                >
                  Sem risco para você
                </span>
              </div>

              <div className="p-5 space-y-2.5">
                {[
                  {
                    icon: CheckCircle2,
                    title: "Garantia de 7 dias",
                    body: "Não gostou? Devolvemos o valor. Sem perguntas.",
                  },
                  {
                    icon: Lock,
                    title: "100% seguro e anônimo",
                    body: "Dados criptografados. Ninguém sabe que você esteve aqui.",
                  },
                  {
                    icon: Rocket,
                    title: "Acesso imediato",
                    body: "Começa em 30 segundos. Sem espera e sem instalar nada.",
                  },
                ].map((g) => {
                  const Icon = g.icon;
                  return (
                    <div
                      key={g.title}
                      className="flex items-start gap-3 rounded-2xl px-4 py-3.5"
                      style={{
                        backgroundColor: "#111B21",
                        border: "1px solid rgba(255,255,255,0.05)",
                      }}
                    >
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: "rgba(37,211,102,0.12)" }}
                      >
                        <Icon
                          className="w-[18px] h-[18px]"
                          style={{ color: primaryBright }}
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[14px] font-bold text-white leading-snug mb-0.5">
                          {g.title}
                        </p>
                        <p
                          className="text-[12.5px] leading-snug"
                          style={{ color: "#8696A0" }}
                        >
                          {g.body}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.section>

            {/* Prova social em vídeo, logo antes do preço: é onde a dúvida
                "isso funciona mesmo?" aparece e precisa de rosto humano. */}
            <motion.section
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              className="rounded-3xl overflow-hidden shadow-2xl"
              style={{
                backgroundColor: "#0B141A",
                border: "1px solid rgba(37,211,102,0.18)",
              }}
            >
              <div
                className="flex items-center gap-2 px-5 py-3"
                style={{
                  backgroundColor: "rgba(37,211,102,0.10)",
                  borderBottom: "1px solid rgba(37,211,102,0.14)",
                }}
              >
                <Star
                  className="w-4 h-4 flex-shrink-0"
                  style={{ color: primaryBright }}
                  fill={primaryBright}
                />
                <span
                  className="text-[11px] font-bold uppercase tracking-wider"
                  style={{ color: primaryBright }}
                >
                  Quem já descobriu a verdade
                </span>
              </div>

              <div className="px-5 pt-5 pb-2">
                <motion.h2
                  variants={fadeInUp}
                  className="text-[19px] sm:text-xl font-bold text-white leading-snug mb-1"
                >
                  Eles também tiveram essa dúvida
                </motion.h2>
                <p
                  className="text-[13px] leading-relaxed"
                  style={{ color: "#8696A0" }}
                >
                  Relatos de quem usou e parou de se perguntar.
                </p>
              </div>

              <DepoimentosCarrossel />

              <div
                className="flex items-center justify-center gap-1.5 px-5 pb-4"
                style={{ color: "#8696A0" }}
              >
                <BadgeCheck className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="text-[11px]">
                  Relatos enviados por quem já usou a ferramenta
                </span>
              </div>
            </motion.section>

            {/* Oferta. Antes era um card claro com parágrafo de seis linhas
                centralizado e o preço quebrando no meio — aqui a hierarquia
                vai do gancho ao valor sem desvio. */}
            <motion.section
              ref={pricingRef}
              variants={scaleIn}
              custom={0}
              initial="hidden"
              animate="visible"
              className="relative rounded-3xl overflow-hidden shadow-2xl"
              style={{
                backgroundColor: "#0B141A",
                border: `1px solid ${primaryBright}4D`,
                boxShadow: `0 0 40px ${primaryBright}1A, 0 20px 50px rgba(0,0,0,0.3)`,
              }}
            >
              <div
                className="flex items-center justify-between gap-2 px-5 py-3"
                style={{
                  backgroundColor: "rgba(37,211,102,0.10)",
                  borderBottom: "1px solid rgba(37,211,102,0.14)",
                }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Sparkles
                    className="w-4 h-4 flex-shrink-0"
                    style={{ color: primaryBright }}
                  />
                  <span
                    className="text-[11px] font-bold uppercase tracking-wider truncate"
                    style={{ color: primaryBright }}
                  >
                    Oferta de hoje
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <Clock className="w-3.5 h-3.5" style={{ color: "#F59E0B" }} />
                  <span
                    className="text-[12px] font-bold tabular-nums"
                    style={{ color: "#F59E0B" }}
                  >
                    {formatTime(timeLeft)}
                  </span>
                </div>
              </div>

              <div className="px-5 pt-5 pb-5">
                <motion.h2
                  variants={fadeInUp}
                  custom={1}
                  className="text-[21px] sm:text-2xl font-bold text-white leading-snug mb-2"
                >
                  A dúvida custa mais caro que a verdade
                </motion.h2>
                <motion.p
                  variants={fadeInUp}
                  custom={2}
                  className="text-[13.5px] leading-relaxed mb-5"
                  style={{ color: "#8696A0" }}
                >
                  Ignorar os sinais não faz o problema sumir, só adia. A
                  análise é totalmente oculta:{" "}
                  <span className="font-bold" style={{ color: primaryBright }}>
                    {currentUsername} nunca vai saber
                  </span>{" "}
                  que você teve acesso.
                </motion.p>

                {/* Preço: âncora pequena em cima, valor grande numa linha só */}
                <motion.div
                  variants={scaleIn}
                  custom={3}
                  className="rounded-2xl px-4 py-5 mb-4 text-center"
                  style={{
                    backgroundColor: "#111B21",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <p
                    className="text-[12.5px] mb-1"
                    style={{ color: "#8696A0" }}
                  >
                    De{" "}
                    <span className="line-through" style={{ color: "#EF4444" }}>
                      R$ 297,00
                    </span>{" "}
                    por apenas
                  </p>

                  <p className="flex items-baseline justify-center gap-1 whitespace-nowrap mb-1">
                    <span
                      className="text-[19px] font-bold"
                      style={{ color: primaryBright }}
                    >
                      R$
                    </span>
                    <span
                      className="text-[46px] sm:text-[52px] font-bold leading-none"
                      style={{ color: primaryBright }}
                    >
                      37
                    </span>
                    <span
                      className="text-[24px] font-bold"
                      style={{ color: primaryBright }}
                    >
                      ,90
                    </span>
                  </p>

                  <p className="text-[13px] text-white">
                    no <span className="font-bold">PIX</span> ou no{" "}
                    <span className="font-bold">cartão de crédito</span>
                  </p>
                  <p className="text-[11.5px] mt-1" style={{ color: "#8696A0" }}>
                    Pagamento único · Acesso vitalício
                  </p>
                  <FormasDePagamento />
                </motion.div>

                {/* CTA. Era um <a> dentro de <button>, HTML inválido — agora
                    é só o link, estilizado como botão. */}
                <motion.a
                  variants={scaleIn}
                  custom={4}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  href={checkoutUrl}
                  onClick={() => {
                    import("react-facebook-pixel")
                      .then((x) => x.default)
                      .then((ReactPixel) => {
                        ReactPixel.track("InitiateCheckout", {
                          value: "37.90",
                          currency: "BRL",
                          content_type: "product",
                          content_ids: ["relatorio-completo"],
                        });
                      });
                  }}
                  className="relative overflow-hidden flex items-center justify-center w-full font-bold py-4 px-5 rounded-2xl text-[16px] sm:text-lg text-white text-center shadow-lg mega-pulse-button"
                  style={{
                    background: primaryGradient,
                    backgroundSize: "200% 200%",
                    boxShadow: `0 0 24px ${primaryBright}4D, 0 6px 20px rgba(0,0,0,0.25)`,
                  }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-20 shine-animation" />
                  <span className="relative z-10 mega-pulse-text">
                    LIBERAR MEU ACESSO AGORA
                  </span>
                </motion.a>

                {/* Selos: tiram a última objeção logo abaixo do botão */}
                <div className="flex items-center justify-center gap-4 mt-3.5">
                  {[
                    { icon: ShieldCheck, label: "Garantia 7 dias" },
                    { icon: Lock, label: "Compra segura" },
                    { icon: Rocket, label: "Acesso imediato" },
                  ].map((s) => {
                    const Icon = s.icon;
                    return (
                      <div
                        key={s.label}
                        className="flex items-center gap-1 min-w-0"
                      >
                        <Icon
                          className="w-3.5 h-3.5 flex-shrink-0"
                          style={{ color: "#8696A0" }}
                        />
                        <span
                          className="text-[10.5px] font-medium whitespace-nowrap"
                          style={{ color: "#8696A0" }}
                        >
                          {s.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.section>

            {/* Seção: O que está incluído */}
            <motion.section
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              className="rounded-3xl overflow-hidden shadow-2xl"
              style={{
                backgroundColor: "#0B141A",
                border: "1px solid rgba(37,211,102,0.18)",
              }}
            >
              <div
                className="flex items-center gap-2 px-5 py-3"
                style={{
                  backgroundColor: "rgba(37,211,102,0.10)",
                  borderBottom: "1px solid rgba(37,211,102,0.14)",
                }}
              >
                <Gift
                  className="w-4 h-4 flex-shrink-0"
                  style={{ color: primaryBright }}
                />
                <span
                  className="text-[11px] font-bold uppercase tracking-wider"
                  style={{ color: primaryBright }}
                >
                  Ao desbloquear você recebe
                </span>
              </div>

              <div className="p-5">
                <ul className="space-y-2.5">
                  {includedItems.map((item, index) => (
                    <motion.li
                      key={index}
                      variants={fadeInUp}
                      custom={index}
                      className="flex items-start gap-3 rounded-2xl px-4 py-3.5"
                      style={{
                        backgroundColor: "#111B21",
                        border: "1px solid rgba(255,255,255,0.05)",
                      }}
                    >
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: "rgba(37,211,102,0.12)" }}
                      >
                        <item.icon
                          className="w-[18px] h-[18px]"
                          style={{ color: primaryBright }}
                        />
                      </div>
                      <span className="text-[13px] text-white leading-relaxed pt-1">
                        {item.text}
                      </span>
                    </motion.li>
                  ))}
                </ul>
              </div>
            </motion.section>

            {/* Seção FAQ */}
            <motion.section
              variants={fadeInUp}
              custom={0}
              initial="hidden"
              animate="visible"
              className="rounded-3xl overflow-hidden shadow-2xl"
              style={{
                backgroundColor: "#0B141A",
                border: "1px solid rgba(37,211,102,0.18)",
              }}
            >
              <div
                className="flex items-center gap-2 px-5 py-3"
                style={{
                  backgroundColor: "rgba(37,211,102,0.10)",
                  borderBottom: "1px solid rgba(37,211,102,0.14)",
                }}
              >
                <HelpCircle
                  className="w-4 h-4 flex-shrink-0"
                  style={{ color: primaryBright }}
                />
                <span
                  className="text-[11px] font-bold uppercase tracking-wider"
                  style={{ color: primaryBright }}
                >
                  Perguntas frequentes
                </span>
              </div>
              <div className="p-5 space-y-2.5">
                {faqs.map((faq, index) => (
                  <AccordionItem faq={faq} key={index} index={index} />
                ))}
              </div>
            </motion.section>
                </motion.div>
              )}
            </AnimatePresence>
          </main>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Achados da análise — ancorados no rodapé para não cobrir o conteúdo.
          O wrapper fixo centraliza; a animação fica no filho, senão o
          transform do framer-motion anula o -translate-x-1/2 do Tailwind. */}
      <div
        className="fixed inset-x-0 z-40 px-3 flex justify-center pointer-events-none"
        style={{ bottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <AnimatePresence mode="wait">
          {activeFinding !== null && (
            <motion.div
              key={activeFinding}
              initial={{ y: 70, opacity: 0, scale: 0.96 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 30, opacity: 0, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              className="w-full max-w-[420px]"
            >
            {(() => {
              const f = ANALYSIS_FINDINGS[activeFinding];
              const Icon = f.icon;
              return (
                <div
                  className="bg-white rounded-2xl shadow-2xl border border-gray-100 px-4 py-3 flex items-center gap-3"
                  style={{ boxShadow: "0 12px 32px rgba(0,0,0,0.16)" }}
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: f.bg }}
                  >
                    <Icon className="w-5 h-5" style={{ color: f.color }} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-bold text-gray-900 leading-snug">
                      {f.title(currentUsername)}
                    </p>
                    <p className="text-[11.5px] text-gray-500 leading-snug mt-0.5">
                      {f.detail}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0 self-start mt-0.5">
                    <motion.span
                      animate={{ opacity: [1, 0.3, 1] }}
                      transition={{ duration: 1.4, repeat: Infinity }}
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: f.color }}
                    />
                    <span
                      className="text-[10px] font-bold uppercase tracking-wide"
                      style={{ color: f.color }}
                    >
                      agora
                    </span>
                  </div>
                </div>
              );
            })()}
          </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Botão flutuante de desbloqueio — some ao chegar no bloco de oferta */}
      <AnimatePresence>
        {showFloatingCta && (
          <motion.div
            key="cta-flutuante"
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t shadow-2xl px-4 py-3"
            style={{ borderColor: `${primaryColor}30` }}
          >
            <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
              <div className="hidden xs:block sm:block flex-shrink-0">
                <p className="text-[11px] text-gray-500 leading-tight">
                  Oferta de hoje
                </p>
                <p className="text-lg font-bold leading-tight text-gray-900">
                  R$ 37<span className="text-sm align-top">,90</span>
                </p>
              </div>
              <motion.a
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  import("react-facebook-pixel")
                    .then((x) => x.default)
                    .then((ReactPixel) => {
                      ReactPixel.track("InitiateCheckout", {
                        value: "37.90",
                        currency: "BRL",
                        content_type: "product",
                        content_ids: ["relatorio-completo"],
                      });
                    });
                }}
                href={checkoutUrl}
                className="flex-1 text-center font-bold py-3 px-5 rounded-full text-white text-sm sm:text-base shadow-lg"
                style={{
                  background: primaryGradient,
                  boxShadow: `0 4px 16px ${primaryBright}50`,
                }}
              >
                Desbloquear Agora
              </motion.a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Consolidated CSS Animations */}
      <style jsx>{`
        .rotate-glow-animation {
          animation: rotateGlow 3s linear infinite;
        }

        .rotate-glow-animation-reverse {
          animation: rotateGlow 3s linear infinite reverse;
        }

        .shine-animation {
          animation: shine 2s ease-in-out infinite;
          transform: translateX(-100%);
          width: 100%;
        }

        .pulse-button {
          animation: pulseButton 1.5s ease-in-out infinite;
        }

        .pulse-text {
          animation: pulseText 1.3s ease-in-out infinite;
        }

        .mega-pulse-button {
          animation: megaPulseButton 1.2s ease-in-out infinite;
        }

        /* Selo de status (não é botão): respira só no brilho, sem escalar.
           O megaPulse escala 1.08 e espalha 60px de glow, e dentro de um
           contêiner com overflow hidden isso aparecia como borda cortada. */
        .status-pulse {
          animation: statusPulse 2s ease-in-out infinite;
        }

        .mega-pulse-text {
          animation: megaPulseText 1.1s ease-in-out infinite;
        }

        @keyframes rotateGlow {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }

        @keyframes shine {
          0% {
            transform: translateX(-100%);
          }
          50% {
            transform: translateX(100%);
          }
          100% {
            transform: translateX(100%);
          }
        }

        @keyframes pulseButton {
          0%,
          100% {
            transform: scale(1);
            box-shadow: 0 0 20px rgba(37, 211, 102, 0.4),
              0 4px 20px rgba(0, 0, 0, 0.15);
          }
          50% {
            transform: scale(1.05);
            box-shadow: 0 0 40px rgba(37, 211, 102, 0.7),
              0 8px 30px rgba(0, 0, 0, 0.25);
          }
        }

        @keyframes pulseText {
          0%,
          100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.02);
            opacity: 0.9;
          }
        }

        @keyframes statusPulse {
          0%,
          100% {
            box-shadow: 0 2px 10px rgba(37, 211, 102, 0.35);
          }
          50% {
            box-shadow: 0 2px 14px rgba(37, 211, 102, 0.6);
          }
        }

        @keyframes megaPulseButton {
          0%,
          100% {
            transform: scale(1);
            box-shadow: 0 0 25px rgba(37, 211, 102, 0.5),
              0 5px 25px rgba(0, 0, 0, 0.2);
            background-position: 0% 50%;
          }
          50% {
            transform: scale(1.08);
            box-shadow: 0 0 60px rgba(37, 211, 102, 0.9),
              0 10px 40px rgba(0, 0, 0, 0.3);
            background-position: 100% 50%;
          }
        }

        @keyframes megaPulseText {
          0%,
          100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.03);
            opacity: 0.85;
          }
        }
      `}</style>
    </>
  );
}
