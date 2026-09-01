-- Cine Diário: streamings por usuário e sessões pendentes do recomendador.
-- Execute depois de 004_convites_e_papeis.sql. É compatível com a ponte da 005.

begin;

create table if not exists public.usuario_streamings (
  usuario_id uuid not null references auth.users(id) on delete cascade,
  servico text not null check (servico in (
    'netflix',
    'prime-video',
    'disney-plus',
    'max',
    'globoplay',
    'apple-tv-plus',
    'paramount-plus'
  )),
  criado_em timestamptz not null default now(),
  primary key (usuario_id, servico)
);

create table if not exists public.sessoes (
  id uuid primary key default gen_random_uuid(),
  espaco_id uuid not null references public.espacos(id) on delete cascade,
  titulo_id uuid not null references public.titulos(id) on delete cascade,
  criado_por uuid not null references auth.users(id),
  status text not null default 'pendente'
    check (status in ('pendente', 'confirmada', 'cancelada')),
  criado_em timestamptz not null default now(),
  confirmado_em timestamptz
);

create table if not exists public.sessao_participantes (
  sessao_id uuid not null references public.sessoes(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  confirmado_em timestamptz,
  primary key (sessao_id, usuario_id)
);

alter table public.sessao_participantes
  add column if not exists confirmado_em timestamptz;

create unique index if not exists sessoes_pendente_por_espaco_idx
  on public.sessoes(espaco_id)
  where status = 'pendente';
create index if not exists sessoes_titulo_idx on public.sessoes(titulo_id);
create index if not exists sessao_participantes_usuario_idx
  on public.sessao_participantes(usuario_id);

alter table public.usuario_streamings enable row level security;
alter table public.sessoes enable row level security;
alter table public.sessao_participantes enable row level security;

drop policy if exists usuario_streamings_select_compartilhado on public.usuario_streamings;
drop policy if exists usuario_streamings_insert_proprio on public.usuario_streamings;
drop policy if exists usuario_streamings_delete_proprio on public.usuario_streamings;

create policy usuario_streamings_select_compartilhado on public.usuario_streamings
  for select to authenticated
  using (
    usuario_id = auth.uid()
    or exists (
      select 1
      from public.espaco_membros eu
      join public.espaco_membros outro on outro.espaco_id = eu.espaco_id
      where eu.usuario_id = auth.uid()
        and outro.usuario_id = usuario_streamings.usuario_id
    )
  );
create policy usuario_streamings_insert_proprio on public.usuario_streamings
  for insert to authenticated with check (usuario_id = auth.uid());
create policy usuario_streamings_delete_proprio on public.usuario_streamings
  for delete to authenticated using (usuario_id = auth.uid());

create or replace function public.salvar_meus_streamings(p_servicos text[])
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_servico text;
begin
  if auth.uid() is null then raise exception 'Autenticação obrigatória.'; end if;

  delete from public.usuario_streamings where usuario_id = auth.uid();
  foreach v_servico in array coalesce(p_servicos, '{}'::text[]) loop
    insert into public.usuario_streamings (usuario_id, servico)
    values (auth.uid(), v_servico)
    on conflict do nothing;
  end loop;
  return coalesce(p_servicos, '{}'::text[]);
end;
$$;

drop policy if exists sessoes_select_membro on public.sessoes;
create policy sessoes_select_membro on public.sessoes
  for select to authenticated using (public.membro_do_espaco(espaco_id));

drop policy if exists sessao_participantes_select_membro on public.sessao_participantes;
create policy sessao_participantes_select_membro on public.sessao_participantes
  for select to authenticated
  using (
    exists (
      select 1 from public.sessoes s
      where s.id = sessao_participantes.sessao_id
        and public.membro_do_espaco(s.espaco_id)
    )
  );

create or replace function public.criar_sessao_pendente(
  p_titulo_id uuid,
  p_participantes uuid[]
)
returns public.sessoes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_espaco_id uuid;
  v_sessao public.sessoes;
  v_participante uuid;
begin
  if auth.uid() is null then
    raise exception 'Autenticação obrigatória.';
  end if;

  select espaco_id into v_espaco_id
  from public.titulos
  where id = p_titulo_id;

  if v_espaco_id is null or not public.membro_do_espaco(v_espaco_id) then
    raise exception 'Título indisponível neste espaço.';
  end if;
  if p_participantes is null or array_length(p_participantes, 1) is null then
    raise exception 'Escolha ao menos um participante.';
  end if;
  if not auth.uid() = any(p_participantes) then
    raise exception 'A pessoa que está escolhendo deve participar da sessão.';
  end if;
  if exists (
    select 1 from unnest(p_participantes) as participante(usuario_id)
    where not exists (
      select 1 from public.espaco_membros m
      where m.espaco_id = v_espaco_id and m.usuario_id = participante.usuario_id
    )
  ) then
    raise exception 'Todos os participantes devem pertencer ao espaço.';
  end if;

  update public.sessoes
  set status = 'cancelada'
  where espaco_id = v_espaco_id and status = 'pendente';

  insert into public.sessoes (espaco_id, titulo_id, criado_por)
  values (v_espaco_id, p_titulo_id, auth.uid())
  returning * into v_sessao;

  foreach v_participante in array p_participantes loop
    insert into public.sessao_participantes (sessao_id, usuario_id)
    values (v_sessao.id, v_participante)
    on conflict do nothing;
  end loop;

  return v_sessao;
end;
$$;

create or replace function public.confirmar_sessao(p_sessao_id uuid)
returns public.sessoes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sessao public.sessoes;
begin
  select * into v_sessao from public.sessoes where id = p_sessao_id;
  if v_sessao.id is null then raise exception 'Sessão não encontrada.'; end if;
  if v_sessao.status <> 'pendente' then return v_sessao; end if;
  if not exists (
    select 1 from public.sessao_participantes
    where sessao_id = p_sessao_id and usuario_id = auth.uid()
  ) then
    raise exception 'Você não participa desta sessão.';
  end if;

  update public.sessao_participantes
  set confirmado_em = coalesce(confirmado_em, now())
  where sessao_id = p_sessao_id and usuario_id = auth.uid();

  if not exists (
    select 1 from public.sessao_participantes
    where sessao_id = p_sessao_id and confirmado_em is null
  ) then
    update public.sessoes
    set status = 'confirmada', confirmado_em = now()
    where id = p_sessao_id
    returning * into v_sessao;
  end if;
  return v_sessao;
end;
$$;

revoke all on function public.criar_sessao_pendente(uuid, uuid[]) from public;
revoke all on function public.confirmar_sessao(uuid) from public;
revoke all on function public.salvar_meus_streamings(text[]) from public;
grant execute on function public.criar_sessao_pendente(uuid, uuid[]) to authenticated;
grant execute on function public.confirmar_sessao(uuid) to authenticated;
grant execute on function public.salvar_meus_streamings(text[]) to authenticated;

commit;
