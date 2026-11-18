/**
 * Receptor de webhook da Lezty Pay.
 *
 * A ordem das operações aqui não é estilo, é requisito:
 *
 * 1. Ler o corpo CRU, como texto. A assinatura é calculada sobre os bytes
 *    que chegaram; desserializar antes e reserializar depois produz outros
 *    bytes e a verificação passa a falhar sempre.
 * 2. Verificar a assinatura ANTES de confiar em qualquer campo. Enquanto não
 *    verificou, isto é um POST anônimo da internet.
 * 3. Responder 2xx rápido. A Lezty desiste em 10 s e trata 3xx como falha.
 * 4. Processar depois de responder, em `waitUntil`.
 * 5. Deduplicar pelo id do evento e reconciliar consultando a transação,
 *    porque a entrega é pelo menos uma vez e pode chegar fora de ordem.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { consultarTransacao } from "@/lib/lezty/charges";
import { segredosWebhook } from "@/lib/lezty/config";
import {
  ArmazemD1,
  ArmazemMemoria,
  type ArmazemEventos,
  type D1Minimo,
} from "@/lib/lezty/event-store";
import { verificarAssinatura } from "@/lib/lezty/webhook-signature";
import type { EventoLezty, Transacao } from "@/lib/lezty/types";
import { aoMudarTransacao } from "@/lib/lezty/on-event";

// Webhook nunca pode ser servido de cache nem pré-renderizado.
export const dynamic = "force-dynamic";

/** Corpo acima disto não é entrega legítima: a API limita o corpo a 256 KB. */
const LIMITE_CORPO = 256 * 1024;

const memoria = new ArmazemMemoria();

async function obterContexto(): Promise<{
  armazem: ArmazemEventos;
  emSegundoPlano: (p: Promise<unknown>) => void;
}> {
  try {
    const { env, ctx } = await getCloudflareContext({ async: true });
    const db = (env as unknown as { DB?: D1Minimo }).DB;

    return {
      armazem: db ? new ArmazemD1(db) : memoria,
      // `waitUntil` mantém o Worker vivo depois da resposta. Sem ele, o
      // processamento é cortado no meio assim que o 200 sai.
      emSegundoPlano: (p) => ctx.waitUntil(p),
    };
  } catch {
    // `next dev` em Node: não há contexto de Worker. O trabalho roda solto
    // mesmo, que em um processo de desenvolvimento não é cortado.
    return {
      armazem: memoria,
      emSegundoPlano: (p) => {
        void p;
      },
    };
  }
}

export async function POST(req: Request): Promise<Response> {
  // (1) corpo cru, antes de qualquer parse
  const corpoCru = await req.text();

  if (corpoCru.length > LIMITE_CORPO) {
    return new Response("corpo grande demais", { status: 413 });
  }

  // (2) assinatura
  let segredos: string[];
  try {
    segredos = await segredosWebhook();
  } catch (erro) {
    // Configuração ausente é problema nosso, não da Lezty: 500 faz a
    // entrega ser repetida depois, quando o segredo estiver no lugar.
    console.error(
      "[lezty] segredo de webhook ausente ou inválido:",
      erro instanceof Error ? erro.message : "desconhecido"
    );
    return new Response("configuração incompleta", { status: 500 });
  }

  const verificacao = await verificarAssinatura(
    corpoCru,
    req.headers.get("X-Signature"),
    segredos
  );

  if (!verificacao.valida) {
    // 400 e ponto: nada do corpo foi lido, nada foi registrado. Devolver 401
    // ou detalhar o motivo ajudaria quem está tentando forjar.
    console.warn("[lezty] entrega recusada:", verificacao.motivo);
    return new Response("assinatura inválida", { status: 400 });
  }

  // A partir daqui o corpo é confiável o bastante para ser desserializado.
  let evento: EventoLezty<Transacao>;
  try {
    evento = JSON.parse(corpoCru) as EventoLezty<Transacao>;
  } catch {
    return new Response("corpo não é JSON", { status: 400 });
  }

  // O id do evento também vem no header; se os dois divergirem, algo está
  // errado o suficiente para não processar.
  const idHeader = req.headers.get("X-Event-Id");
  if (!evento?.id || (idHeader && idHeader !== evento.id)) {
    return new Response("evento sem id consistente", { status: 400 });
  }

  const { armazem, emSegundoPlano } = await obterContexto();

  // (5a) dedup: a primeira entrega que conseguir registrar é a que processa
  const novo = await armazem.registrarSeNovo(evento.id, evento.type);
  if (!novo) {
    // Repetição é esperada (até 6 tentativas, mais o reenvio proposital do
    // ambiente de teste). 200 para a Lexty parar de reentregar.
    return new Response(null, { status: 204 });
  }

  // (4) processa depois de responder
  emSegundoPlano(processar(evento, armazem));

  // (3) 2xx imediato
  return new Response(null, { status: 202 });
}

/**
 * Processamento fora do caminho da resposta.
 *
 * Nada aqui confia em `data.object`. O evento serve para saber QUAL
 * transação olhar; o estado dela vem de uma consulta por id, que é o único
 * jeito de sobreviver a eventos fora de ordem — um `transaction.expired`
 * atrasado não pode desfazer um pagamento que já aconteceu.
 */
async function processar(
  evento: EventoLezty<Transacao>,
  armazem: ArmazemEventos
): Promise<void> {
  try {
    const transacaoDoEvento = evento.data?.object;
    const id = transacaoDoEvento?.id;

    if (!id) {
      await armazem.falhar(evento.id, "evento sem data.object.id");
      return;
    }

    // (5b) reconciliação
    const { dados: transacao } = await consultarTransacao(id);

    await aoMudarTransacao(transacao, evento);
    await armazem.concluir(evento.id);
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : "erro desconhecido";
    console.error("[lezty] falha ao processar", evento.id, motivo);
    await armazem.falhar(evento.id, motivo);
    // Não relança: a resposta já foi enviada. A Lezty vai reentregar o
    // evento, e o registro em 'falhou' deixa a próxima tentativa passar.
  }
}
