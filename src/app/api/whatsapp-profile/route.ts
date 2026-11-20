import { NextResponse } from "next/server";

const RAPIDAPI_HOST = "whatsapp-profile-data1.p.rapidapi.com";
const RAPIDAPI_URL = `https://${RAPIDAPI_HOST}/WhatsappProfilePhotoWithToken`;

// A chave fica em variável de ambiente quando existir; o literal é o
// fallback para não derrubar ambientes que ainda não a definiram.
const API_KEY =
  process.env.RAPIDAPI_KEY ??
  "a10a61116emsh78ec9f40a9254e9p1cc3d8jsn53c38ee626cb";

// A API leva ~1s a 1,6s para responder. 3,5s cobre a cauda lenta com folga e
// cabe dentro do piso de 3,9s da tela de busca, então um upstream travado não
// chega a atrasar o funil. Sem AbortController viraria 504 em vez de avatar.
const TIMEOUT_MS = 3500;

// Retry só vale para falha de transporte (rede, 5xx, 429). Resposta de
// negócio ("não tem WhatsApp") é determinística: repetir dá o mesmo texto.
//
// Duas tentativas extras porque as variantes agora saem em paralelo, o que
// dobra a rajada instantânea e torna 429 mais provável no plano do RapidAPI.
// Um 429 volta em ~200ms, então insistir nele é barato.
const TRANSPORT_RETRIES = 2;
const RETRY_BACKOFF_MS = 300;

type Resultado =
  | { tipo: "foto"; url: string }
  | { tipo: "sem-foto" } // a API respondeu, e a resposta é "não tem"
  | { tipo: "falha" }; // não deu para saber (rede, timeout, 5xx)

async function consultar(numero: string): Promise<Resultado> {
  for (let tentativa = 0; tentativa <= TRANSPORT_RETRIES; tentativa++) {
    // AbortController em vez de AbortSignal.timeout: o build vai para
    // Cloudflare Workers, e este par existe em qualquer runtime.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
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
      });

      // 5xx e 429 são transitórios: vale tentar de novo.
      if (res.status >= 500 || res.status === 429) {
        throw new Error(`upstream ${res.status}`);
      }

      // Qualquer outro não-ok é definitivo (400, 401, 403...). Insistir só
      // gasta tempo e cota.
      if (!res.ok) return { tipo: "falha" };

      const json = await res.json();

      const url: string | null = json?.url ?? json?.data?.picture ?? null;
      if (url) return { tipo: "foto", url };

      // Aqui está o nó que fazia a busca demorar 8s: a API devolve
      // HTTP 200 com { status: "error" } quando o número não tem conta.
      // `res.ok` é true, então o código antigo não reconhecia a resposta
      // e torrava as 6 tentativas para reler a mesma frase.
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

      // Timeout não se repete: a tentativa já custou os 3,5s inteiros, e
      // insistir multiplicaria justamente o caso mais lento. Só as falhas
      // rápidas (429, 5xx, rede) valem outra rodada.
      if (abortado) return { tipo: "falha" };

      if (tentativa < TRANSPORT_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
      }
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
  try {
    const body = await req.json();
    phone = String(body?.phone ?? "").replace(/\D/g, "");
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (phone.length < 10 || phone.length > 13) {
    return NextResponse.json({ error: "Telefone inválido" }, { status: 400 });
  }
  // Garante o código do país (Brasil): 10/11 dígitos = sem o 55
  if (phone.length <= 11) phone = `55${phone}`;

  // Alguns números brasileiros têm o 9 depois do DDD e outros não.
  // Tenta o número como veio e depois a outra versão (com/sem o 9).
  const variantes = [phone];
  const ddd = phone.slice(2, 4);
  const resto = phone.slice(4);
  if (resto.length === 9 && resto.startsWith("9")) {
    variantes.push(`55${ddd}${resto.slice(1)}`); // remove o 9
  } else if (resto.length === 8) {
    variantes.push(`55${ddd}9${resto}`); // adiciona o 9
  }

  // As variantes são independentes, então vão juntas: o custo passa a ser a
  // mais lenta das duas (~1,5s) em vez da soma delas.
  const resultados = await Promise.all(variantes.map(consultar));

  // A ordem das variantes ainda decide quem ganha: o número como a pessoa
  // digitou tem preferência sobre o palpite com/sem o 9. Rodar em paralelo
  // não muda qual foto volta, só quando.
  for (const resultado of resultados) {
    if (resultado.tipo === "foto") {
      return NextResponse.json({ picture: resultado.url });
    }
  }

  // Nenhuma variante tem foto. Se ao menos uma das consultas falhou de
  // verdade, isso é um "não sei", não um "não tem" — o status diferente
  // deixa a diferença visível no monitoramento, e o cliente continua
  // caindo no avatar padrão nos dois casos.
  const houveFalha = resultados.some((r) => r.tipo === "falha");
  return NextResponse.json(
    { picture: null },
    { status: houveFalha ? 502 : 200 }
  );
}
