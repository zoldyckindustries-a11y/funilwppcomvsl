import { useState, useEffect, useCallback, useRef } from "react";
import { getUserLocation, LocationData } from "../app/services/locationService";
import {
  CHAT_PARAM,
  ETAPA_PARAM,
  garantirIndiceNav,
  indiceNavAtual,
  lerParam,
  voltar,
  escreverParams,
} from "../lib/urlState";
import { conversaExiste } from "../app/data/acessoConversas";

const formatPhoneNumber = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

const isValidBrazilianPhone = (value: string) => {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 10 && digits.length !== 11) return false;
  const ddd = parseInt(digits.slice(0, 2), 10);
  if (ddd < 11 || ddd > 99) return false;
  if (digits.length === 11 && digits[2] !== "9") return false;
  return true;
};

export type NavigationScreen =
  | "intro"
  | "home"
  | "search"
  | "modal"
  | "loading"
  | "direct"
  | "chat"
  | "pitch";

const SCREENS: NavigationScreen[] = [
  "intro",
  "home",
  "search",
  "modal",
  "loading",
  "direct",
  "chat",
  "pitch",
];

// Etapas das quais o lead não sai sem passar pela oferta de retorno. São as
// posteriores à análise: até ali ele ainda está decidindo se entra; daqui em
// diante já viu a prova e sair é desistir.
const TELAS_COM_RETENCAO: NavigationScreen[] = ["direct", "chat", "pitch"];

const BACK_REDIRECT_URL = "/back-redirect";
// Uma vez só por sessão. Insistir a cada "voltar" prende a pessoa na página,
// irrita e ainda é bloqueado por navegador moderno.
const CHAVE_BACK_REDIRECT = "backRedirectUsado";

// Quantas vezes o "voltar" é engolido antes de a oferta de retorno aparecer.
//
// Com uma só, qualquer toque sem querer — e o gesto de voltar do Android é
// a borda da tela inteira — jogava o lead numa página de ameaça que ele não
// pediu. A primeira volta agora só trava: o histórico é reposto e ele
// continua onde estava, sem nada na tela. Quem insiste está querendo sair de
// verdade, e é esse que a oferta de retorno tenta recuperar.
const VOLTAS_ANTES_DA_OFERTA = 1;

// Janela em que a insistência conta como a mesma intenção. Passado isso, a
// contagem zera: um toque agora e outro três minutos depois são dois
// acidentes, não alguém tentando sair.
const JANELA_INSISTENCIA_MS = 30_000;

const CHAVE_VOLTAS = "voltasBloqueadas";
const CHAVE_ULTIMA_VOLTA = "ultimaVoltaEm";

interface UrlState {
  screen: NavigationScreen;
  chatId: number | null;
}

/** Lê a etapa atual da URL. Devolve null quando a URL não descreve uma etapa
 *  deste funil (ex.: etapas do quiz). */
function lerEstadoDaUrl(): UrlState | null {
  const etapa = lerParam(ETAPA_PARAM);
  if (!etapa) return null;
  if (!SCREENS.includes(etapa as NavigationScreen)) return null;

  const screen = etapa as NavigationScreen;
  const chatParam = lerParam(CHAT_PARAM);
  const chatId = chatParam ? Number(chatParam) : null;
  // Todas as conversas da lista abrem — só uma delas é legível. Quem decide
  // o que aparece dentro é o ChatIndividual, não a navegação.
  const chatValido = conversaExiste(chatId);

  if (screen === "chat") {
    return chatValido
      ? { screen, chatId }
      : { screen: "direct", chatId: null };
  }

  return { screen, chatId: chatValido ? chatId : null };
}

interface UseNavigationOptions {
  // Telefone já capturado em um funil anterior (ex: quiz) — pula a digitação e
  // dispara a busca automaticamente
  initialPhone?: string;
  // Pula a animação de abertura, útil quando o usuário já veio de outra etapa
  skipIntro?: boolean;
}

export function useNavigation(options: UseNavigationOptions = {}) {
  const { initialPhone, skipIntro } = options;
  const hasInitialPhone = !!initialPhone && isValidBrazilianPhone(initialPhone);

  const telaInicial: NavigationScreen = hasInitialPhone
    ? "search"
    : skipIntro
      ? "home"
      : "intro";
  const telaInicialRef = useRef<NavigationScreen>(telaInicial);

  const [screen, setScreen] = useState<NavigationScreen>(telaInicial);
  const [selectedChatId, setSelectedChatId] = useState<number | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const [instagramHandle, setInstagramHandle] = useState(
    hasInitialPhone ? formatPhoneNumber(initialPhone as string) : ""
  );
  const [targetName, setTargetName] = useState<string>("");
  const [userHasTyped, setUserHasTyped] = useState(false);
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
  // Dois estados diferentes de propósito:
  //
  // `isSearching` é a tela de busca: vale do clique até a troca de tela, e é
  // o que trava o botão. Dura o piso de 3,9s, sempre.
  //
  // `isFetchingProfileImage` é só a consulta da foto, que agora pode
  // continuar em voo depois de o modal abrir. Enquanto estava tudo no mesmo
  // estado, uma foto que respondia em 1s destravava o botão no meio da tela
  // de busca e deixava a pessoa clicar "AVANÇAR" de novo.
  const [isSearching, setIsSearching] = useState(false);
  const [isFetchingProfileImage, setIsFetchingProfileImage] = useState(false);
  const [fullName, setFullName] = useState<string | undefined>(undefined);
  const [bio, setBio] = useState<string | undefined>(undefined);
  const [userLocation, setUserLocation] = useState<LocationData | undefined>(
    undefined
  );
  const [isFetchingLocation, setIsFetchingLocation] = useState(false);
  const [userPk, setUserPk] = useState<string | undefined>(undefined);
  const [hasPerformedSearch, setHasPerformedSearch] = useState<boolean>(false);

  // Timer de transição e token da busca em andamento: um "voltar" durante a
  // busca não pode deixar a requisição velha empurrar a pessoa para a
  // próxima tela depois de ela já ter mudado de lugar.
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTokenRef = useRef(0);
  const autoSearchRef = useRef(false);

  // Etapa atual em ref: o ouvinte de popstate é registrado uma vez só, e um
  // valor preso no closure faria a retenção ler sempre a etapa inicial.
  const screenRef = useRef<NavigationScreen>(telaInicial);
  // A conversa aberta também em ref: quando a trava repõe a URL, ela precisa
  // devolver ?chat=N junto com a etapa, senão a volta seguinte abre a lista.
  const chatIdRef = useRef<number | null>(null);

  const applyScreen = useCallback(
    (next: NavigationScreen, chatId: number | null) => {
      screenRef.current = next;
      chatIdRef.current = next === "chat" ? chatId : null;
      setScreen(next);
      setSelectedChatId(next === "chat" ? chatId : null);
      setIsTransitioning(false);
    },
    []
  );

  /**
   * Trata o "voltar" nas telas de retenção.
   *
   * Devolve true quando a volta foi tratada aqui (travada ou levada para a
   * oferta) e o fluxo normal não deve continuar.
   *
   * As primeiras voltas são engolidas em silêncio: repõe-se a entrada no
   * histórico e a pessoa fica onde está. É o "trava e não deixa voltar"
   * clássico, que resolve o toque sem querer. Só quem insiste dentro da
   * janela vê a oferta de retorno — e ela aparece uma vez por sessão.
   */
  const ofertarRetorno = useCallback((atual: NavigationScreen) => {
    if (typeof window === "undefined") return false;
    if (sessionStorage.getItem(CHAVE_BACK_REDIRECT) === "1") return false;

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
      // Trava: devolve a entrada que o navegador acabou de consumir. A etapa
      // vai escrita à mão porque o popstate já trocou a URL para a anterior —
      // sem isso a barra de endereço diria uma tela e o React mostraria outra.
      escreverParams(
        {
          [ETAPA_PARAM]: atual,
          [CHAT_PARAM]: atual === "chat" ? chatIdRef.current : null,
        },
        "push"
      );
      return true;
    }

    sessionStorage.setItem(CHAVE_BACK_REDIRECT, "1");
    window.location.href = BACK_REDIRECT_URL;
    return true;
  }, []);

  // A URL é a fonte da verdade da navegação: no mount ela diz em que etapa
  // estamos (link direto cai no lugar certo) e no popstate o botão voltar
  // do navegador devolve a tela anterior.
  useEffect(() => {
    garantirIndiceNav();

    const doUrl = lerEstadoDaUrl();
    if (doUrl) {
      applyScreen(doUrl.screen, doUrl.chatId);
    } else if (lerParam(ETAPA_PARAM) === null) {
      // Primeira visita: registra a etapa inicial sem criar histórico.
      escreverParams({ [ETAPA_PARAM]: telaInicialRef.current }, "replace");
    }

    const aoVoltar = () => {
      searchTokenRef.current += 1;
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
        transitionTimerRef.current = null;
      }

      // O token acabou de ser invalidado, então o `finally` da busca em voo
      // vai ignorar o próprio desligamento dos spinners — e sem isto o botão
      // AVANÇAR ficava preso em "Localizando...", desabilitado, para sempre:
      // bastava voltar para a tela inicial durante a busca e tentar de novo.
      setIsSearching(false);
      setIsFetchingProfileImage(false);
      setIsFetchingLocation(false);

      const atual = screenRef.current;
      const proximo = lerEstadoDaUrl();

      // Passada a análise, o funil só anda para a frente. A única volta que
      // continua fazendo sentido é sair de uma conversa para a lista — é o
      // gesto que a pessoa usa para abrir outra, não para desistir.
      //
      // Todo o resto (voltar da oferta, voltar da lista, voltar de uma
      // conversa aberta por link direto) é abandono, e abandono passa pela
      // recuperação. Depois de oferecida uma vez, o caminho volta ao normal:
      // insistir prende a pessoa na página e irrita.
      if (TELAS_COM_RETENCAO.includes(atual)) {
        const voltaInterna = atual === "chat" && proximo?.screen === "direct";
        if (!voltaInterna && ofertarRetorno(atual)) return;
      }

      if (!proximo) return;
      applyScreen(proximo.screen, proximo.chatId);
    };

    window.addEventListener("popstate", aoVoltar);
    return () => window.removeEventListener("popstate", aoVoltar);
  }, [applyScreen, ofertarRetorno]);

  // Link direto para uma etapa de retenção (?etapa=pitch numa aba nova) não
  // tem histórico interno: o "voltar" sairia do site sem disparar popstate e
  // a recuperação nunca rodaria. Uma entrada extra dá o que consumir.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!TELAS_COM_RETENCAO.includes(screen)) return;
    if (indiceNavAtual() > 0) return;
    escreverParams({}, "push");
  }, [screen]);

  const navigateTo = useCallback(
    (
      next: NavigationScreen,
      options?: {
        delay?: number;
        chatId?: number | null;
        mode?: "push" | "replace";
      }
    ) => {
      const { delay = 0, chatId = null, mode = "push" } = options || {};

      const run = () => {
        applyScreen(next, chatId);
        escreverParams(
          {
            [ETAPA_PARAM]: next,
            [CHAT_PARAM]:
              next === "chat" || next === "pitch" ? chatId : null,
          },
          mode
        );
      };

      if (delay > 0) {
        setIsTransitioning(true);
        if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
        transitionTimerRef.current = setTimeout(run, delay);
      } else {
        run();
      }
    },
    [applyScreen]
  );

  // Load hasPerformedSearch from localStorage on component mount
  useEffect(() => {
    const storedSearchStatus = localStorage.getItem("hasPerformedSearch");
    if (storedSearchStatus === "true") {
      setHasPerformedSearch(true);
    }
  }, []);

  const handleIntroComplete = () => navigateTo("home", { mode: "replace" });
  const handleTestClick = () => navigateTo("search", { delay: 300 });

  const handleSearch = useCallback(async () => {
    if (!isValidBrazilianPhone(instagramHandle)) return;
    const token = ++searchTokenRef.current;
    // A pessoa pode ter voltado durante a busca: uma resposta velha não pode
    // mais mexer na tela nem empurrar o fluxo para a frente.
    const aindaVale = () => searchTokenRef.current === token;

    setIsSearching(true);
    setIsFetchingProfileImage(true);
    setIsFetchingLocation(true);

    // Nova busca, alvo novo: a foto do anterior não pode sobrar na tela nem
    // no localStorage enquanto a consulta está em voo. Antes a limpeza vinha
    // junto com a gravação do resultado, no fim — e até lá o modal podia
    // abrir mostrando a cara do número buscado na tentativa passada.
    setProfileImageUrl(null);

    try {
      // Store the searched phone number in localStorage
      localStorage.setItem("searchedUsername", instagramHandle.trim());
      // nome do alvo também persiste: outras rotas (ex. back-redirect)
      // recarregam a página e perdem o estado do React
      localStorage.setItem("targetName", targetName.trim());
      localStorage.removeItem("userProfilePic");
      // Nova busca, nova prévia: descarta o relógio da anterior
      localStorage.removeItem("previewStartedAt");

      // Marca o início para que o tempo de tela seja um piso, e não a soma
      // das esperas (ver o cálculo do atraso no fim desta função).
      const buscaIniciadaEm = Date.now();

      // Dados fixos do alvo: não dependem de rede, então entram já. Deixá-los
      // depois do `await` da foto só atrasava o que estava pronto.
      setFullName("Contato Demo");
      setBio("Vulnerabilidade detectada no backup");
      setUserPk("1234567890");
      localStorage.setItem("userId", "1234567890");
      localStorage.setItem("isPrivate", "false");

      // --- As duas consultas saem juntas e NENHUMA bloqueia a navegação ---
      //
      // Este era o nó do atraso. O código antigo fazia `await` na foto e
      // depois `await` na localização ANTES de calcular o piso, então o piso
      // de 3,9s só valia quando as consultas eram rápidas: o tempo real da
      // tela era `max(API, 3,9s)`.
      //
      // E as duas APIs têm cauda longa de verdade:
      //   - a foto do WhatsApp leva 15s a 20s quando o número não tem foto;
      //   - `getUserLocation` encadeia TRÊS provedores de 5s cada, ou seja,
      //     até 15s quando o ipapi.co está limitando por IP (o que acontece
      //     direto).
      // Somadas, davam uma tela de busca travada em "Localizando..." por
      // mais de 30s no pior caso.
      //
      // Agora a tela de busca dura o piso e só o piso. O que chegar depois
      // entra na tela por cima, que é exatamente o que o modal já sabe
      // mostrar: ele tem spinner para a foto e para a cidade.

      // O catch vai junto na criação da promise porque uma promise rejeitada
      // que fica esperando para ser aguardada provoca unhandledrejection.
      const fotoPromise = (async (): Promise<string> => {
        try {
          const res = await fetch("/api/whatsapp-profile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phone: instagramHandle }),
          });
          // 502 = a rota não conseguiu saber (rede/timeout no upstream);
          // 200 com picture null = o número não tem foto. Nos dois casos o
          // avatar padrão resolve.
          if (!res.ok) return "";
          const json = await res.json();
          return typeof json?.picture === "string" ? json.picture : "";
        } catch (picError) {
          console.error("Error fetching WhatsApp profile picture:", picError);
          return "";
        }
      })();

      fotoPromise.then((foto) => {
        if (!aindaVale()) return;
        setIsFetchingProfileImage(false);
        if (!foto) return;
        setProfileImageUrl(foto);
        localStorage.setItem("userProfilePic", foto);
        // A oferta lê a foto do localStorage no mount. Quando ela chega
        // depois de a tela já ter trocado — o atalho de "já buscou" pula
        // direto do modal para o pitch —, só o evento a faz aparecer.
        window.dispatchEvent(
          new CustomEvent("updatePitchFoto", { detail: { foto } })
        );
      });

      const localizacaoPromise = getUserLocation().catch((locationError) => {
        console.error("Error getting location:", locationError);
        return null;
      });

      localizacaoPromise.then((location) => {
        if (!aindaVale()) return;
        setIsFetchingLocation(false);
        if (location) setUserLocation(location);
      });

      // Atraso proposital: uma consulta que volta rápido demais não convence.
      //
      // É um PISO de duração, e agora de verdade: nada mais é aguardado antes
      // dele, então a tela de busca dura 3,9s sempre, independente de como as
      // APIs se comportem.
      const DURACAO_MINIMA_MS = 3900;
      const restante = DURACAO_MINIMA_MS - (Date.now() - buscaIniciadaEm);
      if (restante > 0) {
        await new Promise((resolve) => setTimeout(resolve, restante));
      }

      if (!aindaVale()) return;

      // Os spinners morrem aqui, mesmo com consulta em voo.
      //
      // Enquanto eles dependiam só da resposta, um número cuja foto a API não
      // consegue ler deixava o modal girando por mais 8s depois de abrir — e
      // girar é pior que o avatar padrão, porque promete uma foto que não vem.
      // As duas promises continuam vivas: se a foto chegar atrasada, ela
      // aparece por cima do avatar.
      setIsFetchingProfileImage(false);
      setIsFetchingLocation(false);

      navigateTo("modal");
    } catch (error) {
      console.error("Error fetching profile image:", error);
      if (!aindaVale()) return;
      setProfileImageUrl(null);
      setFullName(undefined);
      setBio(undefined);
      setUserPk(undefined);
      setIsFetchingProfileImage(false);
      setIsFetchingLocation(false);
    } finally {
      // Só o botão de busca para de girar aqui. Os dois spinners do modal
      // são desligados por cada consulta quando ela responde, senão a tela
      // afirmaria "não tem foto" com a consulta ainda em voo.
      if (aindaVale()) setIsSearching(false);
    }
  }, [instagramHandle, targetName, navigateTo]);

  // Se um telefone já veio pronto de outra etapa (ex: quiz), dispara a busca
  // sozinho assim que a tela de busca entra.
  useEffect(() => {
    if (!hasInitialPhone) return;
    if (screen !== "search" || autoSearchRef.current) return;
    // A marcação de "já buscou" vai dentro do timer: em modo estrito o
    // React executa o efeito duas vezes, e marcar antes cancelaria a busca
    // na segunda vez.
    const t = setTimeout(() => {
      autoSearchRef.current = true;
      handleSearch();
    }, 700);
    return () => clearTimeout(t);
  }, [hasInitialPhone, screen, handleSearch]);

  const handleModalConfirm = async () => {
    try {
      // The data is already stored in localStorage from handleSearch
      setHasPerformedSearch(true);
      localStorage.setItem("hasPerformedSearch", "true");
      // Fluxo: modal -> loading (quebra da criptografia) -> direct -> pitch.
      // "replace" em vez de "push": a etapa dura ~31s, e voltar para ela pelo
      // histórico prenderia a pessoa numa tela que empurra adiante sozinha.
      navigateTo("loading", { mode: "replace" });
    } catch (error) {
      console.error("Error storing user data:", error);
      navigateTo("loading", { mode: "replace" });
    }
  };

  const handleModalCancel = () =>
    voltar(() => navigateTo("search", { mode: "replace" }));

  const handleLoadingComplete = async () => {
    navigateTo("direct", { mode: "replace" });
  };

  const handleBackFromDirect = () =>
    voltar(() => {
      setInstagramHandle("");
      setUserHasTyped(false);
      navigateTo("home", { mode: "replace" });
    });

  const handleChatSelect = (chatId: number) =>
    navigateTo("chat", { chatId, mode: "push" });

  const handleBackFromChat = () =>
    voltar(() => navigateTo("direct", { mode: "replace" }));

  const handlePitchPage = (chatId?: number) => {
    // O clique pode chegar como evento (o botão passa o evento adiante):
    // só um número serve como chat de origem.
    const origem = typeof chatId === "number" ? chatId : selectedChatId ?? null;

    // O username da oferta viaja com a própria tela: quem abre o pitch a
    // partir do Direct precisa que o número apareça lá.
    if (typeof window !== "undefined") {
      const searchedUsername = localStorage.getItem("searchedUsername");
      if (searchedUsername) {
        localStorage.setItem("pitchUsername", searchedUsername);
        window.dispatchEvent(
          new CustomEvent("updatePitchUsername", {
            detail: { username: searchedUsername },
          })
        );
      }
    }
    navigateTo("pitch", {
      chatId: origem,
      mode: "push",
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInstagramHandle(formatPhoneNumber(e.target.value));
    if (!userHasTyped && e.target.value.length > 0) {
      setUserHasTyped(true);
    }
  };

  const isPhoneValid = isValidBrazilianPhone(instagramHandle);

  const handleInputFocus = () => {
    if (!userHasTyped) {
      setUserHasTyped(true);
    }
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTargetName(e.target.value);
  };

  const isNameValid = targetName.trim().length > 0;

  const setSelectedChat = (chatId: number) => {
    setSelectedChatId(chatId);
  };

  return {
    // State
    // Etapa crua. Quem precisa reagir à tela atual — o prefetch dos chunks
    // das telas seguintes, por exemplo — não deveria ter que remontar o
    // nome a partir de sete booleanos.
    etapa: screen,
    showIntro: screen === "intro",
    showSearchCard: screen === "search",
    showModal: screen === "modal",
    showLoading: screen === "loading",
    showDirect: screen === "direct",
    showChat: screen === "chat",
    showPitch: screen === "pitch",
    isTransitioning,
    selectedChatId,
    instagramHandle,
    targetName,
    userHasTyped,
    profileImageUrl,
    isSearching,
    isFetchingProfileImage,
    fullName,
    bio,
    userLocation,
    isFetchingLocation,
    userPk,
    hasPerformedSearch,
    isPhoneValid,
    isNameValid,

    // Actions
    navigateTo,
    handleIntroComplete,
    handleTestClick,
    handleSearch,
    handleModalConfirm,
    handleModalCancel,
    handleLoadingComplete,
    handleBackFromDirect,
    handleChatSelect,
    handleBackFromChat,
    handlePitchPage,

    handleNameChange,
    handleInputChange,
    handleInputFocus,
    setSelectedChat,
  };
}
