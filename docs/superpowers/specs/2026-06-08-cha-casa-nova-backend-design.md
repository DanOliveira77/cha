# Backend para o Chá de Casa Nova — Design

Data: 2026-06-08

## Contexto

O site (`index.html`) é hoje 100% estático, hospedado no GitHub Pages. Ele tem:
- Um formulário de RSVP (`#rsvpForm`) que apenas exibe uma mensagem de sucesso local, sem persistir nada.
- Uma lista de presentes gerada a partir de um array hardcoded no JS, com um modal de confirmação que também não persiste nada — duas pessoas podem escolher o mesmo item sem que ninguém perceba.

Precisamos de um backend mínimo que: (1) salve as confirmações de presença, (2) impeça que dois convidados reservem o mesmo presente, e (3) avise o organizador por e-mail a cada nova confirmação ou reserva.

## Decisão de abordagem

Usar **Supabase** (Postgres + API REST + Edge Functions gerenciadas) acessado diretamente do front-end estático, sem servidor próprio. Alternativas consideradas e descartadas:
- Function intermediária própria (ex. Vercel Function): adiciona uma peça a mais para hospedar/manter sem necessidade real para este projeto.
- Backend tradicional (Node/Express + banco em outro provedor): overkill para um site de evento único.

## Arquitetura

O `index.html` continua estático no GitHub Pages e passa a usar o **Supabase JS client** (via CDN) para:
- Ler/gravar diretamente no Postgres do Supabase, via API REST automática protegida por **Row Level Security (RLS)**.
- Disparar uma **Edge Function** `notify` por meio de um *Database Webhook*, sempre que uma linha nova é inserida em `rsvps` ou `gift_reservations`. Essa função envia um e-mail ao organizador via **Resend**.

Não há servidor próprio: o navegador do convidado fala diretamente com o Supabase, e o Supabase aciona o e-mail.

## Modelo de dados

### `gifts`
| coluna | tipo | observação |
|---|---|---|
| id | uuid (PK) | |
| name | text | |
| description | text | |
| image_url | text | |
| is_taken | boolean | atualizado por trigger ao inserir uma reserva |

Substitui o array hardcoded no JS. O organizador edita itens pelo painel do Supabase, sem precisar de redeploy do site.

### `rsvps`
| coluna | tipo | observação |
|---|---|---|
| id | uuid (PK) | |
| name | text | |
| phone | text | |
| guests_count | integer | |
| message | text | opcional |
| created_at | timestamptz | default now() |

Um registro por envio do `#rsvpForm`.

### `gift_reservations`
| coluna | tipo | observação |
|---|---|---|
| id | uuid (PK) | |
| gift_id | uuid (FK → gifts.id, **UNIQUE**) | trava de duplicidade |
| name | text | |
| phone | text | |
| created_at | timestamptz | default now() |

A *unique constraint* em `gift_id` é o mecanismo que impede duplicidade: se dois convidados tentarem reservar o mesmo presente ao mesmo tempo, o banco rejeita o segundo `insert` com erro de violação de constraint — não há condição de corrida possível, a garantia é atômica no nível do banco.

Um *trigger* em `gift_reservations` (AFTER INSERT) marca `gifts.is_taken = true` para o `gift_id` correspondente, mantendo a lista sincronizada para todos os visitantes.

## Fluxo de dados

1. Página carrega → busca `gifts` no Supabase e renderiza a lista (substitui o array estático atual).
2. Convidado confirma presença → `insert` em `rsvps`. Sucesso → exibe a mensagem de confirmação que já existe na UI hoje.
3. Convidado escolhe um presente → `insert` em `gift_reservations`:
   - Sucesso → marca o item como indisponível na UI; o trigger atualiza `gifts.is_taken` no banco.
   - Erro de violação de unique constraint → exibe mensagem amigável ("esse presente já foi escolhido, tente outro") e atualiza a lista para refletir o estado real.
4. Cada `insert` bem-sucedido em `rsvps` ou `gift_reservations` dispara o *Database Webhook* → Edge Function `notify` → e-mail ao organizador com os detalhes (nome, telefone, item escolhido ou dados do RSVP).

## Segurança (RLS)

- **`gifts`**: leitura pública liberada; escrita bloqueada para o público (só editável pelo organizador via painel/`service_role`).
- **`rsvps`** e **`gift_reservations`**: convidados só podem **inserir** — não podem ler, atualizar ou apagar registros (nem os próprios nem os de outros). Isso impede que qualquer visitante veja a lista de quem confirmou presença ou quem reservou o quê.
- O front-end usa a `anon key` do Supabase, que é pública por natureza; a segurança vem inteiramente das políticas de RLS, não do sigilo da chave.

## Erros e estados de UI

- Falha de rede/inserção genérica → mensagem de fallback ("não foi possível confirmar agora, tente novamente").
- Conflito de reserva (presente já escolhido) → mensagem específica orientando a escolher outro item, com a lista recarregada para refletir o estado atual.

## Plano de testes

- Enviar um RSVP de teste e confirmar que o registro aparece em `rsvps` no painel do Supabase e que o e-mail chega.
- Reservar um presente de teste e confirmar o registro em `gift_reservations`, a atualização de `gifts.is_taken` e o e-mail.
- Tentar reservar o mesmo presente a partir de duas abas/sessões simultaneamente e confirmar que apenas uma reserva é aceita e a outra recebe a mensagem de conflito.
- Usando a `anon key`, tentar ler `rsvps` e `gift_reservations` diretamente pela API e confirmar que a RLS bloqueia (retorna vazio/erro de permissão).
