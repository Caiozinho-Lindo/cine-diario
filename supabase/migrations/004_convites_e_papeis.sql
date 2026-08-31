-- Cine Diário: convites por código/link e papéis simplificados.
-- Execute depois de 002_multiusuario_espacos.sql.

begin;

-- Tipos de espaço e página inicial deixaram de ter significado no produto.
drop function if exists public.criar_espaco(text, text);
alter table public.espacos drop column if exists tipo;
alter table public.perfis drop column if exists pagina_inicial;
alter table public.preferencias_usuario drop column if exists pagina_inicial;

-- Mantém a aparência escolhida, usando nomes de tema independentes de pessoas.
update public.perfis
set tema = case tema
  when 'caio' then 'azul'
  when 'noemy' then 'lavanda'
  when 'casal' then 'cinema'
  else tema
end;
update public.preferencias_usuario
set tema = case tema
  when 'caio' then 'azul'
  when 'noemy' then 'lavanda'
  when 'casal' then 'cinema'
  else tema
end;
alter table public.perfis alter column tema set default 'cinema';
alter table public.preferencias_usuario alter column tema set default 'cinema';

-- O papel controla somente a gestão de participantes.
do $$
declare
  restricao record;
begin
  for restricao in
    select conname
    from pg_constraint
    where conrelid = 'public.espaco_membros'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%papel%'
  loop
    execute format('alter table public.espaco_membros drop constraint %I', restricao.conname);
  end loop;
end
$$;

update public.espaco_membros
set papel = case
  when papel in ('proprietario', 'administrador') then 'administrador'
  else 'participante'
end;

alter table public.espaco_membros
  alter column papel set default 'participante';
alter table public.espaco_membros
  add constraint espaco_membros_papel_check
  check (papel in ('administrador', 'participante'));

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
      and papel = 'administrador'
  );
$$;

create or replace function public.criar_espaco(nome_espaco text)
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

  insert into public.espacos (nome, criado_por)
  values (trim(nome_espaco), auth.uid())
  returning * into novo_espaco;

  insert into public.espaco_membros (espaco_id, usuario_id, papel)
  values (novo_espaco.id, auth.uid(), 'administrador');

  return novo_espaco;
end;
$$;

-- Novas contas continuam recebendo um espaço próprio, sem classificação.
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
    'cinema'
  )
  on conflict (id) do nothing;

  insert into public.preferencias_usuario (usuario_id)
  values (new.id)
  on conflict (usuario_id) do nothing;

  insert into public.espacos (nome, criado_por)
  values ('Meu Cine Diário', new.id)
  returning id into novo_espaco_id;

  insert into public.espaco_membros (espaco_id, usuario_id, papel)
  values (novo_espaco_id, new.id, 'administrador');

  return new;
end;
$$;

create table if not exists public.espaco_convites (
  espaco_id uuid primary key references public.espacos(id) on delete cascade,
  codigo text not null unique check (codigo ~ '^[A-Z0-9]{12}$'),
  criado_por uuid not null references auth.users(id),
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null
);

create index if not exists espaco_convites_codigo_idx
  on public.espaco_convites(codigo);

alter table public.espaco_convites enable row level security;

drop policy if exists espaco_convites_select_admin on public.espaco_convites;
create policy espaco_convites_select_admin on public.espaco_convites
  for select to authenticated using (public.admin_do_espaco(espaco_id));

-- Somente o criador altera nome ou exclui o espaço. O papel não interfere nisso.
drop policy if exists espacos_update_admin on public.espacos;
drop policy if exists espacos_update_criador on public.espacos;
create policy espacos_update_criador on public.espacos
  for update to authenticated
  using (criado_por = auth.uid())
  with check (criado_por = auth.uid());

-- Membros são gerenciados exclusivamente pelas funções seguras abaixo.
drop policy if exists espaco_membros_insert_admin on public.espaco_membros;
drop policy if exists espaco_membros_update_admin on public.espaco_membros;
drop policy if exists espaco_membros_delete_admin on public.espaco_membros;

-- Excluir títulos não depende do papel administrativo do espaço.
drop policy if exists titulos_delete on public.titulos;
create policy titulos_delete on public.titulos
  for delete to authenticated
  using (public.membro_do_espaco(espaco_id));

create or replace function public.criar_convite_espaco(p_espaco_id uuid)
returns table (codigo text, expira_em timestamptz, nome_espaco text)
language plpgsql
security definer
set search_path = public
as $$
declare
  novo_codigo text;
begin
  if not public.admin_do_espaco(p_espaco_id) then
    raise exception 'Somente administradores podem criar convites.';
  end if;

  novo_codigo := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));

  insert into public.espaco_convites (espaco_id, codigo, criado_por, criado_em, expira_em)
  values (p_espaco_id, novo_codigo, auth.uid(), now(), now() + interval '7 days')
  on conflict (espaco_id) do update
  set codigo = excluded.codigo,
      criado_por = excluded.criado_por,
      criado_em = excluded.criado_em,
      expira_em = excluded.expira_em;

  return query
  select c.codigo, c.expira_em, e.nome
  from public.espaco_convites c
  join public.espacos e on e.id = c.espaco_id
  where c.espaco_id = p_espaco_id;
end;
$$;

create or replace function public.consultar_convite_espaco(p_codigo text)
returns table (espaco_id uuid, nome_espaco text, expira_em timestamptz, ja_membro boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Autenticação obrigatória.';
  end if;

  return query
  select e.id,
         e.nome,
         c.expira_em,
         exists (
           select 1 from public.espaco_membros m
           where m.espaco_id = e.id and m.usuario_id = auth.uid()
         )
  from public.espaco_convites c
  join public.espacos e on e.id = c.espaco_id
  where c.codigo = upper(trim(p_codigo))
    and c.expira_em > now();
end;
$$;

create or replace function public.entrar_espaco_por_codigo(p_codigo text)
returns public.espacos
language plpgsql
security definer
set search_path = public
as $$
declare
  espaco_encontrado public.espacos;
begin
  if auth.uid() is null then
    raise exception 'Autenticação obrigatória.';
  end if;

  select e.* into espaco_encontrado
  from public.espaco_convites c
  join public.espacos e on e.id = c.espaco_id
  where c.codigo = upper(trim(p_codigo))
    and c.expira_em > now();

  if espaco_encontrado.id is null then
    raise exception 'Convite inválido ou expirado.';
  end if;

  insert into public.espaco_membros (espaco_id, usuario_id, papel)
  values (espaco_encontrado.id, auth.uid(), 'participante')
  on conflict (espaco_id, usuario_id) do nothing;

  return espaco_encontrado;
end;
$$;

create or replace function public.atualizar_papel_membro(
  p_espaco_id uuid,
  p_usuario_id uuid,
  p_papel text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.admin_do_espaco(p_espaco_id) then
    raise exception 'Somente administradores podem alterar papéis.';
  end if;
  if p_papel not in ('administrador', 'participante') then
    raise exception 'Papel inválido.';
  end if;
  if p_usuario_id = auth.uid() then
    raise exception 'Você não pode alterar o próprio papel.';
  end if;
  if exists (
    select 1 from public.espacos
    where id = p_espaco_id and criado_por = p_usuario_id
  ) then
    raise exception 'O criador do espaço deve permanecer administrador.';
  end if;

  update public.espaco_membros
  set papel = p_papel
  where espaco_id = p_espaco_id and usuario_id = p_usuario_id;

  if not found then raise exception 'Participante não encontrado.'; end if;
end;
$$;

create or replace function public.remover_membro_espaco(
  p_espaco_id uuid,
  p_usuario_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.admin_do_espaco(p_espaco_id) then
    raise exception 'Somente administradores podem remover participantes.';
  end if;
  if p_usuario_id = auth.uid() then
    raise exception 'Use a opção Sair do espaço.';
  end if;
  if exists (
    select 1 from public.espacos
    where id = p_espaco_id and criado_por = p_usuario_id
  ) then
    raise exception 'O criador do espaço não pode ser removido.';
  end if;

  delete from public.espaco_membros
  where espaco_id = p_espaco_id and usuario_id = p_usuario_id;

  if not found then raise exception 'Participante não encontrado.'; end if;
end;
$$;

create or replace function public.sair_do_espaco(p_espaco_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.espacos
    where id = p_espaco_id and criado_por = auth.uid()
  ) then
    raise exception 'O criador deve excluir o espaço em vez de sair.';
  end if;

  delete from public.espaco_membros
  where espaco_id = p_espaco_id and usuario_id = auth.uid();

  if not found then raise exception 'Você não participa deste espaço.'; end if;
end;
$$;

revoke all on function public.criar_espaco(text) from public;
revoke all on function public.criar_convite_espaco(uuid) from public;
revoke all on function public.consultar_convite_espaco(text) from public;
revoke all on function public.entrar_espaco_por_codigo(text) from public;
revoke all on function public.atualizar_papel_membro(uuid, uuid, text) from public;
revoke all on function public.remover_membro_espaco(uuid, uuid) from public;
revoke all on function public.sair_do_espaco(uuid) from public;

grant execute on function public.criar_espaco(text) to authenticated;
grant execute on function public.criar_convite_espaco(uuid) to authenticated;
grant execute on function public.consultar_convite_espaco(text) to authenticated;
grant execute on function public.entrar_espaco_por_codigo(text) to authenticated;
grant execute on function public.atualizar_papel_membro(uuid, uuid, text) to authenticated;
grant execute on function public.remover_membro_espaco(uuid, uuid) to authenticated;
grant execute on function public.sair_do_espaco(uuid) to authenticated;

do $$
begin
  if exists (
    select 1 from public.espaco_membros
    where papel not in ('administrador', 'participante')
  ) then
    raise exception 'Ainda existem papéis antigos em espaco_membros.';
  end if;

  if exists (
    select 1
    from public.espacos e
    left join public.espaco_membros m
      on m.espaco_id = e.id
     and m.usuario_id = e.criado_por
     and m.papel = 'administrador'
    where m.usuario_id is null
  ) then
    raise exception 'Todo criador de espaço deve permanecer administrador.';
  end if;
end
$$;

commit;
