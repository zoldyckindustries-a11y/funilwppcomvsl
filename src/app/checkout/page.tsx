"use client";

/**
 * Checkout transparente, em passos.
 *
 * Três telas curtas no lugar de uma longa. O motivo não é estética:
 * formulário inteiro à vista faz a pessoa medir o esforço antes de começar, e
 * é aí que ela desiste. Quebrado em passos, cada tela pede pouco, o avanço
 * fica visível na barra, e o custo percebido some.
 *
 *   1. Seus dados  — só o que a API exige: nome, e-mail e CPF
 *   2. Ofertas     — os order bumps, um a um
 *   3. Pagamento   — método, revisão e geração do PIX
 *   → PIX → Acesso liberado
 *
 * O mínimo do passo 1 foi confirmado na própria API: `customer.name`,
 * `customer.email` e `customer.document` são obrigatórios, e o documento é
 * validado de verdade (CPF com dígito errado volta `invalid_document`).
 * Telefone era opcional e saiu: campo a menos é conversão a mais.
 *
 * Animação é só `transform` e `opacity`, que a GPU resolve sem repintar
 * layout. Nada de animar sombra, filtro ou altura, que é o que trava a
 * rolagem em celular fraco. Quem pediu menos movimento no sistema
 * (`prefers-reduced-motion`) recebe a tela sem nada disso.
 *
 * O total continua sendo somado no SERVIDOR, pelo catálogo de lá.
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  Lock,
  ShieldCheck,
  Check,
  Copy,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCircle2,
  TriangleAlert,
  Mail,
  QrCode,
  BadgeCheck,
  Smartphone,
  Trash2,
  MessageCircle,
  type LucideIcon,
} from "lucide-react";
import {
  descontoPercentual,
  emReais,
  lerOferta,
  maiorDesconto,
  type Produto,
} from "@/lib/checkout/produtos";
import { useCheckoutUrl } from "@/lib/upsell";

type Etapa = "dados" | "ofertas" | "pagamento" | "pix" | "pago";

interface RespostaCobranca {
  id: string;
  status: string;
  total: number;
  pix: { payload: string | null; qr_base64: string | null; expires_at: string | null };
}

const FUNDO = "#F1F3F5";
const BORDA = "#E3E6EA";
const TEXTO = "#111B21";
const TEXTO_FRACO = "#6B7580";
const VERDE = "#00A868";
const VERDE_CLARO = "#E6F7EF";
const TEAL = "#128C7E";
const AMBAR = "#B45309";

/**
 * Proporção de compradores que ativa pelo menos um módulo.
 *
 * Fica aqui em cima para ser trocado quando os números reais da conta
 * disserem outra coisa — prova social que não acompanha a realidade é o tipo
 * de detalhe que o comprador pega e não esquece.
 */
const PROPORCAO_ATIVA = 68;

/** Prazo de retenção do relatório, em segundos. */
const RETENCAO_SEGUNDOS = 7 * 60;

const PASSO_DADOS = { chave: "dados" as Etapa, rotulo: "Seus dados" };
const PASSO_OFERTAS = { chave: "ofertas" as Etapa, rotulo: "Ofertas" };
const PASSO_PAGAMENTO = { chave: "pagamento" as Etapa, rotulo: "Pagamento" };

/**
 * A oferta de retorno não tem módulos, e por isso não tem o passo deles.
 * Mostrar um passo vazio seria pior do que não mostrar: o lead conta os
 * passos antes de começar.
 */
function passosDaOferta(temBumps: boolean) {
  return temBumps
    ? [PASSO_DADOS, PASSO_OFERTAS, PASSO_PAGAMENTO]
    : [PASSO_DADOS, PASSO_PAGAMENTO];
}

/** Segundos até o redirecionamento automático para o passo seguinte. */
const SEGUNDOS_ATE_UPSELL = 6;

/**
 * Onde ficam os dados de quem já comprou nesta origem.
 *
 * Serve para o upsell: a pessoa comprou há dois minutos, voltou para o mesmo
 * domínio e teria que digitar nome, e-mail e CPF de novo. Como o checkout do
 * upsell roda na MESMA origem da primeira compra, o localStorage atravessa —
 * e o segundo pedido vira dois toques.
 *
 * Fica só no navegador dela, nunca sai daqui, e some quando ela limpa o
 * navegador. É o dado que ela mesma acabou de digitar.
 */
const CHAVE_COMPRADOR = "compradorZapLens";

interface Comprador {
  nome: string;
  email: string;
  documento: string;
}

function lerComprador(): Comprador | null {
  try {
    const bruto = localStorage.getItem(CHAVE_COMPRADOR);
    if (!bruto) return null;
    const c = JSON.parse(bruto) as Partial<Comprador>;
    if (!c?.nome || !c?.email || !c?.documento) return null;
    return { nome: c.nome, email: c.email, documento: c.documento };
  } catch {
    return null;
  }
}

function mascararCpf(valor: string): string {
  const d = valor.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/**
 * CPF com conferência dos dígitos verificadores.
 *
 * A Lezty valida o documento do lado dela e devolve `invalid_document`. Sem
 * conferir aqui, a pessoa preenche tudo, atravessa dois passos e só descobre
 * o erro de digitação na hora de pagar — o pior momento possível.
 */
function cpfValido(valor: string): boolean {
  const d = valor.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;

  const digito = (ate: number) => {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(d[i]) * (ate + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return digito(9) === Number(d[9]) && digito(10) === Number(d[10]);
}

function emailValido(valor: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valor.trim());
}

function mmss(segundos: number): string {
  return `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, "0")}`;
}

/**
 * O QR serve para alguma coisa?
 *
 * A Lezty devolve `qr_base64` nulo quando a cobrança nasce `failed`, e no
 * ambiente de teste devolve um PNG de 1x1 pixel do adquirente falso. Esticar
 * 1 pixel para 200x200 vira um quadrado com cara de imagem quebrada, e isso
 * na tela de pagamento derruba a confiança na hora.
 */
function qrUtilizavel(base64: string | null): boolean {
  return !!base64 && base64.length > 200;
}

/**
 * O `useSearchParams` exige fronteira de Suspense no App Router: sem ela a
 * página inteira passa a ser renderizada sob demanda, e um checkout que
 * espera o servidor para aparecer é checkout que perde venda.
 */
export default function Checkout() {
  return (
    <Suspense fallback={<div className="min-h-screen" style={{ backgroundColor: FUNDO }} />}>
      <CheckoutInterno />
    </Suspense>
  );
}

function CheckoutInterno() {
  const semAnimacao = !!useReducedMotion();
  const params = useSearchParams();

  // Qual oferta está sendo vendida. O id vem da URL (?oferta=resgate), mas
  // quem o transforma em produto e preço é o catálogo — aqui e, de novo, no
  // servidor, que é quem cobra.
  const oferta = useMemo(() => lerOferta(params.get("oferta")), [params]);
  const produto = oferta.produto;
  const bumps = oferta.bumps;
  const temBumps = bumps.length > 0;

  const [etapa, setEtapa] = useState<Etapa>("dados");
  const [direcao, setDirecao] = useState(1);
  const [extras, setExtras] = useState<string[]>([]);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [cpf, setCpf] = useState("");
  const [tocados, setTocados] = useState<Record<string, boolean>>({});
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [cobranca, setCobranca] = useState<RespostaCobranca | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [restantePix, setRestantePix] = useState<number | null>(null);
  const [verificando, setVerificando] = useState(false);
  const [semConfirmacao, setSemConfirmacao] = useState(false);
  const [contagemUpsell, setContagemUpsell] = useState(SEGUNDOS_ATE_UPSELL);

  /**
   * Link do upsell já carimbado com a identificação do lead.
   *
   * O upsell roda em outro domínio e não enxerga o estado desta aplicação —
   * nome, telefone e cidade viajam na querystring, que é para isso que
   * `useCheckoutUrl` existe neste projeto.
   */
  const upsellBase = useCheckoutUrl(oferta.proximoPasso);
  const [retencao, setRetencao] = useState(RETENCAO_SEGUNDOS);
  const [alvo, setAlvo] = useState("");
  const [jaComprou, setJaComprou] = useState(false);

  const pedidoId = useRef<string>("");
  if (!pedidoId.current && typeof crypto !== "undefined") {
    pedidoId.current = crypto.randomUUID();
  }

  useEffect(() => {
    const numero = localStorage.getItem("searchedUsername");
    if (numero) setAlvo(numero);

    // Compra anterior na mesma origem: preenche e já abre no passo
    // seguinte. Pedir de novo o que a pessoa digitou há dois minutos é a
    // forma mais barata de perder um upsell.
    const comprador = lerComprador();
    if (!comprador) return;
    setNome(comprador.nome);
    setEmail(comprador.email);
    setCpf(comprador.documento);
    setJaComprou(true);
    setEtapa(temBumps ? "ofertas" : "pagamento");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Relógio da retenção. Corre nos três passos de compra; na tela do PIX quem
  // manda é o prazo do próprio código, e dois relógios competindo confundem.
  useEffect(() => {
    if (etapa === "pix" || etapa === "pago" || retencao <= 0) return;
    const t = setInterval(() => setRetencao((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [etapa, retencao]);

  const passos = useMemo(() => passosDaOferta(temBumps), [temBumps]);
  const marcados = useMemo(() => new Set(extras), [extras]);
  const itensExtras = bumps.filter((b) => marcados.has(b.id));
  const total = produto.preco + itensExtras.reduce((s, b) => s + b.preco, 0);
  const economia = itensExtras.reduce((s, b) => s + (b.precoDe - b.preco), 0);

  const alternarBump = (id: string) =>
    setExtras((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));

  const erroNome = nome.trim().length > 0 && nome.trim().split(/\s+/).length < 2;
  const erroEmail = email.trim().length > 0 && !emailValido(email);
  const erroCpf = cpf.replace(/\D/g, "").length === 11 && !cpfValido(cpf);

  const dadosOk =
    nome.trim().split(/\s+/).length >= 2 && emailValido(email) && cpfValido(cpf);

  const irPara = (proxima: Etapa, sentido: number) => {
    setDirecao(sentido);
    setEtapa(proxima);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const gerarPix = useCallback(async () => {
    setErro(null);
    setEnviando(true);
    try {
      const r = await fetch("/api/lezty/cobranca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome,
          email,
          documento: cpf,
          extras,
          oferta: oferta.id,
          pedidoId: pedidoId.current,
        }),
      });
      const json = await r.json();
      if (!r.ok) {
        setErro(json?.erro ?? "Não foi possível gerar o PIX.");
        return;
      }
      setCobranca(json as RespostaCobranca);
      setDirecao(1);
      setEtapa("pix");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setErro("Sem conexão. Verifique a internet e tente de novo.");
    } finally {
      setEnviando(false);
    }
  }, [nome, email, cpf, extras, oferta.id]);

  const avancar = () => {
    if (etapa === "dados") {
      setTocados({ nome: true, email: true, cpf: true });
      if (!dadosOk) return;
      // Sem módulos para oferecer, o passo do meio não existe.
      irPara(temBumps ? "ofertas" : "pagamento", 1);
      return;
    }
    if (etapa === "ofertas") {
      irPara("pagamento", 1);
      return;
    }
    if (etapa === "pagamento") void gerarPix();
  };

  const retroceder = () => {
    if (etapa === "ofertas") irPara("dados", -1);
    else if (etapa === "pagamento") irPara(temBumps ? "ofertas" : "dados", -1);
  };

  const consultar = useCallback(async (id: string) => {
    try {
      const r = await fetch(`/api/lezty/cobranca/${id}`, { cache: "no-store" });
      if (!r.ok) return;
      const json = (await r.json()) as { pago?: boolean };
      if (json.pago) {
        guardarComprador();
        setDirecao(1);
        setEtapa("pago");
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch {
      // Falha de rede numa consulta não muda nada: a próxima tenta de novo.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (etapa !== "pix" || !cobranca?.id) return;
    const t = setInterval(() => consultar(cobranca.id), 4000);
    return () => clearInterval(t);
  }, [etapa, cobranca?.id, consultar]);

  useEffect(() => {
    const prazo = cobranca?.pix.expires_at;
    if (etapa !== "pix" || !prazo) return;
    const fim = new Date(prazo).getTime();
    const tick = () => setRestantePix(Math.max(0, Math.floor((fim - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [etapa, cobranca?.pix.expires_at]);

  /**
   * Conferência manual do pagamento.
   *
   * A consulta automática já roda a cada 4 s, então o botão não acelera
   * nada tecnicamente. Ele existe porque esperar sem poder fazer nada é o
   * que faz a pessoa fechar a aba — e um botão que responde devolve a ela o
   * controle da situação.
   */
  const verificarAgora = async () => {
    if (!cobranca?.id || verificando) return;
    setVerificando(true);
    setSemConfirmacao(false);
    try {
      const r = await fetch(`/api/lezty/cobranca/${cobranca.id}`, { cache: "no-store" });
      const json = (await r.json()) as { pago?: boolean };
      if (json?.pago) {
        guardarComprador();
        setDirecao(1);
        setEtapa("pago");
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        setSemConfirmacao(true);
        setTimeout(() => setSemConfirmacao(false), 6000);
      }
    } catch {
      setSemConfirmacao(true);
      setTimeout(() => setSemConfirmacao(false), 6000);
    } finally {
      setVerificando(false);
    }
  };

  // Depois do pagamento, o comprador segue para a oferta seguinte. O
  // contador é visível e há botão para ir na hora: redirecionar sem avisar
  // faz a pessoa achar que a compra deu errado e voltar para conferir.
  const irParaUpsell = useCallback(() => {
    const url = new URL(upsellBase);
    if (cobranca?.id) url.searchParams.set("tx", cobranca.id);
    window.location.href = url.toString();
  }, [upsellBase, cobranca?.id]);

  useEffect(() => {
    if (etapa !== "pago") return;
    if (contagemUpsell <= 0) {
      irParaUpsell();
      return;
    }
    const t = setTimeout(() => setContagemUpsell((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [etapa, contagemUpsell, irParaUpsell]);

  /** Guarda os dados da compra para o próximo passo da esteira. */
  const guardarComprador = () => {
    try {
      localStorage.setItem(
        CHAVE_COMPRADOR,
        JSON.stringify({ nome, email, documento: cpf })
      );
    } catch {
      // Navegador sem armazenamento (aba anônima com restrição) não pode
      // derrubar a confirmação de uma compra que já aconteceu.
    }
  };

  const copiar = async () => {
    const codigo = cobranca?.pix.payload;
    if (!codigo) return;
    try {
      await navigator.clipboard.writeText(codigo);
    } catch {
      return;
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2400);
  };

  const indiceAtual =
    etapa === "pix" || etapa === "pago"
      ? passos.length - 1
      : passos.findIndex((p) => p.chave === etapa);

  const slide = semAnimacao
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, x: direcao * 26 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: direcao * -26 },
      };

  const transicao = { duration: 0.26, ease: "easeOut" as const };
  const mostraCompra = etapa === "dados" || etapa === "ofertas" || etapa === "pagamento";

  return (
    <div className="min-h-screen" style={{ backgroundColor: FUNDO, color: TEXTO }}>
      {/* Cabeçalho branco, no formato dos checkouts em que este público já
          comprou: marca à esquerda, selo discreto à direita.
          A faixa verde-escura que ficava aqui dizia "é seguro" uma terceira
          vez — o selo abaixo do botão e os quatro do rodapé já diziam —, e
          repetir isso soa como quem precisa convencer. Um cadeado pequeno,
          bem colocado, passa mais confiança do que uma tarja. */}
      <header className="w-full bg-white" style={{ borderBottom: `1px solid ${BORDA}` }}>
        <div className="max-w-[560px] mx-auto px-4 h-[54px] flex items-center gap-3">
          {mostraCompra && etapa !== "dados" ? (
            <button
              type="button"
              onClick={retroceder}
              aria-label="Voltar um passo"
              className="p-1 -ml-1 flex-shrink-0"
              style={{ color: TEXTO_FRACO }}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          ) : (
            <Link
              href="/?etapa=pitch"
              aria-label="Voltar para a análise"
              className="p-1 -ml-1 flex-shrink-0"
              style={{ color: TEXTO_FRACO }}
            >
              <ChevronLeft className="w-5 h-5" />
            </Link>
          )}

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" aria-hidden className="h-8 w-auto flex-shrink-0" />

          <span
            className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg flex-shrink-0"
            style={{ backgroundColor: VERDE_CLARO }}
          >
            <Lock className="w-3.5 h-3.5 flex-shrink-0" style={{ color: VERDE }} />
            <span className="text-[11px] font-bold" style={{ color: "#0B6B48" }}>
              Compra segura
            </span>
          </span>
        </div>
      </header>

      {mostraCompra && <FaixaRetencao segundos={retencao} semAnimacao={semAnimacao} />}

      <div className="max-w-[560px] mx-auto px-4 pt-4 pb-44">
        <Passos passos={passos} indice={indiceAtual} concluido={etapa === "pago"} />

        <AnimatePresence mode="wait" initial={false}>
          {/* ─────────── PASSO 1 ─────────── */}
          {etapa === "dados" && (
            <motion.div key="dados" {...slide} transition={transicao} className="space-y-3">
              <Cartao>
                <div className="flex items-center gap-3.5">
                  {/* 72px: a 46 a arte virava um selo ilegível, e é ela que
                      diz ao lead que ele está comprando a coisa certa. */}
                  <Miniatura produto={produto} tamanho={72} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-bold leading-tight">
                      {produto.nome}
                    </p>
                    <p
                      className="text-[12px] leading-snug mt-1"
                      style={{ color: TEXTO_FRACO }}
                    >
                      {alvo ? `WhatsApp de ${alvo}` : "Acesso completo"}
                    </p>
                    <p className="flex items-baseline gap-2 mt-1.5">
                      <span
                        className="text-[12px] line-through"
                        style={{ color: "#9AA4AD" }}
                      >
                        {emReais(produto.precoDe)}
                      </span>
                      <span className="text-[17px] font-extrabold" style={{ color: TEAL }}>
                        {emReais(produto.preco)}
                      </span>
                    </p>
                  </div>
                </div>
              </Cartao>

              <Cartao titulo="Seus dados" numero={1}>
                <div className="space-y-3">
                  <Campo
                    rotulo="Nome completo"
                    valor={nome}
                    onChange={setNome}
                    onBlur={() => setTocados((t) => ({ ...t, nome: true }))}
                    placeholder="Nome e sobrenome"
                    autoComplete="name"
                    erro={tocados.nome && erroNome ? "Informe nome e sobrenome." : null}
                    valido={nome.trim().split(/\s+/).length >= 2}
                  />
                  <Campo
                    rotulo="E-mail"
                    valor={email}
                    onChange={setEmail}
                    onBlur={() => setTocados((t) => ({ ...t, email: true }))}
                    placeholder="voce@email.com"
                    tipo="email"
                    autoComplete="email"
                    ajuda="O acesso é enviado para este e-mail."
                    erro={tocados.email && erroEmail ? "E-mail inválido." : null}
                    valido={emailValido(email)}
                  />
                  <Campo
                    rotulo="CPF"
                    valor={cpf}
                    onChange={(v) => setCpf(mascararCpf(v))}
                    onBlur={() => setTocados((t) => ({ ...t, cpf: true }))}
                    placeholder="000.000.000-00"
                    modoTeclado="numeric"
                    ajuda="Exigido pelo Banco Central para pagamentos PIX."
                    erro={tocados.cpf && erroCpf ? "CPF inválido. Confira os números." : null}
                    valido={cpfValido(cpf)}
                  />
                </div>

                <p
                  className="flex items-start gap-2 text-[11.5px] leading-snug mt-3"
                  style={{ color: TEXTO_FRACO }}
                >
                  <Lock className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
                  Pedimos só o que o pagamento exige. Nada aqui vai para
                  terceiros.
                </p>
              </Cartao>

              <SelosDeConfianca />
            </motion.div>
          )}

          {/* ─────────── PASSO 2 ─────────── */}
          {etapa === "ofertas" && (
            <motion.div key="ofertas" {...slide} transition={transicao} className="space-y-3">
              {/* O aviso que abre o passo 2. Prova social primeiro (quase
                  todo mundo ativa), desconto depois, e o custo de não ativar
                  por último — nessa ordem porque a perda só pesa depois de a
                  pessoa já ter aceitado que os módulos valem a pena. */}
              <div
                className="rounded-xl p-4"
                style={{ backgroundColor: "#FEF6E7", border: "1px solid #F3D9A4" }}
              >
                <p
                  className="flex items-start gap-2 text-[13px] font-extrabold leading-snug"
                  style={{ color: "#7C4A03" }}
                >
                  <TriangleAlert className="w-4 h-4 flex-shrink-0 mt-px" />
                  <span>
                    ATENÇÃO: {PROPORCAO_ATIVA}% dos usuários do {produto.nome}{" "}
                    ativam estes módulos.
                  </span>
                </p>
                <p className="text-[12.5px] leading-snug mt-2" style={{ color: "#7C4A03" }}>
                  Libere os módulos ocultos abaixo agora com até{" "}
                  <span className="font-extrabold">{maiorDesconto(bumps)}% de desconto</span>.
                  Se você avançar sem eles, esses dados seguem{" "}
                  <span className="font-extrabold">bloqueados por segurança</span>.
                </p>
              </div>

              <div className="space-y-2.5">
                {bumps.map((bump, i) => (
                  <CartaoBump
                    key={bump.id}
                    bump={bump}
                    ativo={marcados.has(bump.id)}
                    indice={i}
                    semAnimacao={semAnimacao}
                    onToggle={() => alternarBump(bump.id)}
                  />
                ))}
              </div>

              {/* Só aparece depois da primeira marcação: antes disso não há
                  economia nenhuma para mostrar, e cartão vazio ocupando
                  espaço é ruído. */}
              <AnimatePresence>
                {economia > 0 && (
                  <motion.div
                    initial={semAnimacao ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    className="flex items-center gap-2.5 rounded-xl px-4 py-3"
                    style={{ backgroundColor: VERDE_CLARO, border: `1px solid ${VERDE}55` }}
                  >
                    <BadgeCheck className="w-4 h-4 flex-shrink-0" style={{ color: VERDE }} />
                    <p className="text-[12.5px] leading-snug" style={{ color: "#0B6B48" }}>
                      Você está economizando{" "}
                      <span className="font-extrabold">{emReais(economia)}</span> nos
                      módulos selecionados.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              <SelosDeConfianca />
            </motion.div>
          )}

          {/* ─────────── PASSO 3 ─────────── */}
          {etapa === "pagamento" && (
            <motion.div key="pagamento" {...slide} transition={transicao} className="space-y-3">
              {/* Quem já comprou chega com tudo preenchido. Sem este
                  aviso, a pessoa cai numa tela de pagar sem lembrar de ter
                  digitado nada e desconfia do site. */}
              {jaComprou && (
                <div
                  className="flex items-center gap-2.5 rounded-xl px-4 py-3 bg-white"
                  style={{ border: `1px solid ${BORDA}` }}
                >
                  <BadgeCheck className="w-4 h-4 flex-shrink-0" style={{ color: VERDE }} />
                  <p className="text-[12.5px] leading-snug min-w-0 flex-1">
                    Comprando como{" "}
                    <span className="font-bold">{nome.split(/\s+/)[0]}</span>
                    <span className="block truncate" style={{ color: TEXTO_FRACO }}>
                      {email}
                    </span>
                  </p>
                  <button
                    type="button"
                    onClick={() => irPara("dados", -1)}
                    className="text-[12px] font-bold flex-shrink-0 underline underline-offset-2"
                    style={{ color: TEAL }}
                  >
                    trocar
                  </button>
                </div>
              )}

              <Cartao titulo="Revise seu pedido">
                <div className="space-y-2.5">
                  <div className="flex items-center gap-3">
                    <Miniatura produto={produto} tamanho={44} />
                    <span className="min-w-0 flex-1 text-[13px] font-semibold truncate">
                      {produto.nome}
                    </span>
                    <span className="text-[13px] font-bold flex-shrink-0">
                      {emReais(produto.preco)}
                    </span>
                  </div>

                  <AnimatePresence initial={false}>
                    {itensExtras.map((item) => (
                      <motion.div
                        key={item.id}
                        initial={semAnimacao ? false : { opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.2 }}
                        className="flex items-center gap-3"
                      >
                        <Miniatura produto={item} tamanho={44} />
                        <span className="min-w-0 flex-1 text-[13px] font-semibold truncate">
                          {item.nome}
                        </span>
                        <span className="text-[13px] font-bold flex-shrink-0">
                          {emReais(item.preco)}
                        </span>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>

                <div
                  className="mt-3 pt-3 flex items-baseline justify-between"
                  style={{ borderTop: `1px solid ${BORDA}` }}
                >
                  <span className="text-[13px] font-semibold" style={{ color: TEXTO_FRACO }}>
                    Total
                  </span>
                  <ValorAnimado valor={total} semAnimacao={semAnimacao} />
                </div>
              </Cartao>

              <Cartao titulo="Forma de pagamento" numero={3}>
                <MetodoPix semAnimacao={semAnimacao} />
              </Cartao>

              {erro && <Aviso texto={erro} />}

              <SelosDeConfianca />
            </motion.div>
          )}

          {/* ─────────── PIX ─────────── */}
          {etapa === "pix" && cobranca && (
            <motion.div key="pix" {...slide} transition={transicao} className="space-y-3">
              {/* Estado, antes de qualquer instrução: quem chega aqui quer
                  saber se o sistema está esperando por ele ou já travou. */}
              <div className="text-center pb-1">
                <span className="inline-flex items-center gap-2 mb-2">
                  <motion.span
                    animate={semAnimacao ? undefined : { opacity: [1, 0.25, 1] }}
                    transition={{ duration: 1.3, repeat: Infinity }}
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: VERDE }}
                  />
                  <span
                    className="text-[11.5px] font-extrabold uppercase tracking-wider"
                    style={{ color: VERDE }}
                  >
                    Aguardando seu pagamento
                  </span>
                </span>
                <h2 className="text-[19px] font-extrabold leading-tight px-2">
                  Falta só pagar{" "}
                  <span style={{ color: VERDE }}>{emReais(cobranca.total)}</span>{" "}
                  para liberar seu acesso
                </h2>
              </div>

              <Cartao>
                <p
                  className="text-[11px] font-bold uppercase tracking-wider mb-2"
                  style={{ color: TEAL }}
                >
                  Passo 1 de 2 · copie e pague no seu banco
                </p>
                <h3 className="text-[15px] font-bold leading-snug mb-3">
                  Copie o código PIX e cole no app do banco
                </h3>

                {cobranca.pix.payload && (
                  <>
                    <div
                      className="rounded-lg px-3 py-2.5 mb-2.5 text-[11.5px] leading-relaxed select-all truncate"
                      style={{
                        backgroundColor: "#F7F8FA",
                        border: `1px solid ${BORDA}`,
                        color: TEXTO_FRACO,
                      }}
                    >
                      {cobranca.pix.payload}
                    </div>

                    <motion.button
                      type="button"
                      onClick={copiar}
                      whileTap={semAnimacao ? undefined : { scale: 0.985 }}
                      className="relative w-full flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-[15px] text-white overflow-hidden"
                      style={{
                        backgroundColor: copiado ? TEAL : VERDE,
                        boxShadow: `0 6px 18px ${VERDE}40`,
                      }}
                    >
                      {!semAnimacao && !copiado && (
                        <motion.span
                          aria-hidden
                          initial={{ x: "-130%" }}
                          animate={{ x: "330%" }}
                          transition={{
                            duration: 2.2,
                            repeat: Infinity,
                            repeatDelay: 2.4,
                            ease: "easeInOut",
                          }}
                          className="absolute top-0 bottom-0 w-1/3 pointer-events-none"
                          style={{
                            background:
                              "linear-gradient(100deg, transparent, rgba(255,255,255,0.35), transparent)",
                          }}
                        />
                      )}
                      <span className="relative flex items-center gap-2">
                        {copiado ? (
                          <>
                            <Check className="w-4 h-4" strokeWidth={3} />
                            Código copiado
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" />
                            Copiar código PIX
                          </>
                        )}
                      </span>
                    </motion.button>

                    <p
                      className="flex items-center justify-center gap-1.5 text-[11.5px] mt-2"
                      style={{ color: VERDE }}
                    >
                      <Check className="w-3.5 h-3.5" strokeWidth={3} />
                      Código seguro e pronto para colar
                    </p>
                  </>
                )}

                {/* O QR é alternativa, não caminho principal: neste funil
                    quase todo mundo já está no celular, e quem está no
                    celular não escaneia a própria tela. */}
                {qrUtilizavel(cobranca.pix.qr_base64) && (
                  <div
                    className="mt-4 pt-4 text-center"
                    style={{ borderTop: `1px solid ${BORDA}` }}
                  >
                    <p
                      className="text-[11px] font-bold uppercase tracking-wider mb-3"
                      style={{ color: TEXTO_FRACO }}
                    >
                      Ou escaneie
                    </p>
                    <div className="flex justify-center">
                      <div
                        className="p-3 rounded-xl bg-white"
                        style={{ border: `1px solid ${BORDA}` }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`data:image/png;base64,${cobranca.pix.qr_base64}`}
                          alt="QR Code do PIX"
                          width={184}
                          height={184}
                          className="block w-[184px] h-[184px]"
                        />
                      </div>
                    </div>
                    <p className="text-[11.5px] mt-2.5" style={{ color: TEXTO_FRACO }}>
                      Use a câmera do app do seu banco para ler o QR Code.
                    </p>
                  </div>
                )}
              </Cartao>

              <div
                className="rounded-xl px-4 py-3 space-y-1.5"
                style={{ backgroundColor: VERDE_CLARO, border: `1px solid ${VERDE}40` }}
              >
                {restantePix !== null &&
                  (restantePix > 0 ? (
                    <p className="text-[13px] font-bold" style={{ color: "#0B6B48" }}>
                      Este PIX expira em{" "}
                      <span
                        className="tabular-nums"
                        style={{ color: restantePix < 120 ? "#DC2626" : "#B45309" }}
                      >
                        {mmss(restantePix)}
                      </span>
                    </p>
                  ) : (
                    <p className="text-[13px] font-bold text-red-600">
                      Este PIX expirou. O pagamento não pode mais ser feito com este código.
                    </p>
                  ))}
                <p
                  className="flex items-start gap-1.5 text-[12.5px] leading-snug font-semibold"
                  style={{ color: "#0B6B48" }}
                >
                  <Check className="w-3.5 h-3.5 flex-shrink-0 mt-px" strokeWidth={3} />
                  Assim que pagar, seu acesso é liberado automaticamente.
                </p>
              </div>

              {/* Mandar o código para si mesmo resolve o caso real de quem
                  vai pagar no banco de outro aparelho. */}
              {cobranca.pix.payload && (
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(
                    `Código PIX do meu pedido (${emReais(cobranca.total)}):\n\n${cobranca.pix.payload}`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-[13.5px] bg-white"
                  style={{ border: `1px solid ${BORDA}`, color: TEXTO }}
                >
                  <MessageCircle className="w-4 h-4" style={{ color: VERDE }} />
                  Enviar código pelo WhatsApp
                </a>
              )}

              {/* Conferência manual: a consulta automática roda a cada 4s,
                  mas o botão existe porque esperar sem poder fazer nada é o
                  que faz a pessoa fechar a aba. */}
              <button
                type="button"
                onClick={() => void verificarAgora()}
                disabled={verificando}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-[13.5px] bg-white disabled:opacity-70"
                style={{ border: `1px solid ${VERDE}66`, color: VERDE }}
              >
                {verificando ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Verificando...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" strokeWidth={3} />
                    Já paguei, verificar pagamento
                  </>
                )}
              </button>

              <AnimatePresence>
                {semConfirmacao && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-center text-[12px] leading-snug"
                    style={{ color: TEXTO_FRACO }}
                  >
                    O banco ainda não confirmou. Pode levar alguns segundos —
                    esta página avisa sozinha quando cair.
                  </motion.p>
                )}
              </AnimatePresence>

              <Cartao titulo="Sua compra">
                <div className="flex items-center gap-3.5">
                  <Miniatura produto={produto} tamanho={56} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-bold leading-tight">
                      {produto.nome}
                    </p>
                    {itensExtras.length > 0 && (
                      <p className="text-[12px] leading-snug mt-0.5" style={{ color: TEXTO_FRACO }}>
                        + {itensExtras.length}{" "}
                        {itensExtras.length === 1 ? "módulo" : "módulos"}:{" "}
                        {itensExtras.map((i) => i.nome).join(", ")}
                      </p>
                    )}
                    <p className="text-[12px] leading-snug mt-1" style={{ color: TEXTO_FRACO }}>
                      O acesso chega em{" "}
                      <span className="font-semibold" style={{ color: TEXTO }}>
                        {email}
                      </span>{" "}
                      após a confirmação.
                    </p>
                  </div>
                </div>
              </Cartao>

              <div className="space-y-2">
                {[
                  "Pagamento processado com segurança",
                  "Confirmação automática após o pagamento",
                  "Acesso enviado logo em seguida",
                ].map((texto) => (
                  <p key={texto} className="flex items-center gap-2.5 text-[12.5px]">
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: VERDE_CLARO }}
                    >
                      <Check className="w-3 h-3" style={{ color: VERDE }} strokeWidth={3.5} />
                    </span>
                    {texto}
                  </p>
                ))}
              </div>
            </motion.div>
          )}

          {/* ─────────── SUCESSO ─────────── */}
          {etapa === "pago" && (
            <motion.div
              key="pago"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="pt-2"
            >
              <Cartao>
                <div className="text-center py-2">
                  <motion.div
                    initial={semAnimacao ? false : { scale: 0.5 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 300, damping: 16 }}
                    className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
                    style={{ backgroundColor: VERDE_CLARO }}
                  >
                    <CheckCircle2 className="w-9 h-9" style={{ color: VERDE }} strokeWidth={2.2} />
                  </motion.div>
                  <h1 className="text-[20px] font-extrabold leading-tight mb-2">
                    Pagamento confirmado
                  </h1>
                  <p
                    className="text-[13.5px] leading-relaxed max-w-[320px] mx-auto"
                    style={{ color: TEXTO_FRACO }}
                  >
                    Seu acesso foi liberado. Os dados de entrada estão a caminho
                    de{" "}
                    <span className="font-bold" style={{ color: TEXTO }}>
                      {email}
                    </span>
                    .
                  </p>
                </div>
              </Cartao>

              <motion.button
                type="button"
                onClick={irParaUpsell}
                whileTap={semAnimacao ? undefined : { scale: 0.985 }}
                className="relative w-full flex flex-col items-center justify-center py-4 mt-3 rounded-xl font-bold text-white overflow-hidden"
                style={{ backgroundColor: VERDE, boxShadow: `0 6px 18px ${VERDE}45` }}
              >
                {!semAnimacao && (
                  <motion.span
                    aria-hidden
                    initial={{ x: "-130%" }}
                    animate={{ x: "330%" }}
                    transition={{
                      duration: 2.2,
                      repeat: Infinity,
                      repeatDelay: 2,
                      ease: "easeInOut",
                    }}
                    className="absolute top-0 bottom-0 w-1/3 pointer-events-none"
                    style={{
                      background:
                        "linear-gradient(100deg, transparent, rgba(255,255,255,0.35), transparent)",
                    }}
                  />
                )}
                <span className="relative flex items-center gap-2 text-[15.5px]">
                  CONTINUAR
                  <ChevronRight className="w-4 h-4" />
                </span>
                <span className="relative text-[11px] font-semibold text-white/85 mt-0.5">
                  Falta um último passo para liberar seu acesso
                </span>
              </motion.button>

              <p className="text-center text-[11.5px] mt-2" style={{ color: TEXTO_FRACO }}>
                Seguindo automaticamente em{" "}
                <span className="font-bold tabular-nums">{Math.max(contagemUpsell, 0)}s</span>
              </p>

              <div
                className="flex items-start gap-3 rounded-xl px-4 py-3.5 mt-3 bg-white"
                style={{ border: `1px solid ${BORDA}` }}
              >
                <Mail className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: VERDE }} />
                <p className="text-[12.5px] leading-snug" style={{ color: TEXTO_FRACO }}>
                  Não chegou em alguns minutos? Procure na caixa de spam antes
                  de abrir chamado: é para lá que a maioria vai.
                </p>
              </div>

              <div className="mt-3">
                <SelosDeConfianca />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <footer className="pt-6 text-center">
          <p className="text-[11px] leading-snug" style={{ color: TEXTO_FRACO }}>
            Pagamento processado por <span className="font-semibold">Lezty Pay</span>.
            <br />
            Produto digital. O acesso é enviado por e-mail após a confirmação.
          </p>
        </footer>
      </div>

      {/* Barra de ação. Só nos passos de compra: na tela do PIX a ação já está
          no cartão, e dois botões disputando é o que faz a pessoa parar. */}
      {mostraCompra && (
        <div
          className="fixed bottom-0 left-0 right-0 z-40 px-4 pt-3 pb-4"
          style={{
            backgroundColor: "#FFFFFF",
            borderTop: `1px solid ${BORDA}`,
            boxShadow: "0 -4px 24px rgba(17,27,33,0.08)",
          }}
        >
          <div className="max-w-[560px] mx-auto">
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-[12.5px] font-semibold" style={{ color: TEXTO_FRACO }}>
                Total{itensExtras.length > 0 ? ` · ${itensExtras.length + 1} itens` : ""}
              </span>
              <ValorAnimado valor={total} semAnimacao={semAnimacao} compacto />
            </div>

            <motion.button
              type="button"
              onClick={avancar}
              disabled={enviando}
              whileTap={semAnimacao ? undefined : { scale: 0.985 }}
              className="relative w-full flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-[15.5px] text-white overflow-hidden disabled:opacity-70"
              style={{ backgroundColor: VERDE, boxShadow: `0 6px 18px ${VERDE}45` }}
            >
              {/* Brilho atravessando o botão: só transform, sem repintar nada */}
              {!semAnimacao && !enviando && (
                <motion.span
                  aria-hidden
                  initial={{ x: "-130%" }}
                  animate={{ x: "330%" }}
                  transition={{
                    duration: 2.2,
                    repeat: Infinity,
                    repeatDelay: 2.4,
                    ease: "easeInOut",
                  }}
                  className="absolute top-0 bottom-0 w-1/3 pointer-events-none"
                  style={{
                    background:
                      "linear-gradient(100deg, transparent, rgba(255,255,255,0.35), transparent)",
                  }}
                />
              )}
              <span className="relative flex items-center gap-2">
                {enviando ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Gerando PIX...
                  </>
                ) : etapa === "pagamento" ? (
                  <>
                    <Lock className="w-4 h-4" />
                    PAGAR {emReais(total)} COM PIX
                  </>
                ) : (
                  <>
                    CONTINUAR
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </span>
            </motion.button>

            <p
              className="flex items-center justify-center gap-1.5 text-[11px] mt-2"
              style={{ color: TEXTO_FRACO }}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Ambiente seguro · seus dados são criptografados
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Faixa de retenção.
 *
 * O relógio aqui não conta desconto: conta o tempo em que o relatório fica
 * guardado. É a mesma escassez que a oferta já usa, e é verdadeira no que
 * importa — a análise é temporária.
 */
function FaixaRetencao({
  segundos,
  semAnimacao,
}: {
  segundos: number;
  semAnimacao: boolean;
}) {
  const acabando = segundos <= 60;
  const encerrado = segundos === 0;

  return (
    <div
      className="w-full px-4 py-2"
      style={{
        backgroundColor: encerrado ? "#FEE2E2" : "#FEF6E7",
        borderBottom: `1px solid ${encerrado ? "#FCA5A5" : "#F5DEB4"}`,
      }}
    >
      <div className="max-w-[560px] mx-auto flex items-center gap-2.5">
        <motion.span
          animate={semAnimacao ? undefined : { opacity: [1, 0.35, 1] }}
          transition={{ duration: 1.4, repeat: Infinity }}
          className="flex-shrink-0 flex"
        >
          {encerrado ? (
            <Trash2 className="w-4 h-4" style={{ color: "#B91C1C" }} />
          ) : (
            <Clock className="w-4 h-4" style={{ color: AMBAR }} />
          )}
        </motion.span>

        <p
          className="text-[11.5px] leading-snug min-w-0 flex-1"
          style={{ color: encerrado ? "#991B1B" : "#7C4A03" }}
        >
          {encerrado ? (
            <>
              <span className="font-bold">Prazo encerrado.</span> Seus dados e o
              relatório entraram na fila de exclusão.
            </>
          ) : (
            <>
              Seu relatório fica armazenado por{" "}
              <span className="font-extrabold tabular-nums">{mmss(segundos)}</span>.
              Depois desse prazo, os dados são excluídos.
            </>
          )}
        </p>

        {!encerrado && (
          <span
            className="text-[15px] font-extrabold tabular-nums flex-shrink-0"
            style={{ color: acabando ? "#DC2626" : AMBAR }}
          >
            {mmss(segundos)}
          </span>
        )}
      </div>
    </div>
  );
}

/** Passos, com a barra de progresso correndo entre eles. */
function Passos({
  passos,
  indice,
  concluido,
}: {
  passos: { chave: Etapa; rotulo: string }[];
  indice: number;
  concluido: boolean;
}) {
  return (
    <div className="flex items-start mb-4 px-1">
      {passos.map((passo, i) => {
        const feito = concluido || i < indice;
        const ativo = !concluido && i === indice;
        return (
          <div key={passo.chave} className="flex-1 flex flex-col items-center relative">
            {i > 0 && (
              <>
                <span
                  className="absolute top-[13px] right-1/2 w-full h-[2px]"
                  style={{ backgroundColor: BORDA }}
                />
                <motion.span
                  className="absolute top-[13px] right-1/2 w-full h-[2px] origin-right"
                  style={{ backgroundColor: VERDE }}
                  initial={false}
                  animate={{ scaleX: feito || ativo ? 1 : 0 }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                />
              </>
            )}
            <motion.span
              className="w-[26px] h-[26px] rounded-full flex items-center justify-center text-[12px] font-bold relative z-10 mb-1.5"
              initial={false}
              animate={{ scale: ativo ? 1.08 : 1 }}
              transition={{ type: "spring", stiffness: 420, damping: 22 }}
              style={
                feito
                  ? { backgroundColor: VERDE, color: "#fff" }
                  : ativo
                    ? {
                        backgroundColor: VERDE,
                        color: "#fff",
                        boxShadow: `0 0 0 4px ${VERDE}26`,
                      }
                    : {
                        backgroundColor: "#fff",
                        color: "#9AA4AD",
                        border: `1.5px solid ${BORDA}`,
                      }
              }
            >
              {feito ? <Check className="w-3.5 h-3.5" strokeWidth={3.5} /> : i + 1}
            </motion.span>
            <span
              className="text-[10.5px] text-center leading-tight px-0.5"
              style={{
                color: feito || ativo ? TEAL : "#9AA4AD",
                fontWeight: ativo ? 700 : 500,
              }}
            >
              {passo.rotulo}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Cartão de order bump, com a animação de seleção. */
function CartaoBump({
  bump,
  ativo,
  indice,
  semAnimacao,
  onToggle,
}: {
  bump: Produto;
  ativo: boolean;
  indice: number;
  semAnimacao: boolean;
  onToggle: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onToggle}
      aria-pressed={ativo}
      initial={semAnimacao ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: semAnimacao ? 0 : indice * 0.07, duration: 0.3, ease: "easeOut" }}
      whileTap={semAnimacao ? undefined : { scale: 0.99 }}
      className="relative w-full text-left rounded-xl p-3 overflow-hidden"
      style={{
        backgroundColor: ativo ? VERDE_CLARO : "#FFFFFF",
        border: ativo ? `2px solid ${VERDE}` : `2px dashed ${BORDA}`,
        transition: "background-color .2s, border-color .2s",
      }}
    >
      {/* Clarão que varre o cartão ao marcar: opacidade e escala só, a GPU
          resolve sozinha sem repintar o resto da página. */}
      <AnimatePresence>
        {ativo && !semAnimacao && (
          <motion.span
            key="glow"
            aria-hidden
            initial={{ opacity: 0.55, scale: 0.6 }}
            animate={{ opacity: 0, scale: 1.9 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="absolute left-6 top-1/2 w-24 h-24 -mt-12 rounded-full pointer-events-none"
            style={{
              background: `radial-gradient(circle, ${bump.tom}55 0%, transparent 70%)`,
            }}
          />
        )}
      </AnimatePresence>

      <div className="relative flex items-start gap-3">
        <motion.span
          className="w-[22px] h-[22px] rounded-md flex items-center justify-center flex-shrink-0 mt-0.5"
          initial={false}
          animate={{ scale: ativo ? [1, 1.18, 1] : 1 }}
          transition={{ duration: 0.3 }}
          style={{
            backgroundColor: ativo ? VERDE : "#FFFFFF",
            border: ativo ? `1px solid ${VERDE}` : `2px solid #CFD5DB`,
          }}
        >
          <AnimatePresence>
            {ativo && (
              <motion.span
                key="check"
                initial={semAnimacao ? false : { scale: 0, rotate: -30 }}
                animate={{ scale: 1, rotate: 0 }}
                exit={{ scale: 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 18 }}
                className="flex"
              >
                <Check className="w-3.5 h-3.5 text-white" strokeWidth={3.5} />
              </motion.span>
            )}
          </AnimatePresence>
        </motion.span>

        <Miniatura produto={bump} tamanho={58} />

        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-2">
            <span className="min-w-0">
              <span className="block text-[14px] font-bold leading-tight">{bump.nome}</span>
              <span className="block text-[12.5px] font-semibold leading-snug mt-0.5">
                {bump.gancho}
              </span>
            </span>
            <span className="flex flex-col items-end flex-shrink-0">
              <span
                className="text-[10.5px] font-bold px-1.5 py-0.5 rounded"
                style={{ backgroundColor: "#DC2626", color: "#fff" }}
              >
                {descontoPercentual(bump)}% OFF
              </span>
              <span
                className="text-[11px] line-through mt-1"
                style={{ color: "#9AA4AD" }}
              >
                {emReais(bump.precoDe)}
              </span>
              <span className="text-[15px] font-extrabold leading-none" style={{ color: VERDE }}>
                {emReais(bump.preco)}
              </span>
            </span>
          </span>
          <span className="block text-[11.5px] leading-snug mt-1.5" style={{ color: TEXTO_FRACO }}>
            {bump.detalhe}
          </span>
        </span>
      </div>
    </motion.button>
  );
}

/** PIX como método selecionado, com o anel pulsando devagar. */
function MetodoPix({ semAnimacao }: { semAnimacao: boolean }) {
  return (
    <motion.div
      initial={semAnimacao ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="relative flex items-center gap-3 rounded-xl p-3 overflow-hidden"
      style={{ border: `2px solid ${VERDE}`, backgroundColor: VERDE_CLARO }}
    >
      {!semAnimacao && (
        <motion.span
          aria-hidden
          animate={{ opacity: [0, 0.4, 0], scale: [0.9, 1.25, 0.9] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -left-6 top-1/2 w-28 h-28 -mt-14 rounded-full pointer-events-none"
          style={{ background: `radial-gradient(circle, ${VERDE}44 0%, transparent 70%)` }}
        />
      )}

      <span
        className="relative w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ border: `2px solid ${VERDE}` }}
      >
        <motion.span
          className="w-2.5 h-2.5 rounded-full"
          style={{ backgroundColor: VERDE }}
          initial={semAnimacao ? false : { scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 18 }}
        />
      </span>
      <QrCode className="relative w-5 h-5 flex-shrink-0" style={{ color: VERDE }} />
      <span className="relative min-w-0 flex-1">
        <span className="block text-[14px] font-bold leading-tight">PIX</span>
        <span className="block text-[12px] leading-tight" style={{ color: TEXTO_FRACO }}>
          Aprovação em segundos · liberação imediata
        </span>
      </span>
      <span
        className="relative text-[10px] font-bold px-2 py-1 rounded-md flex-shrink-0"
        style={{ backgroundColor: VERDE, color: "#fff" }}
      >
        MAIS RÁPIDO
      </span>
    </motion.div>
  );
}

/** Total que dá um pulinho quando muda — o olho acompanha sem procurar. */
function ValorAnimado({
  valor,
  semAnimacao,
  compacto,
}: {
  valor: number;
  semAnimacao: boolean;
  compacto?: boolean;
}) {
  return (
    <motion.span
      key={valor}
      initial={semAnimacao ? false : { scale: 0.88, opacity: 0.4 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 480, damping: 20 }}
      className={`font-extrabold tabular-nums ${compacto ? "text-[20px]" : "text-[22px]"}`}
      style={{ color: compacto ? TEXTO : TEAL }}
    >
      {emReais(valor)}
    </motion.span>
  );
}

function Miniatura({
  produto,
  tamanho,
}: {
  produto: { imagem: string; nome: string; icone: LucideIcon; tom: string };
  tamanho: number;
}) {
  const [falhou, setFalhou] = useState(false);
  const Icone = produto.icone;

  if (falhou) {
    return (
      <span
        className="rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ width: tamanho, height: tamanho, backgroundColor: `${produto.tom}1A` }}
      >
        <Icone style={{ color: produto.tom, width: tamanho * 0.4, height: tamanho * 0.4 }} />
      </span>
    );
  }

  return (
    <span
      className="rounded-lg overflow-hidden flex-shrink-0 block"
      style={{
        width: tamanho,
        height: tamanho,
        border: `1px solid ${BORDA}`,
        backgroundColor: "#FFFFFF",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={produto.imagem}
        alt={produto.nome}
        width={tamanho}
        height={tamanho}
        loading="lazy"
        decoding="async"
        onError={() => setFalhou(true)}
        className="w-full h-full object-cover"
      />
    </span>
  );
}

function Cartao({
  titulo,
  numero,
  children,
}: {
  titulo?: string;
  numero?: number;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-xl bg-white overflow-hidden"
      style={{ border: `1px solid ${BORDA}` }}
    >
      {titulo && (
        <div
          className="px-4 py-2.5 flex items-center gap-2"
          style={{ borderBottom: `1px solid ${BORDA}` }}
        >
          {numero && (
            <span
              className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
              style={{ backgroundColor: VERDE_CLARO, color: VERDE }}
            >
              {numero}
            </span>
          )}
          <h2
            className="text-[12px] font-bold uppercase tracking-wider"
            style={{ color: numero ? TEAL : TEXTO_FRACO }}
          >
            {titulo}
          </h2>
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

function Campo({
  rotulo,
  valor,
  onChange,
  onBlur,
  placeholder,
  tipo = "text",
  modoTeclado,
  autoComplete,
  ajuda,
  erro,
  valido,
}: {
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  tipo?: string;
  modoTeclado?: "numeric" | "tel";
  autoComplete?: string;
  ajuda?: string;
  erro?: string | null;
  valido?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-[12px] font-semibold mb-1.5" style={{ color: TEXTO }}>
        {rotulo}
      </span>
      <span className="relative block">
        <input
          type={tipo}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          inputMode={modoTeclado}
          autoComplete={autoComplete}
          autoCorrect="off"
          spellCheck={false}
          className="w-full rounded-lg px-3 py-3 outline-none transition-colors"
          style={{
            // 16px: abaixo disso o iOS dá zoom ao focar o campo.
            fontSize: "16px",
            paddingRight: valido && !erro ? 38 : undefined,
            backgroundColor: "#FFFFFF",
            border: `1.5px solid ${erro ? "#DC2626" : BORDA}`,
            color: TEXTO,
          }}
          onFocus={(e) => {
            if (!erro) e.currentTarget.style.borderColor = VERDE;
          }}
        />
        <AnimatePresence>
          {valido && !erro && (
            <motion.span
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 20 }}
              className="absolute right-3 top-1/2 -mt-[9px] flex"
            >
              <Check className="w-[18px] h-[18px]" style={{ color: VERDE }} strokeWidth={3} />
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      {erro ? (
        <motion.span
          initial={{ opacity: 0, y: -3 }}
          animate={{ opacity: 1, y: 0 }}
          className="block text-[11.5px] mt-1 font-medium"
          style={{ color: "#DC2626" }}
        >
          {erro}
        </motion.span>
      ) : (
        ajuda && (
          <span className="block text-[11.5px] mt-1" style={{ color: TEXTO_FRACO }}>
            {ajuda}
          </span>
        )
      )}
    </label>
  );
}

function SelosDeConfianca() {
  const selos: { icone: LucideIcon; titulo: string; texto: string }[] = [
    { icone: ShieldCheck, titulo: "Garantia", texto: "7 dias" },
    { icone: Lock, titulo: "Dados", texto: "Criptografados" },
    { icone: BadgeCheck, titulo: "Compra", texto: "Protegida" },
    { icone: Smartphone, titulo: "Acesso", texto: "Imediato" },
  ];
  return (
    <div className="grid grid-cols-4 gap-2 pt-1">
      {selos.map((s) => {
        const Icone = s.icone;
        return (
          <div
            key={s.titulo}
            className="rounded-lg bg-white px-1.5 py-2.5 text-center"
            style={{ border: `1px solid ${BORDA}` }}
          >
            <Icone className="w-4 h-4 mx-auto mb-1" style={{ color: VERDE }} />
            <p className="text-[9.5px] font-bold leading-tight" style={{ color: TEXTO }}>
              {s.titulo}
            </p>
            <p className="text-[9px] leading-tight" style={{ color: TEXTO_FRACO }}>
              {s.texto}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function Aviso({ texto }: { texto: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-2.5 rounded-xl px-4 py-3"
      style={{ backgroundColor: "#FEF2F2", border: "1px solid #FCA5A5" }}
    >
      <TriangleAlert className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#DC2626" }} />
      <p className="text-[12.5px] leading-snug" style={{ color: "#B91C1C" }}>
        {texto}
      </p>
    </motion.div>
  );
}
