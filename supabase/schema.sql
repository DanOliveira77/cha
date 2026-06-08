-- Esquema do backend do Chá de Casa Nova
-- Execute este arquivo no SQL Editor do Supabase (projeto novo).

-- =========================================================
-- Tabela: presentes
-- =========================================================
create table if not exists presentes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  preco numeric,
  categoria text,
  imagem_url text,
  icone text,
  quantidade_maxima int not null default 1,
  quantidade_reservada int not null default 0,
  apenas_pix boolean not null default false
);

-- =========================================================
-- Tabela: confirmacoes_presenca
-- =========================================================
create table if not exists confirmacoes_presenca (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text not null,
  email text not null,
  presenca text not null,
  mensagem text,
  criado_em timestamptz not null default now()
);

-- =========================================================
-- Tabela: reservas_presentes
-- =========================================================
create table if not exists reservas_presentes (
  id uuid primary key default gen_random_uuid(),
  presente_id uuid not null references presentes(id),
  nome text not null,
  telefone text not null,
  criado_em timestamptz not null default now()
);

-- =========================================================
-- Trigger: trava de duplicidade / controle de quantidade
--
-- Antes de inserir uma reserva, trava a linha do presente
-- (SELECT ... FOR UPDATE) e verifica se ainda há vaga. Isso
-- garante atomicidade mesmo com requisições concorrentes:
-- a segunda reserva simultânea espera a primeira liberar o
-- lock e então enxerga o contador já atualizado.
-- =========================================================
create or replace function checar_vaga_presente()
returns trigger as $$
declare
  presente presentes%rowtype;
begin
  select * into presente
  from presentes
  where id = new.presente_id
  for update;

  if not found then
    raise exception 'Presente não encontrado';
  end if;

  if presente.quantidade_reservada >= presente.quantidade_maxima then
    raise exception 'Este presente já foi totalmente reservado'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$ language plpgsql security definer;

create trigger trg_checar_vaga_presente
  before insert on reservas_presentes
  for each row execute function checar_vaga_presente();

create or replace function incrementar_reserva_presente()
returns trigger as $$
begin
  update presentes
  set quantidade_reservada = quantidade_reservada + 1
  where id = new.presente_id;

  return new;
end;
$$ language plpgsql security definer;

create trigger trg_incrementar_reserva_presente
  after insert on reservas_presentes
  for each row execute function incrementar_reserva_presente();

-- =========================================================
-- Row Level Security
-- =========================================================
alter table presentes enable row level security;
alter table confirmacoes_presenca enable row level security;
alter table reservas_presentes enable row level security;

-- presentes: leitura pública, sem escrita pelo público
create policy "presentes_select_publico"
  on presentes for select
  using (true);

-- confirmacoes_presenca: somente inserção pelo público
create policy "confirmacoes_presenca_insert_publico"
  on confirmacoes_presenca for insert
  with check (true);

-- reservas_presentes: somente inserção pelo público
create policy "reservas_presentes_insert_publico"
  on reservas_presentes for insert
  with check (true);

-- =========================================================
-- Seed: lista de presentes (migrada do array `gifts` do index.html)
-- =========================================================
insert into presentes (nome, preco, categoria, imagem_url, icone, quantidade_maxima, apenas_pix) values
  ('Liquidificador', 189.90, 'cozinha', 'https://images.unsplash.com/photo-1570222094114-d054a817e56b?w=400&q=80', null, 1, false),
  ('Air Fryer', 459.90, 'cozinha', 'https://images.unsplash.com/photo-1648145404453-d2f5b3e3e30b?w=400&q=80', null, 1, false),
  ('Aparelho de Jantar', 239.90, 'cozinha', 'https://images.unsplash.com/photo-1603199506016-b9a594b593c0?w=400&q=80', null, 1, false),
  ('Jogo de Cama Casal', 159.90, 'quarto', 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=400&q=80', null, 1, false),
  ('Jogo de Panelas', 699.90, 'cozinha', 'https://images.unsplash.com/photo-1584990347163-0c065c97c1c7?w=400&q=80', null, 1, false),
  ('Chaleira Elétrica', 129.90, 'cozinha', 'https://images.unsplash.com/photo-1594631252845-29fc4cc8866c?w=400&q=80', null, 1, false),
  ('Manta para Sofá', 89.90, 'sala', 'https://images.unsplash.com/photo-1567016526105-22da7c13161a?w=400&q=80', null, 1, false),
  ('Toalhas de Banho', 119.90, 'banheiro', 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=400&q=80', null, 2, false),
  ('Cesto Organizador', 79.90, 'lavanderia', 'https://images.unsplash.com/photo-1545173168-9f1947eebb7f?w=400&q=80', null, 2, false),
  ('Quadro Decorativo', 99.90, 'decoracao', 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=400&q=80', null, 1, false),
  ('Ajuda com o Condomínio', 200, 'outros', null, '🏢', 1, true),
  ('Conta de Luz', 110, 'outros', null, '💡', 1, true),
  ('Um Ano de Netflix', 240, 'outros', null, '🎬', 1, true),
  ('Ajuda no Mercado', 500, 'outros', null, '🛒', 1, true)
on conflict do nothing;
