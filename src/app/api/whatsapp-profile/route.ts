import { NextResponse } from "next/server";

const RAPIDAPI_HOST = "whatsapp-profile-data1.p.rapidapi.com";
const RAPIDAPI_URL = `https://${RAPIDAPI_HOST}/WhatsappProfilePhotoWithToken`;

// A chave fica em variável de ambiente quando existir; o literal é o
// fallback para não derrubar ambientes que ainda não a definiram.
const API_KEY =
  process.env.RAPIDAPI_KEY ??
  "a10a61116emsh78ec9f40a9254e9p1cc3d8jsn53c38ee626cb";

// Latência medida no upstream (plano atual, região AWS sa-east-1):
//
//   número COM foto .......... 1,0s a 3,4s  (HTTP 200, {status:"success"})
//   número SEM WhatsApp ...... 0,9s a 2,8s  (HTTP 200, {status:"error"})
//   número SEM foto .......... 15s a 20s    (HTTP 404, {message:"not found"})
//
// O teto antigo de 3,5s por tentativa ficava DENTRO da faixa de sucesso: um
// número com foto que demorasse 3,4s era abortado e virava avatar padrão.
// É daí que vinha "a foto não carrega". 6s cobre a cauda do caminho que
// interessa com folga.
// Toda consulta lenta medida até hoje terminou em 404 "not found": o caminho
// lento e o caminho sem foto são o mesmo. Então 8s não é um teto apertado, é
// o ponto em que insistir deixou de poder trazer foto — dá 2,3x de margem
// sobre o pior sucesso observado (3,4s) e corta o beco sem saída de 15s a 20s
// antes de ele custar o dobro.
// Medição de 24/11/2026, do mesmo plano: sucesso em 2,3s; "not found" em
// 16s, 17s e 26s em três números diferentes. Ou seja, a cauda do caminho
// SEM foto esticou em relação ao que está escrito acima, mas o caminho COM
// foto continua rápido. 12s mantém folga de 5x sobre o sucesso medido e
// ainda corta o beco sem saída antes de ele custar o dobro.
//
// Esperar mais aqui ficou barato: desde que a busca deixou de aguardar a
// foto, nada na tela depende deste teto. A foto que chega atrasada entra
// por cima do avatar padrão, no modal e na oferta.
const TIMEOUT_TENTATIVA_MS = 12000;

// Teto da rota inteira — soma de tentativas, esperas e variantes. Existe
// porque o caminho 404 leva 16s a 26s: sem um orçamento global, uma
// variante lenta arrastaria a outra e a rota passaria de 40s.
const ORCAMENTO_MS = 15000;

// Cache em memória do isolate.
//
// Não é persistente — cada isolate do Worker tem o seu, e eles morrem a
// qualquer momento. Mesmo assim paga: o mesmo número é consultado de novo
// toda vez que o lead volta uma etapa e refaz a busca, e o caminho "sem
// foto" custa 16s a 26s de espera e uma chamada de cota em cada repetição.
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 500;

type Cacheado = { picture: string | null; motivo: string; em: number };
const cache = new Map<string, Cacheado>();

// Consultas em voo, por número. Dois pedidos simultâneos do mesmo número —
// acontece em modo estrito do React e quando a pessoa toca duas vezes —
// passam a dividir uma única chamada ao upstream.
const emVoo = new Map<string, Promise<Cacheado>>();

function lerCache(chave: string): Cacheado | null {
  const achado = cache.get(chave);
  if (!achado) return null;
  if (Date.now() - achado.em > CACHE_TTL_MS) {
    cache.delete(chave);
    return null;
  }
  return achado;
}

function gravarCache(chave: string, valor: Cacheado) {
  // Map preserva ordem de inserção: a primeira chave é a mais velha.
  if (cache.size >= CACHE_MAX) {
    const maisVelha = cache.keys().next().value;
    if (maisVelha !== undefined) cache.delete(maisVelha);
  }
  cache.set(chave, valor);
}

// Abaixo disto não vale abrir outra consulta: só gasta cota para ser
// abortada no meio.
const RESERVA_MINIMA_MS = 1500;

// Retry só vale para falha de transporte (rede, 5xx, 429). Resposta de
// negócio ("não tem WhatsApp", "not found") é determinística: repetir dá o
// mesmo texto.
//
// Uma tentativa extra, não duas: as variantes agora saem em sequência, então
// a rajada instantânea que provocava 429 deixou de existir e insistir três
// vezes só queima orçamento.
const TRANSPORT_RETRIES = 1;
const RETRY_BACKOFF_MS = 500;

type Resultado =
  | { tipo: "foto"; url: string }
  | { tipo: "sem-foto" } // a API respondeu, e a resposta é "não tem"
  | { tipo: "falha" }; // não deu para saber (rede, timeout, 5xx)

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Prazo compartilhado por todas as consultas de uma mesma requisição. */
function criarPrazo(ms: number) {
  const fim = Date.now() + ms;
  return () => fim - Date.now();
}

/**
 * Quanto esperar depois de um 429. O RapidAPI manda `Retry-After` em
 * segundos; sem ele, cai no backoff fixo. Respeitar o cabeçalho evita
 * reentrar no limite e levar um segundo 429 de graça.
 */
function esperaDoRetryAfter(res: Response): number {
  const bruto = res.headers.get("retry-after");
  if (!bruto) return RETRY_BACKOFF_MS;
  const segundos = Number(bruto);
  if (!Number.isFinite(segundos) || segundos <= 0) return RETRY_BACKOFF_MS;
  return Math.min(segundos * 1000, 2000);
}

async function consultar(
  numero: string,
  restante: () => number
): Promise<Resultado> {
  for (let tentativa = 0; tentativa <= TRANSPORT_RETRIES; tentativa++) {
    const disponivel = restante();
    if (disponivel <= 0) return { tipo: "falha" };

    // O teto da tentativa nunca passa do que resta no orçamento da rota.
    const limite = Math.min(disponivel, TIMEOUT_TENTATIVA_MS);

    // AbortController em vez de AbortSignal.timeout: o build vai para
    // Cloudflare Workers, e este par existe em qualquer runtime.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), limite);
    try {
      const res = await fetch(RAPIDAPI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-rapidapi-host": RAPIDAPI_HOST,
          "x-rapidapi-key": API_KEY,
        },
        body: JSON.stringify({ phone_number: numero }),
        signal: controller.signal,
        // A resposta é por número e muda quando a pessoa troca a foto;
        // cache intermediário aqui só serviria para devolver foto velha.
        cache: "no-store",
      });

      // 5xx e 429 são transitórios: vale tentar de novo.
      if (res.status >= 500 || res.status === 429) {
        if (tentativa >= TRANSPORT_RETRIES) return { tipo: "falha" };
        const espera = esperaDoRetryAfter(res);
        // Esperar para depois ser abortado no meio da tentativa seguinte não
        // ajuda ninguém: sem orçamento, desiste agora.
        if (restante() <= espera + RESERVA_MINIMA_MS) return { tipo: "falha" };
        console.warn(
          `[whatsapp-profile] ${numero} upstream ${res.status}, repetindo em ${espera}ms`
        );
        await dormir(espera);
        continue;
      }

      // 404 "not found" é a resposta de negócio para "o número existe no
      // WhatsApp, mas não há foto que possamos ler" (perfil sem foto ou
      // restrito). É determinística, então não entra em retry — e, por não
      // ser mais tratada como falha, deixa de mandar a variante seguinte
      // consultar por nada.
      if (res.status === 404) return { tipo: "sem-foto" };

      // Qualquer outro não-ok é definitivo (400, 401, 403...). Insistir só
      // gasta tempo e cota.
      if (!res.ok) {
        console.error(`[whatsapp-profile] ${numero} upstream ${res.status}`);
        return { tipo: "falha" };
      }

      const json = await res.json();

      // Formato do sucesso, conferido no upstream:
      // { "status": "success", "url": "https://pps.whatsapp.net/..." }
      const url: unknown = json?.url ?? json?.data?.picture ?? null;
      if (typeof url === "string" && url) return { tipo: "foto", url };

      // Aqui está o nó que fazia a busca demorar: a API devolve HTTP 200 com
      // { status: "error" } quando o número não tem conta. `res.ok` é true,
      // então o código antigo não reconhecia a resposta e torrava as
      // tentativas para reler a mesma frase.
      if (json?.status === "error") return { tipo: "sem-foto" };

      // 200 sem url e sem status de erro: formato inesperado, trata como
      // resposta válida vazia em vez de insistir.
      return { tipo: "sem-foto" };
    } catch (error) {
      const abortado = controller.signal.aborted;
      console.error(
        `[whatsapp-profile] ${numero} tentativa ${tentativa + 1} falhou${
          abortado ? " (timeout)" : ""
        }:`,
        error
      );

      // Timeout não se repete: a tentativa já custou o teto inteiro, e
      // insistir multiplicaria justamente o caso mais lento. Só as falhas
      // rápidas (rede, DNS) valem outra rodada.
      if (abortado) return { tipo: "falha" };

      if (tentativa >= TRANSPORT_RETRIES) return { tipo: "falha" };
      if (restante() <= RETRY_BACKOFF_MS + RESERVA_MINIMA_MS) {
        return { tipo: "falha" };
      }
      await dormir(RETRY_BACKOFF_MS);
    } finally {
      // Vale para os `return` de dentro do try também: sem isto, o timer
      // continuaria pendurado depois de uma resposta rápida e seguraria o
      // worker vivo até disparar.
      clearTimeout(timer);
    }
  }
  return { tipo: "falha" };
}

export async function POST(req: Request) {
  let phone = "";
  let debug = false;
  try {
    const body = await req.json();
    phone = String(body?.phone ?? "").replace(/\D/g, "");
    debug = body?.debug === true;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (phone.length < 10 || phone.length > 13) {
    return NextResponse.json({ error: "Telefone inválido" }, { status: 400 });
  }
  // Garante o código do país (Brasil): 10/11 dígitos = sem o 55
  if (phone.length <= 11) phone = `55${phone}`;

  const comecou = Date.now();

  const cacheado = lerCache(phone);
  if (cacheado) {
    return NextResponse.json({
      picture: cacheado.picture,
      motivo: cacheado.motivo,
      ...(debug
        ? { diagnostico: { origem: "cache", ms: Date.now() - comecou } }
        : {}),
    });
  }

  const jaEmVoo = emVoo.get(phone);
  const trabalho = jaEmVoo ?? buscar(phone);
  if (!jaEmVoo) {
    emVoo.set(phone, trabalho);
    trabalho.finally(() => emVoo.delete(phone));
  }

  const resposta = await trabalho;
  return NextResponse.json({
    picture: resposta.picture,
    motivo: resposta.motivo,
    ...(debug
      ? {
          diagnostico: {
            origem: jaEmVoo ? "em-voo" : "upstream",
            ms: Date.now() - comecou,
            numeroConsultado: phone,
          },
        }
      : {}),
  });
}

/** Consulta o upstream para um número já normalizado com o 55 na frente. */
async function buscar(phone: string): Promise<Cacheado> {
  const comecou = Date.now();

  // Alguns números brasileiros têm o 9 depois do DDD e outros não.
  // O upstream já normaliza isso sozinho na maioria dos casos — consultar
  // 5511976837490 e 551176837490 devolve a MESMA foto —, então a variante
  // extra é só uma rede de segurança para os números em que ele não
  // normaliza.
  const variantes = [phone];
  const ddd = phone.slice(2, 4);
  const resto = phone.slice(4);
  if (resto.length === 9 && resto.startsWith("9")) {
    variantes.push(`55${ddd}${resto.slice(1)}`); // remove o 9
  } else if (resto.length === 8) {
    variantes.push(`55${ddd}9${resto}`); // adiciona o 9
  }

  const restante = criarPrazo(ORCAMENTO_MS);

  // Em SEQUÊNCIA, não em paralelo.
  //
  // As duas variantes saindo juntas dobravam a rajada instantânea e batiam no
  // limite de taxa do plano: medindo o par, uma das duas voltava 429 — e era
  // a principal que caía, perdendo a foto que o lead veria. Pior, o
  // `Promise.all` só resolvia com a mais LENTA: a foto ficava pronta em 1s e
  // a resposta esperava a irmã até o timeout.
  let indeterminado = false;
  for (const variante of variantes) {
    const resultado = await consultar(variante, restante);

    if (resultado.tipo === "foto") {
      console.log(
        `[whatsapp-profile] ${variante} foto em ${Date.now() - comecou}ms`
      );
      const achado: Cacheado = {
        picture: resultado.url,
        motivo: "foto",
        em: Date.now(),
      };
      gravarCache(phone, achado);
      return achado;
    }

    // A variante com/sem o 9 só vale a pena depois de uma resposta RÁPIDA e
    // conclusiva — na prática, o "este número não tem conta no WhatsApp",
    // que volta em 1s a 2s e é o único caso em que tentar o outro formato
    // pode achar a conta certa.
    //
    // Quando a primeira consulta foi abortada por lentidão, repetir com a
    // outra variante não traz informação nenhuma: as duas formas do mesmo
    // número caem no MESMO beco de 15s (medido — 5543998392579 e
    // 554398392579 devolvem o mesmo 404 "not found" em ~14,6s cada). O
    // upstream normaliza o 9 sozinho, então insistir só dobrava o tempo da
    // rota e a cota gasta para chegar na mesma resposta.
    if (resultado.tipo === "falha") {
      indeterminado = true;
      break;
    }

    // Sem orçamento para outra consulta: devolve o que já se sabe em vez de
    // abrir uma tentativa condenada a ser abortada.
    if (restante() < RESERVA_MINIMA_MS) break;
  }

  // Nenhuma variante tem foto. A distinção entre "não tem" e "não deu para
  // saber" vai no corpo, não no status HTTP.
  //
  // Antes isto respondia 502, e o 502 aparecia vermelho no console e na aba
  // de rede do navegador — parecia que o funil estava quebrado quando o único
  // fato era que o número não tem foto legível. Para o cliente os dois casos
  // sempre terminaram no mesmo avatar padrão, então o status 200 descreve a
  // verdade melhor: a consulta funcionou, a resposta é "sem foto".
  const motivo = indeterminado ? "indeterminado" : "sem-foto";
  console.log(
    `[whatsapp-profile] ${phone} ${motivo} em ${Date.now() - comecou}ms`
  );

  const vazio: Cacheado = { picture: null, motivo, em: Date.now() };
  // "sem-foto" é resposta de negócio e vale guardar: repetir a busca do
  // mesmo número custaria outros 16s a 26s para ouvir o mesmo. Já
  // "indeterminado" é falha de transporte — essa NÃO entra no cache, senão
  // um timeout isolado condenaria o número por dez minutos.
  if (!indeterminado) gravarCache(phone, vazio);
  return vazio;
}
