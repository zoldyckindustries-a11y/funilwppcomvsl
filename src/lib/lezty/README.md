# Integração Lezty Pay (PIX)

Implementado contra `docs.leztypay.com/llms-full.txt` e `docs.leztypay.com/openapi.json`.
Nenhum nome de campo foi escrito de memória: o que não estava legível na
documentação está listado em **Pendências** no fim deste arquivo, em vez de
preenchido por palpite.

## Arquivos

| Arquivo | Papel |
|---|---|
| `config.ts` | Lê chave e segredos do ambiente. Valida formato, nunca imprime o valor. |
| `types.ts` | Tipos da API. Todo valor monetário é inteiro em centavos. |
| `client.ts` | `fetch` com `Authorization: Bearer`, envelope de erro, `X-Request-Id`, limite de taxa. |
| `charges.ts` | Criar cobrança PIX e consultar transação. |
| `webhook-signature.ts` | Verificação de `X-Signature`. |
| `event-store.ts` | Deduplicação por id de evento (D1 ou memória). |
| `on-event.ts` | **Onde entra o seu negócio.** Nasce vazio de propósito. |
| `schema.sql` | Tabela de deduplicação para o D1. |
| `../../app/api/lezty/webhook/route.ts` | O receptor. |

## Variáveis de ambiente

Nenhuma com prefixo `NEXT_PUBLIC_` — isso as colocaria no bundle do navegador.

```
LEZTY_API_KEY=sk_test_...              # 43 caracteres após o prefixo
LEZTY_WEBHOOK_SECRET=whsec_...         # mostrado uma única vez na criação
LEZTY_WEBHOOK_SECRET_ANTERIOR=whsec_...# só durante as 24 h de rotação
```

Desenvolvimento: `.env.local` (já está no `.gitignore`).
Produção: `npx wrangler secret put LEZTY_API_KEY` — fica no cofre da
Cloudflare, não no repositório.

A mesma URL (`https://api.leztypay.com`) atende os dois ambientes. Quem decide
se o dinheiro é real é o prefixo da chave.

## Criar uma cobrança

```ts
import { criarCobrancaPix, chaveDeCobranca } from "@/lib/lezty/charges";

const { dados: transacao, repetida } = await criarCobrancaPix(
  {
    amount: 6700,                     // centavos: R$ 67,00
    customer: { name, email, document },
    pix: { expires_in_seconds: 300 }, // 5 minutos, prazo usado no checkout
    postback_url: "https://seu-dominio/api/lezty/webhook",
    metadata: { pedido: pedidoId },
  },
  chaveDeCobranca(pedidoId)           // Idempotency-Key da TENTATIVA
);

transacao.pix?.payload    // copia e cola
transacao.pix?.qr_base64  // PNG em base64
```

**A Idempotency-Key identifica a tentativa de cobrança, não a requisição
HTTP.** Se a chamada cair e você repetir, mande a mesma chave: a Lezty
devolve a cobrança já criada com `Idempotent-Replayed: true` em vez de cobrar
duas vezes. Chave nova só para uma cobrança nova. Grave a chave junto do
pedido antes de chamar.

O que fazer quando dá erro, conforme a documentação:

| Resposta | O que fazer |
|---|---|
| `409 idempotency_in_progress` | A primeira ainda está rodando. Espere e repita a MESMA chave (trava solta em 60 s). |
| `409 idempotency_conflict` | Mesma chave, corpo diferente. É bug seu. |
| `503 acquirer_timeout` | Espere 60 s e repita a MESMA chave. |
| `503 acquirer_rejected` / `acquirer_unavailable` | Ficou gravado. Use chave NOVA. |
| `400`, `403`, demais `409` | O registro foi limpo: a mesma chave serve de novo. |
| `429 rate_limited` | Respeite o `Retry-After`. 60 escritas/min, 600 leituras/min. |

`LeztyApiError.permiteMesmaChave` já responde isso.

## Webhook

Aponte o endpoint da Lezty para `https://seu-dominio/api/lezty/webhook`.

A ordem no receptor é requisito, não estilo:

1. lê o corpo **cru** (`req.text()`) — a assinatura é sobre os bytes que
   chegaram; `JSON.parse` + `JSON.stringify` produz outros bytes;
2. verifica `X-Signature` antes de confiar em qualquer campo;
3. responde 2xx rápido (a Lezty desiste em 10 s; 3xx conta como falha);
4. processa em `waitUntil`, depois da resposta;
5. deduplica por `evento.id` e **reconcilia consultando a transação**.

O passo 5 existe porque a documentação diz, literalmente, que a entrega é
"pelo menos uma vez, não exatamente uma vez" e que "Ordem não é garantida".
Por isso `on-event.ts` decide pelo `status` da transação consultada, nunca
pelo tipo do evento: um `transaction.expired` atrasado não pode desfazer um
pagamento que já aconteceu.

Reentrega: até 6 tentativas (1 min, 5 min, 30 min, 2 h, 12 h). 50 entregas
mortas seguidas e 7 dias sem sucesso desativam o endpoint.

### Testar sem depender da Lezty

A função de verificação, isolada (14 casos):

```
node scripts/testar-assinatura-lezty.mjs
```

Assinatura válida, corpo adulterado, corpo reserializado, segredo errado,
rotação com dois segredos, vários `v1` no mesmo header, timestamp velho e
adiantado, limite exato, header ausente/malformado/sem `v1`, ordem invertida
dos campos e hex em maiúsculas.

O endpoint de ponta a ponta (6 casos). Precisa do `next dev` no ar e de um
`.env.local` com um `LEZTY_WEBHOOK_SECRET` qualquer no formato — o script
assina com ele:

```
node scripts/testar-webhook-lezty.mjs
```

Confere que entrega sem assinatura, com assinatura falsa, com timestamp fora
da janela e com corpo alterado depois de assinado são recusadas com 400; que
a entrega legítima responde 202; e que a repetição da mesma entrega responde
204 sem reprocessar. O tempo de resposta aparece em cada linha: fora a
primeira (compilação da rota), fica em dezenas de milissegundos, bem dentro
dos 10 s que a Lezty espera.

## Instalar a chave de produção

O `.env.local` é da sua máquina — o Worker em produção não o enxerga. Ele lê
os bindings que a Cloudflare injeta, e quem os coloca lá é `wrangler secret
put`: o valor fica no cofre da conta, fora do repositório, fora do
`wrangler.jsonc`, fora do build e fora de qualquer log.

```
npx wrangler login                        # uma vez, abre o navegador
node scripts/instalar-segredos-lezty.mjs  # pede cada valor e instala
npm run build:cf && npm run deploy:cf
```

O script pede os valores num prompt, não por argumento: argumento de linha de
comando fica no histórico do shell e na lista de processos do sistema. Ele
também confere o formato e pede confirmação extra quando o valor começa com
`sk_live_`.

Para conferir o que já está instalado (mostra os nomes, nunca os valores):

```
npx wrangler secret list
```

### A trava de ambiente

`conferirAmbiente()` recusa cobrança quando uma chave `sk_live_` está sendo
usada contra `localhost`. O acidente que isso evita é específico e caro:
alguém cola a chave de produção no `.env.local` para "testar rapidinho", e
cada clique no checkout vira cobrança real, com dinheiro entrando e precisando
ser estornado depois.

Em produção a origem é o domínio real, então a trava não encosta no caminho
que importa. Para um teste de homologação deliberado contra localhost, defina
`LEZTY_PERMITIR_LIVE_LOCAL=1`.

## Antes de trocar para `sk_live_`

1. **Ligue o D1.** Sem ele a deduplicação usa memória, que no Worker é por
   isolate e evapora — ou seja, não deduplica. Veja `schema.sql`.
2. **Preencha `on-event.ts`.** Hoje ele só registra no log.
3. **Teste os caminhos ruins** com os finais de valor do ambiente de teste:
   `01` nunca paga e expira, `03` já nasce recusada. (Os demais finais que
   circulam — `02`, `04`, `06`, `07`, `08` — não aparecem de forma literal
   na documentação que conseguimos ler; confirme no painel antes de usar.)
4. **Troque a chave por último**, e só por variável de ambiente.

## Confirmado contra o ambiente de teste

Rodado com `sk_test_` em 17/11/2026. O que a documentação não dizia e a API
respondeu:

- **`POST /v1/transactions` existe e é POST mesmo.** O verbo estava só
  inferido de um `-d` em exemplo de curl; a chamada real devolve 201.
- **`items[]` tem três campos obrigatórios: `name`, `quantity` e
  `unit_amount`.** Não é `title`, não é `unit_price`. Descoberto pela própria
  API, que devolve o `param` que faltou, um por vez. `items` inteiro é
  opcional: sem ele, a cobrança é criada normalmente.
- **Id malformado devolve 400 `validation_failed` ("invalid id"), não 404.**
  Vale tratar junto com o 404 na consulta: nos dois casos a cobrança não
  existe para você, e responder 503 faria a tela de pagamento consultar para
  sempre um id que nunca vai existir.
- **No ambiente de teste, `pix.qr_base64` é um PNG de 1x1 pixel** (68 bytes,
  do adquirente falso). O `pix.payload` é um BR Code real e bem formado. O
  checkout detecta isso e passa a girar em torno do copia e cola.
- **Finais de valor, verificados:** `03` devolve `503 acquirer_rejected` na
  criação; `01` cria pendente e não paga; valor neutro paga sozinho em
  ~7,5 s e traz `end_to_end_id`.
- **Idempotência funciona como descrito:** mesma chave devolve a mesma
  transação, com `Idempotent-Replayed: true`.

### Como rodar

```
node scripts/testar-lezty-integracao.mjs   # 16 casos, pelo nosso checkout
node scripts/testar-lezty-cenarios.mjs     # finais 01 e 03, direto na API
```

## Pendências (documentação não confirma)

Levantado na leitura; nada disso foi inventado para fechar o código:

- **Saques.** O texto diz "Um POST" e nomeia `createWithdrawal`, mas não
  escreve o caminho. `POST /v1/withdrawals` seria chute, então **saque não
  foi implementado**. Campos citados: `pix_key_id`, `amount`; resposta com
  `status`, `fee`, `total`, `end_to_end_id`, `failure_reason`. Cancelamento
  (`POST /v1/withdrawals/{id}/cancel`) e listagem de chaves
  (`GET /v1/pix-keys`) estão literais; o caminho do saldo, não.
- **`transaction.created`.** A página de cobranças diz que não é entregue por
  webhook; a de checkout lista o evento entre os enviados. A documentação se
  contradiz e não tratamos esse tipo.
- **Schemas de criação no `openapi.json`.** O arquivo tem 1,6 MB e só o
  começo (rotas `/v1/me/...`) pôde ser lido literalmente. O objeto
  `transaction` e o bloco `pix` foram confirmados ali; os campos de entrada da
  criação vieram do texto da documentação.
- **Prazo de retenção da Idempotency-Key.** Não documentado.
