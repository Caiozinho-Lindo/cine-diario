-- Cine Diário: migração aditiva para contas e espaços multiusuário.
--
-- GARANTIAS DE PRESERVAÇÃO
-- - Não remove tabelas, colunas, títulos, avaliações ou perfis existentes.
-- - Mantém os UUIDs atuais de Caio e Noemy.
-- - Copia todo o acervo atual para o espaço compartilhado "Caio & Noemy".
-- - Copia a situação atual de cada título para a biblioteca dos dois membros.
-- - A transação inteira é revertida automaticamente se uma validação falhar.
--
-- Antes de executar no ambiente online, exporte as tabelas perfis, titulos e
-- avaliacoes e rode 003_validar_migracao_multiusuario.sql após esta migração.

begin;

create temporary table _cine_diario_inventario_antes on commit drop as
select
  (select count(*) from public.perfis) as perfis,
  (select count(*) from public.titulos) as titulos,
  (select count(*) from public.avaliacoes) as avaliacoes;

create table if not exists public.espacos (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(trim(nome)) between 1 and 80),
  tipo text not null default 'pessoal'
    check (tipo in ('pessoal', 'casal', 'familia', 'amigos', 'clube', 'outro')),
  imagem_url text,
  criado_por uuid not null references auth.users(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.espaco_membros (
  espaco_id uuid not null references public.espacos(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  papel text not null default 'membro'
    check (papel in ('proprietario', 'administrador', 'membro')),
  entrou_em timestamptz not null default now(),
  primary key (espaco_id, usuario_id)
);

-- Evolui perfis sem recriar nem apagar as duas linhas existentes.
alter table public.perfis add column if not exists nome_exibicao text;
alter table public.perfis add column if not exists avatar_url text;
alter table public.perfis add column if not exists tema text not null default 'casal';
alter table public.perfis add column if not exists cor_destaque text;
alter table public.perfis add column if not exists pagina_inicial text not null default 'home';
alter table public.perfis add column if not exists criado_em timestamptz not null default now();
alter table public.perfis add column if not exists atualizado_em timestamptz not null default now();

update public.perfis
set nome_exibicao = initcap(nome)
where nome_exibicao is null or trim(nome_exibicao) = '';

alter table public.perfis alter column nome_exibicao set not null;

-- A coluna nome deixa de aceitar somente "caio/noemy" e passa a ser um slug.
-- O bloco descobre o nome real do CHECK legado para funcionar em instalações
-- criadas manualmente ou a partir do README.
do $$
declare
  restricao record;
begin
  for restricao in
    select conname
    from pg_constraint
    where conrelid = 'public.perfis'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%nome%caio%noemy%'
  loop
    execute format('alter table public.perfis drop constraint %I', restricao.conname);
  end loop;
end
$$;

-- UUID fixo torna a migração idempotente e facilita auditoria/exportação.
insert into public.espacos (id, nome, tipo, criado_por)
select
  '00000000-0000-4000-8000-000000000001'::uuid,
  'Caio & Noemy',
  'casal',
  p.id
from public.perfis p
where lower(p.nome) = 'caio'
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from public.espacos
    where id = '00000000-0000-4000-8000-000000000001'::uuid
  ) then
    raise exception 'Espaço legado não criado: perfil Caio não encontrado. Nada foi alterado.';
  end if;

  if (select count(*) from public.perfis where lower(nome) in ('caio', 'noemy')) <> 2 then
    raise exception 'Esperados os perfis Caio e Noemy antes da migração. Nada foi alterado.';
  end if;
end
$$;

insert into public.espaco_membros (espaco_id, usuario_id, papel)
select
  '00000000-0000-4000-8000-000000000001'::uuid,
  p.id,
  case when lower(p.nome) = 'caio' then 'proprietario' else 'administrador' end
from public.perfis p
where lower(p.nome) in ('caio', 'noemy')
on conflict (espaco_id, usuario_id) do update set papel = excluded.papel;

-- Mantém a tabela titulos e seus IDs; apenas passa a indicar o espaço dono.
alter table public.titulos add column if not exists espaco_id uuid
  references public.espacos(id);

update public.titulos
set espaco_id = '00000000-0000-4000-8000-000000000001'::uuid
where espaco_id is null;

alter table public.titulos alter column espaco_id set not null;
create index if not exists titulos_espaco_id_idx on public.titulos(espaco_id);
create index if not exists avaliacoes_usuario_id_idx on public.avaliacoes(usuario_id);

-- Estado pessoal de uma obra. A coluna legada titulos.quero_assistir permanece
-- intacta durante a transição e pode ser removida somente em versão futura.
create table if not exists public.biblioteca_usuario (
  usuario_id uuid not null references auth.users(id) on delete cascade,
  titulo_id uuid not null references public.titulos(id) on delete cascade,
  status text not null default 'quero_assistir'
    check (status in ('quero_assistir', 'assistindo', 'assistido', 'abandonado')),
  favorito boolean not null default false,
  data_assistido date,
  privacidade text not null default 'espaco'
    check (privacidade in ('privado', 'espaco')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (usuario_id, titulo_id)
);

-- Copia todos os títulos atuais para ambos. Isso preserva inclusive itens sem
-- avaliação e a lista "Para assistir" compartilhada.
insert into public.biblioteca_usuario (
  usuario_id,
  titulo_id,
  status,
  data_assistido,
  privacidade,
  criado_em
)
select
  m.usuario_id,
  t.id,
  case when t.quero_assistir then 'quero_assistir' else 'assistido' end,
  case when t.quero_assistir then null else t.data_assistido end,
  'espaco',
  t.criado_em
from public.titulos t
join public.espaco_membros m on m.espaco_id = t.espaco_id
where t.espaco_id = '00000000-0000-4000-8000-000000000001'::uuid
on conflict (usuario_id, titulo_id) do nothing;

create index if not exists biblioteca_usuario_titulo_id_idx
  on public.biblioteca_usuario(titulo_id);
create index if not exists biblioteca_usuario_status_idx
  on public.biblioteca_usuario(usuario_id, status);

-- Preferências que não pertencem ao perfil público.
create table if not exists public.preferencias_usuario (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  tema text not null default 'casal',
  cor_destaque text,
  pagina_inicial text not null default 'home',
  generos_favoritos text[] not null default '{}',
  atualizado_em timestamptz not null default now()
);

insert into public.preferencias_usuario (usuario_id, tema, cor_destaque, pagina_inicial)
select id, tema, cor_destaque, pagina_inicial
from public.perfis
on conflict (usuario_id) do nothing;

-- Cria perfil e espaço pessoal para cada novo cadastro. Contas antigas não
-- passam por este gatilho e permanecem somente no espaço Caio & Noemy.
create or replace function public.criar_estrutura_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  novo_espaco_id uuid;
  nome_inicial text;
begin
  nome_inicial := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'nome_exibicao'), ''),
    nullif(split_part(new.email, '@', 1), ''),
    'Cineasta'
  );

  insert into public.perfis (id, nome, nome_exibicao, tema)
  values (
    new.id,
    'usuario-' || substr(new.id::text, 1, 8),
    left(nome_inicial, 80),
    'casal'
  )
  on conflict (id) do nothing;

  insert into public.preferencias_usuario (usuario_id)
  values (new.id)
  on conflict (usuario_id) do nothing;

  insert into public.espacos (nome, tipo, criado_por)
  values ('Meu Cine Diário', 'pessoal', new.id)
  returning id into novo_espaco_id;

  insert into public.espaco_membros (espaco_id, usuario_id, papel)
  values (novo_espaco_id, new.id, 'proprietario');

  return new;
end;
$$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.criar_estrutura_novo_usuario();

-- Funções auxiliares evitam repetir consultas de associação nas policies.
create or replace function public.membro_do_espaco(espaco uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.espaco_membros
    where espaco_id = espaco and usuario_id = auth.uid()
  );
$$;

create or replace function public.admin_do_espaco(espaco uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.espaco_membros
    where espaco_id = espaco
      and usuario_id = auth.uid()
      and papel in ('proprietario', 'administrador')
  );
$$;

-- Cria o espaço e a primeira associação na mesma transação. Isso evita
-- um intervalo em que o criador ainda não teria permissão de ler o espaço.
create or replace function public.criar_espaco(nome_espaco text, tipo_espaco text)
returns public.espacos
language plpgsql
security definer
set search_path = public
as $$
declare
  novo_espaco public.espacos;
begin
  if auth.uid() is null then
    raise exception 'Autenticação obrigatória.';
  end if;
  if char_length(trim(nome_espaco)) not between 1 and 80 then
    raise exception 'Nome do espaço inválido.';
  end if;
  if tipo_espaco not in ('pessoal', 'casal', 'familia', 'amigos', 'clube', 'outro') then
    raise exception 'Tipo de espaço inválido.';
  end if;

  insert into public.espacos (nome, tipo, criado_por)
  values (trim(nome_espaco), tipo_espaco, auth.uid())
  returning * into novo_espaco;

  insert into public.espaco_membros (espaco_id, usuario_id, papel)
  values (novo_espaco.id, auth.uid(), 'proprietario');

  return novo_espaco;
end;
$$;

revoke all on function public.membro_do_espaco(uuid) from public;
revoke all on function public.admin_do_espaco(uuid) from public;
grant execute on function public.membro_do_espaco(uuid) to authenticated;
grant execute on function public.admin_do_espaco(uuid) to authenticated;
revoke all on function public.criar_espaco(text, text) from public;
grant execute on function public.criar_espaco(text, text) to authenticated;

alter table public.espacos enable row level security;
alter table public.espaco_membros enable row level security;
alter table public.biblioteca_usuario enable row level security;
alter table public.preferencias_usuario enable row level security;

-- Substitui as policies restritas ao casal somente depois de criar e preencher
-- toda a estrutura nova. Nenhuma linha de dados é removida.
drop policy if exists perfis_select on public.perfis;
drop policy if exists perfis_select_proprio on public.perfis;
drop policy if exists perfis_select_compartilhado on public.perfis;
drop policy if exists perfis_update_proprio on public.perfis;

create policy perfis_select_proprio on public.perfis
  for select to authenticated
  using (id = auth.uid());

create policy perfis_select_compartilhado on public.perfis
  for select to authenticated
  using (
    exists (
      select 1
      from public.espaco_membros eu
      join public.espaco_membros outro on outro.espaco_id = eu.espaco_id
      where eu.usuario_id = auth.uid() and outro.usuario_id = perfis.id
    )
  );

create policy perfis_update_proprio on public.perfis
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists espacos_select_membro on public.espacos;
drop policy if exists espacos_insert_proprio on public.espacos;
drop policy if exists espacos_update_admin on public.espacos;
drop policy if exists espacos_delete_dono on public.espacos;

create policy espacos_select_membro on public.espacos
  for select to authenticated using (public.membro_do_espaco(id));
create policy espacos_insert_proprio on public.espacos
  for insert to authenticated with check (criado_por = auth.uid());
create policy espacos_update_admin on public.espacos
  for update to authenticated using (public.admin_do_espaco(id));
create policy espacos_delete_dono on public.espacos
  for delete to authenticated using (criado_por = auth.uid());

drop policy if exists espaco_membros_select on public.espaco_membros;
drop policy if exists espaco_membros_insert_admin on public.espaco_membros;
drop policy if exists espaco_membros_update_admin on public.espaco_membros;
drop policy if exists espaco_membros_delete_admin on public.espaco_membros;

create policy espaco_membros_select on public.espaco_membros
  for select to authenticated using (public.membro_do_espaco(espaco_id));
create policy espaco_membros_insert_admin on public.espaco_membros
  for insert to authenticated with check (public.admin_do_espaco(espaco_id));
create policy espaco_membros_update_admin on public.espaco_membros
  for update to authenticated using (public.admin_do_espaco(espaco_id));
create policy espaco_membros_delete_admin on public.espaco_membros
  for delete to authenticated
  using (public.admin_do_espaco(espaco_id) or usuario_id = auth.uid());

drop policy if exists titulos_select on public.titulos;
drop policy if exists titulos_insert on public.titulos;
drop policy if exists titulos_update on public.titulos;
drop policy if exists titulos_delete on public.titulos;

create policy titulos_select on public.titulos
  for select to authenticated using (public.membro_do_espaco(espaco_id));
create policy titulos_insert on public.titulos
  for insert to authenticated
  with check (public.membro_do_espaco(espaco_id) and criado_por = auth.uid());
create policy titulos_update on public.titulos
  for update to authenticated using (public.membro_do_espaco(espaco_id));
create policy titulos_delete on public.titulos
  for delete to authenticated using (public.admin_do_espaco(espaco_id));

drop policy if exists avaliacoes_select on public.avaliacoes;
drop policy if exists avaliacoes_insert on public.avaliacoes;
drop policy if exists avaliacoes_update on public.avaliacoes;
drop policy if exists avaliacoes_delete on public.avaliacoes;

create policy avaliacoes_select on public.avaliacoes
  for select to authenticated
  using (
    exists (
      select 1 from public.titulos t
      where t.id = avaliacoes.titulo_id
        and public.membro_do_espaco(t.espaco_id)
    )
  );
create policy avaliacoes_insert on public.avaliacoes
  for insert to authenticated
  with check (
    usuario_id = auth.uid()
    and exists (
      select 1 from public.titulos t
      where t.id = avaliacoes.titulo_id
        and public.membro_do_espaco(t.espaco_id)
    )
  );
create policy avaliacoes_update on public.avaliacoes
  for update to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());
create policy avaliacoes_delete on public.avaliacoes
  for delete to authenticated using (usuario_id = auth.uid());

drop policy if exists biblioteca_select on public.biblioteca_usuario;
drop policy if exists biblioteca_insert on public.biblioteca_usuario;
drop policy if exists biblioteca_update on public.biblioteca_usuario;
drop policy if exists biblioteca_delete on public.biblioteca_usuario;

create policy biblioteca_select on public.biblioteca_usuario
  for select to authenticated
  using (
    usuario_id = auth.uid()
    or (
      privacidade = 'espaco'
      and exists (
        select 1
        from public.titulos t
        join public.espaco_membros m on m.espaco_id = t.espaco_id
        where t.id = biblioteca_usuario.titulo_id
          and m.usuario_id = auth.uid()
      )
    )
  );
create policy biblioteca_insert on public.biblioteca_usuario
  for insert to authenticated with check (usuario_id = auth.uid());
create policy biblioteca_update on public.biblioteca_usuario
  for update to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
create policy biblioteca_delete on public.biblioteca_usuario
  for delete to authenticated using (usuario_id = auth.uid());

drop policy if exists preferencias_select on public.preferencias_usuario;
drop policy if exists preferencias_insert on public.preferencias_usuario;
drop policy if exists preferencias_update on public.preferencias_usuario;
drop policy if exists preferencias_delete on public.preferencias_usuario;

create policy preferencias_select on public.preferencias_usuario
  for select to authenticated using (usuario_id = auth.uid());
create policy preferencias_insert on public.preferencias_usuario
  for insert to authenticated with check (usuario_id = auth.uid());
create policy preferencias_update on public.preferencias_usuario
  for update to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
create policy preferencias_delete on public.preferencias_usuario
  for delete to authenticated using (usuario_id = auth.uid());

-- Validações dentro da transação: qualquer divergência desfaz tudo.
do $$
declare
  total_titulos bigint;
  titulos_no_espaco bigint;
  membros_legados bigint;
  copias_biblioteca bigint;
  inventario record;
begin
  select * into inventario from _cine_diario_inventario_antes;
  select count(*) into total_titulos from public.titulos;
  select count(*) into titulos_no_espaco
    from public.titulos
    where espaco_id = '00000000-0000-4000-8000-000000000001'::uuid;
  select count(*) into membros_legados
    from public.espaco_membros
    where espaco_id = '00000000-0000-4000-8000-000000000001'::uuid;
  select count(*) into copias_biblioteca
    from public.biblioteca_usuario b
    join public.titulos t on t.id = b.titulo_id
    where t.espaco_id = '00000000-0000-4000-8000-000000000001'::uuid;

  if total_titulos <> titulos_no_espaco then
    raise exception 'Nem todos os títulos foram associados ao espaço legado.';
  end if;
  if (select count(*) from public.perfis) <> inventario.perfis then
    raise exception 'A quantidade de perfis mudou durante a migração.';
  end if;
  if total_titulos <> inventario.titulos then
    raise exception 'A quantidade de títulos mudou durante a migração.';
  end if;
  if (select count(*) from public.avaliacoes) <> inventario.avaliacoes then
    raise exception 'A quantidade de avaliações mudou durante a migração.';
  end if;
  if membros_legados <> 2 then
    raise exception 'O espaço legado precisa conter exatamente Caio e Noemy.';
  end if;
  if copias_biblioteca <> total_titulos * 2 then
    raise exception 'A biblioteca não preservou todos os títulos para os dois membros.';
  end if;
end
$$;

commit;
