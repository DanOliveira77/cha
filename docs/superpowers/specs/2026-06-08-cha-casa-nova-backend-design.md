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
- Disparar uma **Edge Function** `notify` por meio de um *Database Webhook*, sempre que uma linha nova é inserida em `confirmacoes_presenca` ou `reservas_presentes`. Essa função envia um e-mail ao organizador via **Resend**.

Não há servidor próprio: o navegador do convidado fala diretamente com o Supabase, e o Supabase aciona o e-mail.

## Modelo de dados

### `presentes`
| coluna | tipo | observação |
|---|---|---|
| id | uuid (PK) | |
| nome | text | |
| preco | numeric | |
| categoria | text | usada nos filtros da lista |
| imagem_url | text | nullable — alguns itens usam `icone` em vez de imagem |
| icone | text | nullable — emoji exibido quando não há `imagem_url` |
| quantidade_maxima | integer | quantos convidados podem reservar o mesmo item (a maioria é 1, alguns aceitam 2) |
| quantidade_reservada | integer | contador atualizado por trigger ao inserir uma reserva |
| apenas_pix | boolean | itens que só aceitam contribuição via PIX (sem botão "Comprar") |

Substitui o array hardcoded no JS. O organizador edita itens pelo painel do Supabase, sem precisar de redeploy do site.

### `confirmacoes_presenca`
| coluna | tipo | observação |
|---|---|---|
| id | uuid (PK) | |
| nome | text | |
| telefone | text | |
| email | text | |
| presenca | text | "sim" ou "nao", reflete o `<select id="presenca">` |
| mensagem | text | opcional |
| criado_em | timestamptz | default now() |

Um registro por envio do `#rsvpForm` (que já tem os campos `nome`, `telefone`, `email`, `presenca`, `mensagem`).

### `reservas_presentes`
| coluna | tipo | observação |
|---|---|---|
| id | uuid (PK) | |
| presente_id | uuid (FK → presentes.id) | |
| nome | text | |
| telefone | text | |
| criado_em | timestamptz | default now() |

A maioria dos presentes só pode ser reservada por uma pessoa, mas alguns aceitam mais de uma reserva (`quantidade_maxima > 1`, ex. itens com 2 unidades). Por isso a trava de duplicidade não é uma simples *unique constraint* em `presente_id` — ela é feita por dois *triggers* em `reservas_presentes`:

- **BEFORE INSERT**: trava a linha do presente correspondente (`SELECT ... FOR UPDATE`) e verifica se `quantidade_reservada < quantidade_maxima`. Se não houver vaga, lança uma exceção e o `insert` é rejeitado. O lock garante atomicidade: uma segunda reserva concorrente espera a primeira terminar e então enxerga o contador já atualizado — não há condição de corrida possível.
- **AFTER INSERT**: incrementa `presentes.quantidade_reservada` em 1.

Isso mantém a garantia "sem condição de corrida, atômica no nível do banco" da abordagem original, generalizada para suportar itens com mais de uma vaga.

## Fluxo de dados

1. Página carrega → busca `presentes` no Supabase e renderiza a lista (substitui o array estático atual).
2. Convidado confirma presença → `insert` em `confirmacoes_presenca`. Sucesso → exibe a mensagem de confirmação que já existe na UI hoje.
3. Convidado escolhe um presente → `insert` em `reservas_presentes`:
   - Sucesso → o trigger AFTER INSERT incrementa `presentes.quantidade_reservada`; a UI recarrega a lista do banco e marca o item como indisponível quando `quantidade_reservada` atinge `quantidade_maxima`.
   - Erro lançado pelo trigger BEFORE INSERT (sem vaga) → exibe mensagem amigável ("esse presente já foi escolhido, tente outro") e recarrega a lista para refletir o estado real.
4. Cada `insert` bem-sucedido em `confirmacoes_presenca` ou `reservas_presentes` dispara o *Database Webhook* → Edge Function `notify` → e-mail ao organizador com os detalhes (nome, telefone, e-mail, item escolhido ou dados do RSVP).

## Segurança (RLS)

- **`presentes`**: leitura pública liberada; escrita bloqueada para o público (só editável pelo organizador via painel/`service_role`).
- **`confirmacoes_presenca`** e **`reservas_presentes`**: convidados só podem **inserir** — não podem ler, atualizar ou apagar registros (nem os próprios nem os de outros). Isso impede que qualquer visitante veja a lista de quem confirmou presença ou quem reservou o quê.
- O front-end usa a `anon key` do Supabase, que é pública por natureza; a segurança vem inteiramente das políticas de RLS, não do sigilo da chave.

## Erros e estados de UI

- Falha de rede/inserção genérica → mensagem de fallback ("não foi possível confirmar agora, tente novamente").
- Conflito de reserva (presente já escolhido) → mensagem específica orientando a escolher outro item, com a lista recarregada para refletir o estado atual.

## Plano de testes

- Enviar um RSVP de teste e confirmar que o registro aparece em `confirmacoes_presenca` no painel do Supabase e que o e-mail chega.
- Reservar um presente de teste e confirmar o registro em `reservas_presentes`, o incremento de `presentes.quantidade_reservada` e o e-mail.
- Tentar reservar o mesmo presente (com `quantidade_maxima = 1`) a partir de duas abas/sessões simultaneamente e confirmar que apenas uma reserva é aceita e a outra recebe a mensagem de conflito.
- Reservar um presente com `quantidade_maxima = 2` duas vezes (pessoas diferentes) e confirmar que ambas são aceitas e uma terceira tentativa é rejeitada.
- Usando a `anon key`, tentar ler `confirmacoes_presenca` e `reservas_presentes` diretamente pela API e confirmar que a RLS bloqueia (retorna vazio/erro de permissão).
