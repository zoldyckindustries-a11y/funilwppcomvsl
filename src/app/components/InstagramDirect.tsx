"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
  Lock,
  ChevronRight,
  Search,
  Camera,
  MoreVertical,
  MessagesSquare,
  Archive,
  CircleDot,
  Users,
  Phone,
  Plus,
  User,
  Clock,
} from "lucide-react";
import { colors } from "../../constants/theme";
import { CHAT_PREVIEWS } from "../data/chatPreviews";
import { garantirPerfisDemo } from "../data/demoProfiles";
import { AvatarContato } from "./AvatarContato";
import { CONVERSA_LIBERADA } from "../data/acessoConversas";
import ReBloqueio from "./ReBloqueio";
import { usePrevia } from "../../hooks/usePrevia";
import {
  PREVIA_SEGUNDOS,
  NOVO_CONTATO_EM,
  MIN_LEITURA_SEGUNDOS,
  LOCKDOWN_MS,
  eventosAte,
  digitandoAgora,
  previaDoEvento,
  horarioDoEvento,
} from "../data/previaAoVivo";

// O ritmo desta tela — duração da janela, horário de cada mensagem que chega
// ao vivo, tempo de re-bloqueio — mora todo em data/previaAoVivo.ts: é lá que
// se calibra o teste A/B sem tocar em componente. O relógio em si vem do hook
// usePrevia, compartilhado com a tela de conversa, porque abrir um chat
// desmonta esta tela e a janela não pode parar de correr por isso.

// Avatar sem foto: a inicial e a cor vêm de AvatarContato, compartilhado com
// a tela da conversa. Antes a cor saía do índice da linha, então abrir o chat
// trocava a cor do mesmo contato.
function DefaultAvatar({
  tone,
  nome,
  size = 56,
}: {
  tone?: string;
  nome?: string;
  size?: number;
}) {
  // Na lista a identidade fica velada; no cabeçalho da conversa, nítida.
  return (
    <AvatarContato nome={nome} tone={tone} tamanho={size} desfocarInicial />
  );
}

interface InstagramDirectProps {
  username: string;
  onBack?: () => void;
  onChatSelect?: (chatId: number) => void;
  // A oferta é do pai: aqui só avisamos que ela deve abrir. O dono da
  // navegação é o hook, que registra a etapa na URL.
  onPitch?: (chatId?: number) => void;
}

interface Conversation {
  id: number;
  name: string;
  username: string;
  lastMessage: string;
  /** Rabo borrado da prévia: fica à vista, ilegível — é o que a oferta vende. */
  trechoOculto?: string;
  timestamp: string;
  avatar: string | null;
  unreadCount: number;
  isOnline: boolean;
  /** Mensagem que acabou de chegar, na frente do lead. */
  aoVivo?: boolean;
  /** O contato está digitando agora. */
  digitando?: boolean;
}

interface Follower {
  pk: string;
  id: string;
  username: string;
  full_name: string;
  profile_pic_url: string;
  is_private: boolean;
  is_verified: boolean;
}

interface RelatedProfile {
  pk: string;
  username: string;
  full_name: string;
  profile_pic_url: string;
}

export default function InstagramDirect({
  username,
  onBack,
  onChatSelect,
  onPitch,
}: InstagramDirectProps) {
  const [showBlockedToast, setShowBlockedToast] = useState(false);
  const [blockedChatIdForPitch, setBlockedChatIdForPitch] = useState<
    number | null
  >(null);
  const [followers, setFollowers] = useState<Follower[]>([]);
  const [unlockedConversationsData, setUnlockedConversationsData] = useState<
    RelatedProfile[]
  >([]);
  const [searchedUsername, setSearchedUsername] = useState<string>("");
  const [activeNav, setActiveNav] = useState<
    "updates" | "calls" | "communities" | "chats" | "you"
  >("chats");
  const [showScrollOffer, setShowScrollOffer] = useState(false);

  // Relógio único da prévia. Vem do hook para continuar correndo quando o
  // lead entra numa conversa: era por aí que ele escapava do cronômetro.
  const { inicio, decorrido, restante, expirada } = usePrevia();

  // O que já chegou ao vivo na conversa descriptografada, derivado do relógio
  // em vez de guardado em estado: assim a lista e a tela de conversa contam
  // a mesma história, mesmo depois de ir e voltar.
  const eventos = eventosAte(decorrido);
  const ultimoEvento = eventos[eventos.length - 1];
  const digitando = digitandoAgora(decorrido);
  const contatoNovoChegou = decorrido >= NOVO_CONTATO_EM;

  // Só anima a entrada do que chegou DEPOIS desta montagem. Voltar de um
  // chat não pode fazer a mensagem "chegar de novo".
  const montadoEm = useRef(Date.now());
  const animarContatoNovo =
    inicio + NOVO_CONTATO_EM * 1000 > montadoEm.current;
  // Âncora na antepenúltima conversa: chegar nela convida a assinar
  const cortePreviaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // A lista precisa existir mesmo quando a tela é aberta direto pela URL
    // (?etapa=direct), sem passar pela etapa de análise.
    garantirPerfisDemo();

    const storedFollowers = localStorage.getItem("followers");
    const storedUnlockedConversations = localStorage.getItem(
      "unlockedConversations"
    );
    const storedUsername = localStorage.getItem("searchedUsername");

    if (storedFollowers) {
      setFollowers(JSON.parse(storedFollowers));
    }
    if (storedUnlockedConversations) {
      setUnlockedConversationsData(JSON.parse(storedUnlockedConversations));
    }
    if (storedUsername) {
      setSearchedUsername(storedUsername);
    }
  }, [username]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Contato novo que entra na lista durante a prévia. Abre como qualquer
  // outra, velada. O id precisa caber em TOTAL_CONVERSAS (ver
  // acessoConversas.ts), senão a navegação devolve a pessoa para a lista.
  const newIncomingConversation: Conversation | null = contatoNovoChegou
    ? {
        id: 9,
        name: "Maria Silva",
        username: "maria.silva",
        lastMessage: "foi ótimo te ver hoje",
        timestamp: horarioDoEvento(inicio, {
          em: NOVO_CONTATO_EM,
          digitandoDe: NOVO_CONTATO_EM,
          tipo: "texto",
        }),
        avatar: null,
        unreadCount: 1,
        isOnline: true,
      }
    : null;

  // Rolar até o fim da lista não encerra a prévia — quem corta é o relógio —,
  // mas troca o banner pelo convite, que a partir daqui é a única saída da
  // tela. Em telas altas a âncora já nasce visível, por isso o convite só é
  // armado depois de um tempo mínimo de leitura.
  useEffect(() => {
    if (expirada || showScrollOffer) {
      return;
    }
    if (decorrido < MIN_LEITURA_SEGUNDOS) {
      return;
    }
    const alvo = cortePreviaRef.current;
    if (!alvo) return;

    const obs = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) {
          setShowScrollOffer(true);
          obs.disconnect();
        }
      },
      { threshold: 0.6 }
    );
    obs.observe(alvo);
    return () => obs.disconnect();
  }, [expirada, showScrollOffer, decorrido]);

  // Transform profiles into conversations format
  const conversations: Conversation[] = Array.from({ length: 8 }).map(
    (_, index) => {
      const lastMessages = [
        "Oi, você já ch...",
        "e aí, tá por aí?",
        "preciso falar com você uma coisa séria",
        "lembra daquele dia lá em...",
        "olha o que eu comprei aqui 👀",
        "vazou tudo kkkk",
        "desculpa a demora eu tava...",
        "e aí, tá por aí?",
      ];

      // Formato real do WhatsApp: hora exata hoje, "Ontem", dia da semana
      // dentro dos últimos dias, e data completa para conversas mais antigas.
      const timestamps = [
        "14:32",
        "Ontem",
        "Terça-feira",
        "Segunda-feira",
        "Sábado",
        "22/10/2026",
        "19/10/2026",
        "15/10/2026",
      ];
      const unreadCounts = [1, 0, 3, 0, 2, 0, 1, 0];

      if (index < 4) {
        // As quatro primeiras têm roteiro escrito. Todas abrem; só a
        // primeira é legível (ver acessoConversas.ts).
        const profile = unlockedConversationsData[index];
        // prévia vem do mesmo objeto que a tela de conversa usa, para o que
        // a lista promete ser exatamente o que o chat mostra
        const previa = CHAT_PREVIEWS[index + 1];
        return {
          id: index + 1,
          name: profile?.full_name || "",
          username: profile?.username || "",
          lastMessage: previa
            ? `${previa.ultimaMensagem}${
                previa.trechoOculto ? " " + previa.trechoOculto : ""
              }`
            : lastMessages[index % lastMessages.length],
          timestamp: previa?.horario ?? timestamps[index % timestamps.length],
          avatar: profile?.profile_pic_url || null,
          unreadCount: previa?.naoLidas ?? unreadCounts[index % unreadCounts.length],
          isOnline: index % 3 === 0,
        };
      } else {
        // O resto da lista: contatos sem roteiro próprio. Abrem com uma
        // conversa gerada, que nasce borrada e nunca chega a ser lida.
        const follower = followers[index - 4];
        return {
          id: index + 1,
          name: follower?.full_name || "",
          username: follower?.username || "",
          lastMessage: lastMessages[index % lastMessages.length],
          timestamp: timestamps[index % timestamps.length],
          avatar: follower?.profile_pic_url || null,
          unreadCount: unreadCounts[index % unreadCounts.length],
          isOnline: index % 3 === 0,
        };
      }
    }
  );

  const blurStartIndex = conversations.findIndex(
    (conversation) => conversation.name === "Ana Costa"
  );

  // A conversa descriptografada é a única que se move durante a prévia: é
  // nela que a mensagem chega na frente do lead. O "digitando…" substitui a
  // prévia, como no app de verdade, e cada entrega soma uma não lida.
  const comAoVivo = (c: Conversation): Conversation => {
    if (c.id !== CONVERSA_LIBERADA) return c;
    if (!ultimoEvento) return digitando ? { ...c, digitando: true } : c;

    const previa = previaDoEvento(ultimoEvento);
    return {
      ...c,
      lastMessage: previa.legivel,
      trechoOculto: previa.oculto,
      timestamp: horarioDoEvento(inicio, ultimoEvento),
      unreadCount:
        (CHAT_PREVIEWS[CONVERSA_LIBERADA]?.naoLidas ?? 1) + eventos.length,
      aoVivo: true,
      digitando,
    };
  };

  // Quem acabou de receber mensagem vai para o topo — é o que o WhatsApp faz,
  // e é o que faz o lead ver que a coisa está acontecendo agora. A ordem sai
  // por CSS para não embaralhar os índices de que o véu da lista depende.
  const ordemDaLinha = (c: Conversation) => {
    if (c.id === CONVERSA_LIBERADA && ultimoEvento) return 10;
    return 30;
  };

  // Toda conversa abre. O que separa a liberada das outras é o que existe
  // dentro, não o toque: uma lista em que metade das linhas não responde ao
  // dedo deixa de parecer um aplicativo no primeiro toque.
  const handleChatSelectInternal = (chat: Conversation) => {
    localStorage.setItem("selectedChatName", chat.name);
    localStorage.setItem("selectedChatAvatar", chat.avatar || "");
    // Quem abre a conversa é o pai: é ele quem registra a etapa na URL.
    if (onChatSelect) {
      onChatSelect(chat.id);
    }
  };

  const handleNavClick = (
    nav: "updates" | "calls" | "communities" | "chats" | "you"
  ) => {
    setActiveNav(nav);
    if (nav !== "chats") {
      triggerUpsellToast();
    }
  };

  const triggerUpsellToast = () => {
    setBlockedChatIdForPitch(1);
    setShowBlockedToast(true);
    setTimeout(() => {
      setShowBlockedToast(false);
    }, 3000);
  };

  // A oferta é aberta pelo pai (que registra a etapa na URL). Quando a oferta
  // vem de uma conversa bloqueada, ela não tem chat de origem para o
  // "voltar" — só a lista.
  const origemDaOferta = () => {
    const id = blockedChatIdForPitch;
    return id && id <= 4 ? id : undefined;
  };

  // Saída única da prévia para o paywall, usada pelos banners e pelo
  // re-bloqueio. A trava evita empilhar duas navegações quando o lead toca na
  // tela durante o re-bloqueio, que já tem a sua própria contagem.
  const navegou = useRef(false);
  const goToPaywall = () => {
    if (navegou.current) return;
    navegou.current = true;
    setShowBlockedToast(false);
    setBlockedChatIdForPitch(null);
    if (onPitch) onPitch();
  };

  // Janela fechada: a criptografia volta por cima da tela e a oferta abre
  // sozinha. O modal com botão que havia aqui era mais uma decisão a tomar —
  // e cada decisão extra é tempo para o impulso esfriar.
  useEffect(() => {
    if (!expirada) return;
    setShowScrollOffer(false);
    const t = setTimeout(goToPaywall, LOCKDOWN_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expirada]);

  const navigateToPitchFromToast = () => {
    setShowBlockedToast(false);
    if (onPitch) onPitch(origemDaOferta());
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#D9DBD5" }}>
      <div className="max-w-[480px] mx-auto min-h-screen bg-white font-helvetica relative md:shadow-2xl">
        {/* Fim da janela: a criptografia volta na frente do lead e a oferta
            abre sozinha logo depois (ver efeito do re-bloqueio acima). */}
        <AnimatePresence>
          {expirada && <ReBloqueio key="re-bloqueio" onAgora={goToPaywall} />}
        </AnimatePresence>

        {/* A janela de acesso, não um aviso.
            Antes esta faixa só informava que havia conteúdo bloqueado — texto
            que o lead lê, concorda e esquece. Agora ela mostra o tempo
            escorrendo: é a mesma informação com relógio em cima, e é o relógio
            que transforma leitura em pressa. */}
        <div
          className="px-4 pt-3 pb-3 text-white relative overflow-hidden"
          style={{
            background: colors.gradients.dark,
            borderBottom: "1px solid rgba(245,158,11,0.3)",
          }}
        >
          <div className="flex items-center gap-2.5">
            <div className="relative flex-shrink-0">
              <motion.span
                animate={{ opacity: [1, 0.25, 1] }}
                transition={{ duration: 1.1, repeat: Infinity }}
                className="block w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: "#F87171" }}
              />
            </div>

            <div className="min-w-0 flex-1">
              {/* a cor vai no próprio <p>: globals.css força #4A4A4A no
                  elemento, e isso vence o text-white herdado do container */}
              <p className="text-[12.5px] font-extrabold leading-none tracking-wide text-white uppercase">
                Acesso aberto agora
              </p>
              <p className="text-[11.5px] leading-snug text-white/70 mt-1">
                Quando fechar, tudo volta a ser criptografado.
              </p>
            </div>

            <div className="flex-shrink-0 text-right tabular-nums">
              {/* A cor tem que ir no próprio <p>: globals.css aplica
                  p { color: #4A4A4A }, e regra no elemento vence cor herdada
                  do pai — era por isso que o contador saía cinza. */}
              <p
                className="text-[26px] font-extrabold leading-none"
                style={{ color: restante <= 10 ? "#FCA5A5" : "#FFFFFF" }}
              >
                0:{String(restante).padStart(2, "0")}
              </p>
            </div>
          </div>

          {/* A barra escorrendo faz o trabalho que o texto não faz: dá para
              ver a janela fechando sem precisar ler nada. */}
          <div
            className="h-[3px] w-full rounded-full overflow-hidden mt-2.5 mb-2.5"
            style={{ backgroundColor: "rgba(255,255,255,0.14)" }}
          >
            <div
              className="h-full rounded-full transition-[width] duration-300 ease-linear"
              style={{
                width: `${(restante / PREVIA_SEGUNDOS) * 100}%`,
                backgroundColor: restante <= 10 ? "#EF4444" : colors.primaryBright,
              }}
            />
          </div>

          <button
            onClick={goToPaywall}
            className="w-full flex items-center justify-center gap-1 py-2.5 rounded-full text-[13.5px] font-bold active:scale-[0.98] transition-all shadow-sm"
            style={{
              backgroundColor: colors.primaryBright,
              color: "#06302B",
            }}
          >
            <span>Manter o acesso aberto</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

      {/* Linha de ícones do topo, no padrão real do app */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1 bg-white">
        <button
          onClick={triggerUpsellToast}
          aria-label="Mais opções"
          className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0"
        >
          <MoreVertical className="w-5 h-5" color="#54656F" strokeWidth={1.8} />
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={triggerUpsellToast}
            aria-label="Câmera"
            className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0"
          >
            <Camera className="w-[18px] h-[18px]" color="#111B21" strokeWidth={1.8} />
          </button>
          <button
            onClick={goToPaywall}
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: "#25D366" }}
            aria-label="Nova conversa"
          >
            <Plus className="w-5 h-5 text-white" strokeWidth={2.5} />
          </button>
        </div>
      </div>

      <h1
        className="px-4 pt-1 pb-2"
        style={{
          fontFamily: "Helvetica Neue, Arial, sans-serif",
          fontSize: "32px",
          color: "#0B141A",
          fontWeight: 800,
          letterSpacing: "-0.5px",
        }}
      >
        Conversas
      </h1>

      <div className="px-4 pb-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Pergunte à Meta AI ou pesquise"
            className="w-full pl-10 pr-3 py-2.5 bg-gray-100 rounded-full text-sm font-helvetica search-input"
            style={{
              fontSize: "14px",
              color: "#262626",
              paddingLeft: "36px",
              paddingTop: "12px",
              paddingBottom: "12px",
              paddingRight: "12px",
            }}
          />
        </div>
      </div>

      {/* Chips de filtro, no padrão real do app */}
      <div className="flex items-center gap-2 px-4 pb-3 overflow-x-auto">
        {(
          [
            { key: "all", label: "Todas", count: null },
            { key: "unread", label: "Não lidas", count: 12 },
            { key: "favorites", label: "Favoritos", count: null },
            { key: "groups", label: "Grupos", count: 1 },
          ] as const
        ).map((chip) => {
          const isActive = chip.key === "all";
          return (
            <button
              key={chip.key}
              onClick={() => {
                if (!isActive) triggerUpsellToast();
              }}
              className="flex-shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors"
              style={{
                fontFamily: "Helvetica Neue, Arial, sans-serif",
                backgroundColor: isActive ? "#D7F4E8" : "#F0F2F5",
                color: isActive ? "#008069" : "#54656F",
              }}
            >
              {chip.label}
              {chip.count !== null && ` ${chip.count}`}
            </button>
          );
        })}
      </div>

      {/* Arquivadas */}
      <button
        onClick={triggerUpsellToast}
        className="w-full flex items-center px-4 py-3 border-y border-gray-100 active:bg-gray-50"
      >
        <Archive className="w-5 h-5 mr-4 flex-shrink-0" color="#54656F" />
        <span
          className="text-sm font-medium text-gray-700"
          style={{ fontFamily: "Helvetica Neue, Arial, sans-serif" }}
        >
          Arquivadas
        </span>
      </button>

      <div className="px-4 pb-56 flex flex-col">
        {/* Nova conversa chegando com animação */}
        <AnimatePresence>
          {newIncomingConversation && (
            <motion.div
              key={`new-${newIncomingConversation.id}`}
              initial={
                animarContatoNovo ? { opacity: 0, y: -20, x: -20 } : false
              }
              animate={{ opacity: 1, y: 0, x: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 35 }}
              role="button"
              tabIndex={0}
              style={{ order: ultimoEvento ? 20 : 5 }}
              className="flex items-center py-3 cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition-colors duration-150"
              onClick={() => handleChatSelectInternal(newIncomingConversation)}
            >
              <div className="relative mr-3">
                <DefaultAvatar nome={newIncomingConversation.name} />
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 rounded-full border-2 border-white"
                />
              </div>

              <div className="flex-1 min-w-0">
                <h3
                  className="text-sm font-semibold text-gray-800 truncate blur-sm select-none"
                  style={{
                    fontFamily: "Helvetica Neue, Arial, sans-serif",
                    fontSize: "15px",
                  }}
                >
                  {newIncomingConversation.name}
                </h3>
                <p
                  className="text-sm truncate mr-2 blur-sm select-none"
                  style={{
                    fontFamily: "Helvetica Neue, Arial, sans-serif",
                    fontSize: "13px",
                    color: "#8E8E8E",
                    fontWeight: "400",
                  }}
                >
                  {newIncomingConversation.lastMessage}
                </p>
              </div>

              <div className="flex flex-col items-end gap-1 ml-3 flex-shrink-0">
                <div className="flex items-center gap-1.5">
                  <span
                    className="text-xs"
                    style={{
                      fontFamily: "Helvetica Neue, Arial, sans-serif",
                      color: "#25D366",
                      fontWeight: 600,
                      fontSize: "12px",
                    }}
                  >
                    {newIncomingConversation.timestamp}
                  </span>
                </div>
                {newIncomingConversation.unreadCount > 0 && (
                  <div
                    className="min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: "#25D366" }}
                  >
                    <span className="text-[11px] font-bold text-white">
                      {newIncomingConversation.unreadCount}
                    </span>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Conversas normais */}
        {conversations.map(comAoVivo).map((conversation, index) => (
          <motion.div
            // A chave muda a cada entrega na conversa liberada: é o que
            // reacende o flash verde na linha, como quando chega mensagem de
            // verdade no celular.
            key={
              conversation.aoVivo
                ? `${conversation.id}-${eventos.length}`
                : conversation.id
            }
            ref={
              index === conversations.length - 3 ? cortePreviaRef : undefined
            }
            initial={
              conversation.aoVivo
                ? { backgroundColor: "rgba(37,211,102,0.22)" }
                : false
            }
            animate={{ backgroundColor: "rgba(255,255,255,0)" }}
            transition={{ duration: 1.6, ease: "easeOut" }}
            role="button"
            tabIndex={0}
            aria-label={`Conversa com ${conversation.name || "contato"}`}
            style={{ order: ordemDaLinha(conversation) + index }}
            className={`flex items-center py-3 cursor-pointer hover:bg-gray-50 active:bg-gray-100 ${
              blurStartIndex !== -1 && index >= blurStartIndex
                ? "blur-sm select-none"
                : ""
            } transition-colors duration-150`}
            onClick={() => handleChatSelectInternal(conversation)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleChatSelectInternal(conversation);
              }
            }}
          >
            <div className="relative mr-3">
              {conversation.avatar ? (
                <Image
                  src={conversation.avatar}
                  alt={conversation.name}
                  width={56}
                  height={56}
                  className="rounded-full object-cover blur-sm"
                />
              ) : (
                <DefaultAvatar
                  nome={conversation.name}
                />
              )}
            </div>

            <div className="flex-1 min-w-0">
              {/* O nome fica velado em todas: saber COM QUEM é justamente o
                  que a oferta vende. */}
              <h3
                className="text-sm font-semibold text-gray-800 truncate blur-sm select-none"
                style={{
                  fontFamily: "Helvetica Neue, Arial, sans-serif",
                  fontSize: "15px",
                }}
              >
                {conversation.name}
              </h3>

              <div className="flex items-center min-w-0">
                {/* "digitando…" vence a prévia, como no app real: é o sinal
                    mais forte de que tem alguém do outro lado AGORA. */}
                {conversation.digitando ? (
                  <p
                    className="text-sm truncate mr-2 italic"
                    style={{
                      fontFamily: "Helvetica Neue, Arial, sans-serif",
                      fontSize: "13px",
                      color: "#25D366",
                      fontWeight: 600,
                    }}
                  >
                    digitando…
                  </p>
                ) : (
                  <p
                    className={`text-sm truncate mr-2 ${
                      conversation.id === CONVERSA_LIBERADA
                        ? ""
                        : "blur-sm select-none"
                    }`}
                    style={{
                      fontFamily: "Helvetica Neue, Arial, sans-serif",
                      fontSize: "13px",
                      color: conversation.aoVivo ? "#111B21" : "#8E8E8E",
                      fontWeight: conversation.aoVivo ? 500 : 400,
                    }}
                  >
                    {conversation.lastMessage}
                    {/* O trecho oculto fica na mesma linha: o lead lê metade
                        da frase e o resto é exatamente o que ele vai comprar. */}
                    {conversation.trechoOculto && (
                      <span className="blur-sm select-none ml-1">
                        {conversation.trechoOculto}
                      </span>
                    )}
                  </p>
                )}
              </div>
            </div>

            {/* Coluna da direita: horário em cima, badge de não lidas embaixo,
                rente à direita — igual ao padrão real do WhatsApp */}
            {/* Sem cadeado por linha: o WhatsApp não tem essa coluna, e era
                o detalhe que mais denunciava a tela. Quem está trancado o
                borrão já diz. */}
            <div className="flex flex-col items-end gap-1 ml-3 flex-shrink-0">
              <div className="flex items-center gap-1.5">
                <span
                  className="text-xs"
                  style={{
                    fontFamily: "Helvetica Neue, Arial, sans-serif",
                    color: conversation.unreadCount > 0 ? "#25D366" : "#8E8E8E",
                    fontWeight: conversation.unreadCount > 0 ? 600 : 400,
                    fontSize: "12px",
                  }}
                >
                  {conversation.timestamp}
                </span>
              </div>
              {conversation.unreadCount > 0 && (
                <motion.div
                  key={`badge-${conversation.unreadCount}`}
                  initial={conversation.aoVivo ? { scale: 1.6 } : false}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 18 }}
                  className="min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: "#25D366" }}
                >
                  <span className="text-[11px] font-bold text-white">
                    {conversation.unreadCount}
                  </span>
                </motion.div>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Rodapé fixo: aviso de bloqueio e prévia empilhados sobre a navegação */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] z-40">
      {/* Convite ao chegar no fim da lista. O botão de dispensar saiu: era a
          porta por onde o lead voltava a navegar sem pressa, e navegar sem
          pressa é o que esta etapa não pode permitir. A prévia continua
          correndo atrás — o convite só deixa de ser a única saída. */}
      <AnimatePresence>
        {showScrollOffer && (
          <motion.div
            key="oferta-rolagem"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ type: "spring", stiffness: 360, damping: 32 }}
            className="px-3 pb-2"
          >
            <div
              className="rounded-2xl px-4 py-3.5 shadow-xl"
              style={{
                background: colors.gradients.dark,
                border: "1px solid rgba(245,158,11,0.3)",
              }}
            >
              <div className="flex items-start gap-2.5 mb-3">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ backgroundColor: "rgba(245,158,11,0.16)" }}
                >
                  <Lock
                    className="w-3.5 h-3.5"
                    style={{ color: "#F59E0B" }}
                    strokeWidth={2.5}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-bold leading-snug mb-0.5 text-white">
                    Chegou ao fim do que está aberto
                  </p>
                  <p className="text-[11.5px] leading-snug text-white/70">
                    Daqui para baixo são 2.184 mensagens, 37 áudios e tudo o que
                    foi apagado.
                  </p>
                  {restante > 0 && (
                    <p className="text-[11.5px] leading-snug text-white/70 mt-1 flex items-center gap-1">
                      <Clock className="w-3 h-3 flex-shrink-0" />
                      <span>
                        Fecha em{" "}
                        <span
                          className="font-bold tabular-nums"
                          style={{ color: colors.primaryBright }}
                        >
                          0:{String(restante).padStart(2, "0")}
                        </span>
                      </span>
                    </p>
                  )}
                </div>
              </div>

              <button
                onClick={goToPaywall}
                className="w-full flex items-center justify-center gap-0.5 py-2.5 rounded-full text-[13px] font-bold active:scale-[0.97] transition-all"
                style={{
                  backgroundColor: colors.primaryBright,
                  color: "#06302B",
                }}
              >
                <span>Liberar tudo agora</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showBlockedToast && (
          <motion.div
            key="toast-bloqueio"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.2 }}
            className="px-3 pb-2"
          >
            <div
              className="rounded-xl p-4 shadow-lg"
              style={{
                background: "linear-gradient(135deg, #DC2626 0%, #EF4444 100%)",
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                    <Lock className="w-4 h-4 text-white" strokeWidth={2.5} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-white text-sm font-semibold mb-0.5">
                      Obtenha a ferramenta completa
                    </p>
                    <p className="text-white/80 text-xs">
                      Você está vendo apenas 10% do que ela é capaz de fazer
                    </p>
                  </div>
                </div>
                <button
                  onClick={navigateToPitchFromToast}
                  className="bg-white/20 hover:bg-white/30 rounded-full p-2 ml-3 transition-colors flex-shrink-0"
                  aria-label="Ver mais"
                >
                  <ChevronRight className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* O relógio só aparece sozinho. Quando a pessoa chega ao fim da
          lista, a contagem migra para aquele cartão: os dois juntos diziam
          "acabou" e "ainda tem 0:23" na mesma tela. */}
      <AnimatePresence>
        {restante > 0 && !showScrollOffer && (
          <motion.div
            key="banner-previa"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="px-3 pb-2"
          >
            <div
              className="rounded-2xl px-4 py-3.5 shadow-xl"
              style={{
                background: colors.gradients.dark,
                border: "1px solid rgba(37, 211, 102, 0.35)",
              }}
            >
              <div className="flex items-center justify-center gap-1.5 mb-1.5">
                <Clock className="w-3.5 h-3.5 text-white/80" />
                <span
                  className="text-[13px] font-semibold text-white"
                  style={{ fontFamily: "Helvetica Neue, Arial, sans-serif" }}
                >
                  Acesso fecha em{" "}
                  <span
                    style={{
                      color: restante <= 10 ? "#FCA5A5" : colors.primaryBright,
                    }}
                    className="tabular-nums font-extrabold"
                  >
                    0:{String(restante).padStart(2, "0")}
                  </span>
                </span>
              </div>

              <p
                className="text-[12.5px] text-center text-white/70 leading-snug mb-2.5"
                style={{ fontFamily: "Helvetica Neue, Arial, sans-serif" }}
              >
                {digitando
                  ? "Tem mensagem sendo digitada agora. Não dá para ver sem acesso."
                  : "Quando o cronômetro zerar, tudo volta a ser criptografado."}
              </p>

              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={goToPaywall}
                className="w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-md"
                style={{
                  backgroundColor: colors.white,
                  color: colors.primaryDark,
                  fontFamily: "Helvetica Neue, Arial, sans-serif",
                }}
              >
                <Lock className="w-4 h-4" />
                Manter o acesso aberto
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Barra de navegação inferior, padrão real do app */}
      <div
        className="bg-white border-t border-gray-200 flex items-center px-1"
        style={{ paddingTop: "6px", paddingBottom: "env(safe-area-inset-bottom, 6px)" }}
      >
        {(
          [
            { key: "updates", label: "Atualizações", icon: CircleDot, badge: null, dot: true },
            { key: "calls", label: "Ligações", icon: Phone, badge: 22, dot: false },
            { key: "communities", label: "Comunidades", icon: Users, badge: null, dot: false },
            { key: "chats", label: "Conversas", icon: MessagesSquare, badge: 12, dot: false },
            { key: "you", label: "Você", icon: User, badge: null, dot: false },
          ] as const
        ).map((item) => {
          const isActive = activeNav === item.key;
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              onClick={() => handleNavClick(item.key)}
              className="flex flex-col items-center flex-1 min-w-0 py-1"
            >
              <div
                className="flex flex-col items-center gap-0.5 px-1.5 py-1 rounded-xl max-w-full"
                style={{ backgroundColor: isActive ? "#F0F2F5" : "transparent" }}
              >
                <div className="relative flex-shrink-0">
                  {item.key === "you" ? (
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center overflow-hidden relative"
                      style={{ backgroundColor: `${colors.primary}20` }}
                    >
                      <User className="w-3.5 h-3.5" style={{ color: colors.primary }} />
                      <span
                        className="absolute bottom-0 right-0 w-1.5 h-1.5 rounded-full border border-white"
                        style={{ backgroundColor: "#25D366" }}
                      />
                    </div>
                  ) : (
                    <Icon
                      className="w-5 h-5"
                      color={isActive ? "#008069" : "#54656F"}
                      strokeWidth={isActive ? 2.2 : 1.8}
                    />
                  )}
                  {item.dot && (
                    <span
                      className="absolute top-0 right-0 w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: "#25D366" }}
                    />
                  )}
                  {item.badge !== null && (
                    <span
                      className="absolute -top-1.5 -right-2.5 min-w-[15px] h-[15px] px-0.5 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                      style={{ backgroundColor: "#25D366" }}
                    >
                      {item.badge}
                    </span>
                  )}
                </div>
                <span
                  className="text-[9.5px] font-medium whitespace-nowrap"
                  style={{
                    fontFamily: "Helvetica Neue, Arial, sans-serif",
                    color: isActive ? "#008069" : "#54656F",
                    fontWeight: isActive ? 700 : 500,
                  }}
                >
                  {item.label}
                </span>
              </div>
            </button>
          );
        })}
        </div>
      </div>
      </div>
    </div>
  );
}
