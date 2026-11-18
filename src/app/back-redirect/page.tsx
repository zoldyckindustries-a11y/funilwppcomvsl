"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Clock,
  MessageCircle,
  ImageIcon,
  MapPin,
  Lock,
  ShieldCheck,
  Check,
  TriangleAlert,
  ChevronRight,
  Smartphone,
  BellRing,
  ArrowRight,
  EyeOff,
  QrCode,
  CreditCard,
} from "lucide-react";
import { colors } from "../../constants/theme";
import { PRODUTO_RESGATE, emReais } from "../../lib/checkout/produtos";
import { linkDaOferta } from "../../lib/checkout/destinos";
import { useCheckoutUrl } from "../../lib/upsell";
import { AvatarContato } from "../components/AvatarContato";

// Destino do botão, vindo do interruptor em lib/checkout/destinos.ts.
// Com o gateway fora do ar, aponta para o link próprio desta oferta na
// PerfectPay. Os números exibidos continuam saindo do catálogo
// (`resgate`), e não escritos à mão aqui.
const CHECKOUT_URL = linkDaOferta("resgate");

const PRECO_DE = emReais(PRODUTO_RESGATE.precoDe);
const [PRECO_INTEIRO, PRECO_CENTAVOS_SEM_VIRGULA] = (PRODUTO_RESGATE.preco / 100)
  .toFixed(2)
  .split(".");
const PRECO_CENTAVOS = `,${PRECO_CENTAVOS_SEM_VIRGULA}`;
const PRECO_PIXEL = (PRODUTO_RESGATE.preco / 100).toFixed(2);

// Relógio da ameaça. O que expira aqui não é um desconto: é a janela antes de
// o aviso sair do lado de lá. Por isso ele não zera em "oferta encerrada" —
// zera em "envio iminente", que é pior.
const SEGUNDOS_ATE_ENVIO = 9 * 60;

/**
 * Identificação do aparelho de quem está lendo.
 *
 * O modelo desta página usa a foto da câmera do visitante ("sua foto será
 * enviada ao perfil monitorado"). Nós nunca pedimos câmera, e pedir aqui
 * derrubaria a página inteira no primeiro "bloquear". O que temos é melhor
 * para o efeito: os dados do próprio aparelho dele. Ler "Android 13 · Chrome,
 * em Nova Serrana - MG" assusta mais do que uma foto genérica, porque está
 * certo.
 */
function lerDispositivo(): { aparelho: string; id: string } {
  if (typeof navigator === "undefined") {
    return { aparelho: "Dispositivo móvel", id: "----" };
  }
  const ua = navigator.userAgent;

  const sistema = /iPhone|iPad|iPod/i.test(ua)
    ? "iPhone"
    : /Android\s([\d.]+)/i.test(ua)
      ? `Android ${ua.match(/Android\s([\d.]+)/i)?.[1]?.split(".")[0] ?? ""}`.trim()
      : /Windows/i.test(ua)
        ? "Windows"
        : /Mac OS X/i.test(ua)
          ? "Mac"
          : "Dispositivo móvel";

  const navegador = /EdgA?\//i.test(ua)
    ? "Edge"
    : /OPR\//i.test(ua)
      ? "Opera"
      : /Chrome\//i.test(ua)
        ? "Chrome"
        : /Firefox\//i.test(ua)
          ? "Firefox"
          : /Safari\//i.test(ua)
            ? "Safari"
            : "Navegador";

  // Identificador estável derivado do próprio agente: o mesmo aparelho mostra
  // sempre o mesmo código. Um número aleatório mudaria a cada recarga e
  // entregaria que é enfeite.
  let hash = 0;
  for (let i = 0; i < ua.length; i++) {
    hash = (hash * 31 + ua.charCodeAt(i)) >>> 0;
  }
  const bruto = hash.toString(16).padStart(8, "0").toUpperCase();

  return {
    aparelho: `${sistema} · ${navegador}`,
    id: `${bruto.slice(0, 4)}-${bruto.slice(4, 8)}`,
  };
}

/**
 * Formas de pagamento aceitas no checkout.
 *
 * O checkout cobra por PIX e por cartão de crédito. A página de resgate é a
 * última chance de conversão: quem chega aqui sem PIX precisa ver, no mesmo
 * quadro do preço, que o cartão também serve.
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
        const Icone = f.icon;
        return (
          <span
            key={f.label}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
            style={{
              backgroundColor: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <Icone
              className="w-3.5 h-3.5 flex-shrink-0"
              style={{ color: colors.primaryBright }}
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

// Mesma anatomia dos dossiês da oferta: etiqueta, título, conteúdo em cards
// internos. A página é uma extensão do funil, não uma tela avulsa.
function Bloco({
  etiqueta,
  icone: Icone,
  cor = colors.primaryBright,
  children,
}: {
  etiqueta: string;
  icone: typeof Lock;
  cor?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-3xl overflow-hidden shadow-2xl"
      style={{
        backgroundColor: "#0B141A",
        border: `1px solid ${cor}2E`,
      }}
    >
      <div
        className="flex items-center gap-2 px-5 py-3"
        style={{
          backgroundColor: `${cor}1A`,
          borderBottom: `1px solid ${cor}24`,
        }}
      >
        <Icone className="w-4 h-4 flex-shrink-0" style={{ color: cor }} />
        <span
          className="text-[11px] font-bold uppercase tracking-wider"
          style={{ color: cor }}
        >
          {etiqueta}
        </span>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

/** Aviso em pílula, usado para as frases que precisam ficar soltas do corpo */
function Pilula({
  children,
  cor = "#F59E0B",
}: {
  children: React.ReactNode;
  cor?: string;
}) {
  return (
    <div
      className="rounded-2xl px-4 py-3"
      style={{ backgroundColor: `${cor}14`, border: `1px solid ${cor}3D` }}
    >
      <p className="text-[12.5px] leading-snug" style={{ color: "#E9EDEF" }}>
        {children}
      </p>
    </div>
  );
}

export default function BackRedirect() {
  const checkoutUrl = useCheckoutUrl(CHECKOUT_URL);
  const [alvo, setAlvo] = useState("o número consultado");
  const [nomeAlvo, setNomeAlvo] = useState("");
  const [fotoAlvo, setFotoAlvo] = useState<string | null>(null);
  const [regiao, setRegiao] = useState("");
  const [dispositivo, setDispositivo] = useState<{
    aparelho: string;
    id: string;
  } | null>(null);
  const [segundos, setSegundos] = useState(SEGUNDOS_ATE_ENVIO);
  const [mostrarBarra, setMostrarBarra] = useState(false);
  const ofertaRef = useRef<HTMLDivElement>(null);

  // Tudo que identifica os dois lados da tela vem do que o funil já guardou:
  // o número e a foto saem da mesma consulta de /api/whatsapp-profile feita na
  // busca, e a cidade do locationService. Nada aqui é inventado na hora — é o
  // que faz o bloco de identificação valer alguma coisa.
  useEffect(() => {
    const num = localStorage.getItem("searchedUsername");
    if (num) setAlvo(num);

    const nome = localStorage.getItem("targetName");
    if (nome) setNomeAlvo(nome);

    const foto = localStorage.getItem("userProfilePic");
    if (foto) setFotoAlvo(foto);

    try {
      const bruto = localStorage.getItem("userLocation");
      if (bruto) {
        const loc = JSON.parse(bruto);
        if (loc?.city) {
          setRegiao(loc.state ? `${loc.city} - ${loc.state}` : loc.city);
        }
      }
    } catch {
      // localStorage corrompido não pode derrubar a página
    }

    setDispositivo(lerDispositivo());
  }, []);

  // O pixel já sobe pelo layout, e esta rota é alcançada com
  // window.location.href, que recarrega a página — o PageView dela vem de lá.
  // Aqui fica só o evento próprio da etapa.
  useEffect(() => {
    import("react-facebook-pixel")
      .then((x) => x.default)
      .then((ReactPixel) => {
        ReactPixel.trackCustom("BackRedirectView");
      })
      .catch(() => {
        // bloqueador de anúncios não pode derrubar a página
      });
  }, []);

  // CTA fixo aparece depois que a pessoa passa do bloco de oferta. Mede a
  // posição no scroll em vez de IntersectionObserver: com rolagem rápida o
  // retângulo do observer chega defasado e a barra não acompanha.
  useEffect(() => {
    const avaliar = () => {
      const bloco = ofertaRef.current;
      if (!bloco) return;
      setMostrarBarra(bloco.getBoundingClientRect().bottom < 0);
    };
    avaliar();
    window.addEventListener("scroll", avaliar, { passive: true });
    window.addEventListener("resize", avaliar);
    return () => {
      window.removeEventListener("scroll", avaliar);
      window.removeEventListener("resize", avaliar);
    };
  }, []);

  useEffect(() => {
    if (segundos <= 0) return;
    const t = setInterval(() => setSegundos((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [segundos]);

  const irParaCheckout = () => {
    import("react-facebook-pixel")
      .then((x) => x.default)
      .then((ReactPixel) => {
        ReactPixel.track("InitiateCheckout", {
          value: PRECO_PIXEL,
          currency: "BRL",
          content_type: "product",
          content_ids: ["back-redirect-anti-alerta"],
        });
      })
      .catch(() => {});
  };

  const iminente = segundos === 0;
  const mm = String(Math.floor(segundos / 60)).padStart(2, "0");
  const ss = String(segundos % 60).padStart(2, "0");

  const contadores = [
    {
      icone: MessageCircle,
      valor: 47,
      rotulo: "Mensagens suspeitas",
      detalhe: "conversas com conteúdo íntimo",
    },
    {
      icone: ImageIcon,
      valor: 23,
      rotulo: "Fotos comprometedoras",
      detalhe: "imagens e mídia de visualização única",
    },
    {
      icone: MapPin,
      valor: 2,
      rotulo: "Localizações suspeitas",
      detalhe: "lugares fora da rotina",
    },
  ];

  const evidencias = [
    "Acesso completo às conversas, áudios e fotos sem deixar rastro ou alerta",
    "Mensagens apagadas recuperadas, incluindo as excluídas para os dois lados",
    "Fotos e vídeos de visualização única restaurados e salvos",
    "Localização em tempo real e histórico de lugares visitados",
    "ANONIMATO TOTAL: a pessoa nunca saberá que foi monitorada",
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#D9DBD5" }}>
      <div className="max-w-[480px] mx-auto min-h-screen bg-white md:shadow-2xl">
        {/* Faixa do envio. O relógio desta página não conta desconto nenhum:
            conta o tempo até o aviso sair do lado de lá. */}
        <div
          className="sticky top-0 z-30 px-4 py-3 flex items-center justify-between gap-3"
          style={{
            background: colors.gradients.dark,
            borderBottom: `1px solid ${iminente ? "rgba(239,68,68,0.5)" : "rgba(245,158,11,0.3)"}`,
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <motion.span
              animate={{ opacity: [1, 0.25, 1] }}
              transition={{ duration: 1.1, repeat: Infinity }}
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: iminente ? "#EF4444" : "#F59E0B" }}
            />
            <span className="text-[12.5px] font-semibold text-white truncate">
              {iminente
                ? "Envio do alerta em andamento"
                : "Alerta será enviado em"}
            </span>
          </div>
          {!iminente && (
            <span
              className="text-[17px] font-extrabold tabular-nums flex-shrink-0"
              style={{ color: "#FFFFFF" }}
            >
              {mm}:{ss}
            </span>
          )}
        </div>

        <main className="px-4 py-5 space-y-4">
          {/* Bloco 1 — a identificação, agora na primeira dobra.
              Ela estava embaixo de dois parágrafos de explicação, e o lead
              rolava uma tela inteira antes de ver a única coisa que prova
              que a ameaça é com ele: o aparelho dele de um lado, o número
              que ele mesmo digitou do outro. A explicação de POR QUE isso
              acontece não precisa vir antes — ela só funciona depois do
              susto. */}
          <Bloco
            etiqueta="Alerta: você foi identificado(a)"
            icone={Smartphone}
            cor="#EF4444"
          >
            <div className="text-center mb-4">
              <div className="relative w-12 h-12 mx-auto mb-3">
                <motion.span
                  animate={{ scale: [1, 1.6], opacity: [0.4, 0] }}
                  transition={{ duration: 1.9, repeat: Infinity, ease: "easeOut" }}
                  className="absolute inset-0 rounded-2xl"
                  style={{ backgroundColor: "#DC2626" }}
                />
                <div
                  className="relative w-12 h-12 rounded-2xl flex items-center justify-center"
                  style={{
                    background: "linear-gradient(135deg, #DC2626 0%, #EF4444 100%)",
                  }}
                >
                  <TriangleAlert className="w-6 h-6 text-white" strokeWidth={2.2} />
                </div>
              </div>

              {/* Menor e mais apertado que antes: em quatro linhas de 22px o
                  título sozinho empurrava o cartão para fora da tela. */}
              <h1 className="text-[18px] font-extrabold text-white leading-[1.2] uppercase">
                {nomeAlvo || alvo} vai receber um aviso de que você acessou o
                WhatsApp dele
              </h1>
            </div>

            <div className="flex items-stretch gap-2 mb-3.5">
              {/* Lado de cá */}
              <div
                className="flex-1 min-w-0 rounded-2xl px-3 py-3.5 text-center"
                style={{
                  backgroundColor: "#111B21",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div
                  className="w-12 h-12 rounded-full mx-auto mb-2 flex items-center justify-center"
                  style={{ backgroundColor: "rgba(239,68,68,0.14)" }}
                >
                  <Smartphone className="w-6 h-6" style={{ color: "#F87171" }} />
                </div>
                <p
                  className="text-[10px] font-extrabold uppercase tracking-wider mb-1"
                  style={{ color: "#F87171" }}
                >
                  Seu aparelho
                </p>
                <p className="text-[11.5px] font-bold text-white leading-tight">
                  {dispositivo?.aparelho ?? "Identificando…"}
                </p>
                {regiao && (
                  <p
                    className="text-[10.5px] leading-tight mt-0.5"
                    style={{ color: "#8696A0" }}
                  >
                    {regiao}
                  </p>
                )}
                <p
                  className="text-[10px] leading-tight mt-1 tabular-nums"
                  style={{ color: "#8696A0" }}
                >
                  ID {dispositivo?.id ?? "----"}
                </p>
              </div>

              {/* A seta diz a direção do vazamento sem precisar de frase */}
              <div className="flex items-center justify-center flex-shrink-0 px-0.5">
                <motion.div
                  animate={{ x: [0, 4, 0] }}
                  transition={{ duration: 1.4, repeat: Infinity }}
                  className="w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: "rgba(239,68,68,0.16)" }}
                >
                  <ArrowRight className="w-4 h-4" style={{ color: "#F87171" }} />
                </motion.div>
              </div>

              {/* Lado de lá: o número consultado, com a foto da API */}
              <div
                className="flex-1 min-w-0 rounded-2xl px-3 py-3.5 text-center"
                style={{
                  backgroundColor: "#111B21",
                  border: `1.5px solid ${colors.primaryBright}80`,
                  boxShadow: `0 0 18px ${colors.primaryBright}26`,
                }}
              >
                <div className="w-12 h-12 mx-auto mb-2">
                  {fotoAlvo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={fotoAlvo}
                      alt=""
                      aria-hidden="true"
                      className="w-12 h-12 rounded-full object-cover"
                    />
                  ) : (
                    <AvatarContato
                      nome={nomeAlvo || alvo}
                      tamanho={48}
                      tone="#6B7C85"
                    />
                  )}
                </div>
                <p
                  className="text-[10px] font-extrabold uppercase tracking-wider mb-1"
                  style={{ color: colors.primaryBright }}
                >
                  Será notificado
                </p>
                {nomeAlvo && (
                  <p className="text-[11.5px] font-bold text-white leading-tight truncate">
                    {nomeAlvo}
                  </p>
                )}
                <p
                  className="text-[10.5px] leading-tight mt-0.5 truncate"
                  style={{ color: "#8696A0" }}
                >
                  {alvo}
                </p>
                <p
                  className="text-[10px] leading-tight mt-1"
                  style={{ color: "#8696A0" }}
                >
                  WhatsApp ativo
                </p>
              </div>
            </div>

            <p
              className="text-[12.5px] leading-relaxed mb-3"
              style={{ color: "#8696A0" }}
            >
              Estes dados saem junto com o aviso, como prova de qual aparelho
              tentou abrir as conversas e os arquivos privados.
            </p>

            <Pilula cor="#EF4444">
              <span className="font-bold">IMPORTANTE:</span> para cancelar o
              envio e manter o anonimato total, libere a versão completa abaixo.
            </Pilula>
          </Bloco>

          {/* Bloco 2 — por que o aviso existe e como desligá-lo.
              É tudo o que antes vinha ANTES do cartão. Aqui embaixo o texto
              trabalha melhor: já existe um susto para explicar. */}
          <Bloco etiqueta="Verificação anti-alerta" icone={BellRing} cor="#F59E0B">
            <div className="flex justify-center mb-3.5">
              <span
                className="px-3.5 py-1.5 rounded-full text-[11px] font-extrabold uppercase tracking-wider"
                style={{ backgroundColor: "#F59E0B1F", color: "#F59E0B" }}
              >
                Cuidado
              </span>
            </div>

            <p
              className="text-[13.5px] leading-relaxed mb-3"
              style={{ color: "#8696A0" }}
            >
              A prévia que você usou roda em modo aberto. Nesse modo, o aparelho
              monitorado pode receber uma notificação informando que o backup
              das conversas foi acessado por outro dispositivo.
            </p>
            <p
              className="text-[13.5px] leading-relaxed mb-4"
              style={{ color: "#8696A0" }}
            >
              Não deixe isso acontecer. Libere a versão completa e o acesso
              passa a ser invisível. Nenhum aviso sai do lado de lá.
            </p>

            <div className="space-y-2.5">
              <Pilula cor={colors.primaryBright}>
                Continue vendo tudo o que quiser, sem que a pessoa seja
                notificada.
              </Pilula>
              <Pilula cor={colors.primaryBright}>
                Conversas apagadas, áudios, fotos de visualização única e
                localização em tempo real.
              </Pilula>
            </div>
          </Bloco>

          {/* Bloco 3 — o que ele perde junto, dito em número */}
          <Bloco etiqueta="Resultados da análise completa" icone={ShieldCheck}>
            <div className="grid grid-cols-3 gap-2.5">
              {contadores.map((c) => {
                const Icone = c.icone;
                return (
                  <div
                    key={c.rotulo}
                    className="rounded-2xl px-2 py-3.5 text-center"
                    style={{
                      backgroundColor: "#111B21",
                      border: "1px solid rgba(255,255,255,0.05)",
                    }}
                  >
                    <Icone
                      className="w-4 h-4 mx-auto mb-1.5"
                      style={{ color: colors.primaryBright }}
                    />
                    <p
                      className="text-[24px] font-extrabold leading-none tabular-nums"
                      style={{ color: colors.primaryBright }}
                    >
                      {c.valor}
                    </p>
                    <p className="text-[10px] font-bold leading-tight mt-1.5 text-white">
                      {c.rotulo}
                    </p>
                    <p
                      className="text-[9.5px] leading-tight mt-0.5"
                      style={{ color: "#8696A0" }}
                    >
                      {c.detalhe}
                    </p>
                  </div>
                );
              })}
            </div>
          </Bloco>

          {/* Bloco 4 — a oferta */}
          <section
            ref={ofertaRef}
            className="relative rounded-3xl overflow-hidden shadow-2xl"
            style={{
              backgroundColor: "#0B141A",
              border: `1px solid ${colors.primaryBright}4D`,
              boxShadow: `0 0 40px ${colors.primaryBright}1A, 0 20px 50px rgba(0,0,0,0.3)`,
            }}
          >
            <div
              className="flex items-center justify-between gap-2 px-5 py-3"
              style={{
                backgroundColor: `${colors.primaryBright}1A`,
                borderBottom: `1px solid ${colors.primaryBright}24`,
              }}
            >
              <span
                className="text-[11px] font-bold uppercase tracking-wider truncate"
                style={{ color: colors.primaryBright }}
              >
                Oferta para continuar invisível
              </span>
              {!iminente && (
                <span className="flex items-center gap-1.5 flex-shrink-0">
                  <Clock className="w-3.5 h-3.5" style={{ color: "#F59E0B" }} />
                  <span
                    className="text-[12px] font-bold tabular-nums"
                    style={{ color: "#F59E0B" }}
                  >
                    {mm}:{ss}
                  </span>
                </span>
              )}
            </div>

            <div className="p-5">
              <h2 className="text-[21px] font-bold text-white leading-snug mb-1.5">
                Cancele o aviso e siga vendo tudo
              </h2>
              <p
                className="text-[13.5px] leading-relaxed mb-5"
                style={{ color: "#8696A0" }}
              >
                A versão completa desliga a notificação do lado de lá e libera o
                que a prévia deixou bloqueado.
              </p>

              <div
                className="rounded-2xl px-4 py-5 mb-4 text-center"
                style={{
                  backgroundColor: "#111B21",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <p className="text-[12.5px] mb-1" style={{ color: "#8696A0" }}>
                  De{" "}
                  <span className="line-through" style={{ color: "#EF4444" }}>
                    {PRECO_DE}
                  </span>{" "}
                  por apenas
                </p>
                <p className="flex items-baseline justify-center gap-1 whitespace-nowrap">
                  <span
                    className="text-[19px] font-bold"
                    style={{ color: colors.primaryBright }}
                  >
                    R$
                  </span>
                  <span
                    className="text-[52px] font-bold leading-none"
                    style={{ color: colors.primaryBright }}
                  >
                    {PRECO_INTEIRO}
                  </span>
                  <span
                    className="text-[24px] font-bold"
                    style={{ color: colors.primaryBright }}
                  >
                    {PRECO_CENTAVOS}
                  </span>
                </p>
                <p className="text-[13px] text-white mt-1.5">
                  no <span className="font-bold">PIX</span> ou no{" "}
                  <span className="font-bold">cartão de crédito</span>
                </p>
                <p className="text-[11.5px] mt-1" style={{ color: "#8696A0" }}>
                  Pagamento único · Acesso vitalício
                </p>
                <FormasDePagamento />
              </div>

              <motion.a
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                href={checkoutUrl}
                onClick={irParaCheckout}
                className="flex flex-col items-center justify-center w-full font-bold py-3.5 px-5 rounded-2xl text-center shadow-lg"
                style={{
                  background: `linear-gradient(135deg, ${colors.primaryBright} 0%, ${colors.primary} 100%)`,
                  boxShadow: `0 0 24px ${colors.primaryBright}4D, 0 6px 20px rgba(0,0,0,0.25)`,
                }}
              >
                <span className="text-[15px] text-white leading-tight">
                  SIM, QUERO CONTINUAR ANÔNIMO
                </span>
                <span className="text-[10.5px] font-medium text-white/80 leading-tight mt-0.5">
                  Clique aqui para cancelar o envio do alerta
                </span>
              </motion.a>

              <div className="flex items-center justify-center gap-4 mt-3.5">
                {[
                  { icone: ShieldCheck, texto: "Garantia 7 dias" },
                  { icone: Lock, texto: "Compra segura" },
                  { icone: EyeOff, texto: "100% anônimo" },
                ].map((s) => {
                  const Icone = s.icone;
                  return (
                    <div key={s.texto} className="flex items-center gap-1">
                      <Icone
                        className="w-3.5 h-3.5 flex-shrink-0"
                        style={{ color: "#8696A0" }}
                      />
                      <span
                        className="text-[10.5px] font-medium whitespace-nowrap"
                        style={{ color: "#8696A0" }}
                      >
                        {s.texto}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Bloco 5 — o que vem junto */}
          <Bloco etiqueta="Tudo isto sem ser descoberto" icone={Check}>
            <ul className="space-y-2.5">
              {evidencias.map((e) => (
                <li
                  key={e}
                  className="flex items-start gap-3 rounded-2xl px-4 py-3"
                  style={{
                    backgroundColor: "#111B21",
                    border: "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  <div
                    className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ backgroundColor: `${colors.primaryBright}1F` }}
                  >
                    <Check
                      className="w-3.5 h-3.5"
                      style={{ color: colors.primaryBright }}
                      strokeWidth={3}
                    />
                  </div>
                  <span className="text-[13px] text-white leading-relaxed">
                    {e}
                  </span>
                </li>
              ))}
            </ul>
          </Bloco>

          {/* Bloco 6 — a escolha, colocada como escolha mesmo */}
          <Bloco etiqueta="A decisão está nas suas mãos" icone={TriangleAlert} cor="#F59E0B">
            <p
              className="text-[13.5px] leading-relaxed mb-4"
              style={{ color: "#8696A0" }}
            >
              Você pode sair agora e correr o risco de o aviso chegar do outro
              lado, ou garantir o anonimato total e continuar vendo tudo.
            </p>
            <div className="space-y-2.5">
              <Pilula cor="#EF4444">
                <span className="font-bold">ATENÇÃO:</span> no modo aberto, o
                aparelho monitorado pode receber o alerta de acesso.
              </Pilula>
              <Pilula cor="#EF4444">
                <span className="font-bold">LEMBRE-SE:</span> quem é notificado
                descobre a data, a hora e o aparelho que tentou abrir as
                conversas.
              </Pilula>
            </div>
          </Bloco>

          {/* Bloco 7 — como o aviso chega.
              Mostrar a notificação é mais eficiente que descrevê-la: o lead
              reconhece o formato antes de ler a frase. */}
          <Bloco etiqueta="Risco de ser descoberto" icone={BellRing} cor="#EF4444">
            <p
              className="text-[13px] leading-relaxed mb-3.5"
              style={{ color: "#8696A0" }}
            >
              Sem a versão completa, é assim que o aviso aparece no aparelho de{" "}
              <span className="font-bold text-white">{nomeAlvo || alvo}</span>:
            </p>

            <div
              className="rounded-2xl px-3.5 py-3"
              style={{
                backgroundColor: "#1F2C33",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <div
                  className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: colors.primaryBright }}
                >
                  <MessageCircle className="w-3 h-3 text-white" />
                </div>
                <span className="text-[11px] font-bold text-white">WhatsApp</span>
                <span className="text-[10.5px]" style={{ color: "#8696A0" }}>
                  · agora
                </span>
              </div>
              <p className="text-[12.5px] font-bold text-white leading-snug">
                Backup acessado por outro dispositivo
              </p>
              <p
                className="text-[12px] leading-snug mt-0.5"
                style={{ color: "#A8B4BA" }}
              >
                Um {dispositivo?.aparelho ?? "aparelho"}
                {regiao ? ` em ${regiao}` : ""} abriu o backup das suas
                conversas. Se não foi você, revise seus dispositivos conectados.
              </p>
            </div>
          </Bloco>

          {/* Bloco 8 — última chance */}
          <section
            className="rounded-3xl overflow-hidden shadow-2xl text-center"
            style={{
              background: "linear-gradient(135deg, #054C40 0%, #075E54 100%)",
              border: `1px solid ${colors.primaryBright}4D`,
            }}
          >
            <div className="px-5 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <span
                className="text-[11px] font-bold uppercase tracking-wider"
                style={{ color: "#F59E0B" }}
              >
                Última oportunidade
              </span>
            </div>
            <div className="p-5">
              <h2 className="text-[22px] font-extrabold text-white leading-tight mb-4">
                Não deixe ser descoberto.
                <br />
                Garanta seu anonimato agora.
              </h2>
              <motion.a
                whileTap={{ scale: 0.98 }}
                href={checkoutUrl}
                onClick={irParaCheckout}
                className="flex flex-col items-center justify-center w-full font-bold py-3.5 px-5 rounded-2xl text-center shadow-lg"
                style={{
                  backgroundColor: colors.primaryBright,
                  color: "#06302B",
                }}
              >
                <span className="text-[15px] leading-tight">
                  GARANTIR ANONIMATO TOTAL
                </span>
                <span className="text-[10.5px] font-semibold leading-tight mt-0.5 opacity-80">
                  Última chance de cancelar o envio
                </span>
              </motion.a>
            </div>
          </section>

          {/* Saída */}
          <div className="pt-1 pb-24 text-center">
            <Link
              href="/"
              className="text-[12px] text-gray-400 underline underline-offset-2"
            >
              Prefiro sair e correr o risco
            </Link>
          </div>
        </main>

        {/* CTA fixo: entra quando o bloco de oferta sai da tela, some quando
            ele volta — dois botões iguais competindo é pior que nenhum */}
        <div
          className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] z-40 px-3 pb-3 transition-all duration-300"
          style={{
            transform: mostrarBarra
              ? "translate(-50%, 0)"
              : "translate(-50%, 110%)",
            opacity: mostrarBarra ? 1 : 0,
            pointerEvents: mostrarBarra ? "auto" : "none",
          }}
        >
          <a
            href={checkoutUrl}
            onClick={irParaCheckout}
            className="flex items-center justify-between gap-3 w-full rounded-2xl px-4 py-3 shadow-2xl"
            style={{
              background: `linear-gradient(135deg, ${colors.primaryBright} 0%, ${colors.primary} 100%)`,
              boxShadow: `0 0 24px ${colors.primaryBright}4D, 0 8px 24px rgba(0,0,0,0.3)`,
            }}
          >
            <span className="min-w-0">
              <span className="block text-[10.5px] font-medium text-white/80 leading-tight">
                Cancelar o alerta por
              </span>
              <span className="block text-[17px] font-bold text-white leading-tight">
                R$ {PRECO_INTEIRO}
                {PRECO_CENTAVOS}
              </span>
            </span>
            <span className="flex items-center gap-1 text-[13.5px] font-bold text-white flex-shrink-0">
              Continuar anônimo
              <ChevronRight className="w-4 h-4" />
            </span>
          </a>
        </div>
      </div>
    </div>
  );
}
