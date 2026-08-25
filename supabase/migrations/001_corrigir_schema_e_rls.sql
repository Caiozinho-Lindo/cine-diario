-- Execute este arquivo uma única vez no SQL Editor do Supabase.
-- Ele corrige a lista "Para assistir", consolida avaliações duplicadas e
-- limita o acesso às duas contas cadastradas na tabela public.perfis.

begin;

alter table public.titulos
  add column if not exists quero_assistir boolean not null default false;

-- PostgreSQL considera valores NULL diferentes em uma restrição UNIQUE.
-- Antes de usar 0 para representar a obra inteira, preservamos somente a
-- avaliação mais recente de cada pessoa caso duplicatas já tenham sido criadas.
with avaliacoes_ordenadas as (
  select
    id,
    row_number() over (
      partition by titulo_id, usuario_id, coalesce(temporada, 0)
      order by data_avaliacao desc, id desc
    ) as posicao
  from public.avaliacoes
)
delete from public.avaliacoes a
using avaliacoes_ordenadas o
where a.id = o.id
  and o.posicao > 1;

update public.avaliacoes
set temporada = 0
where temporada is null;

alter table public.avaliacoes
  alter column temporada set default 0,
  alter column temporada set not null;

alter table public.avaliacoes
  drop constraint if exists avaliacoes_titulo_id_usuario_id_temporada_key;

alter table public.avaliacoes
  drop constraint if exists avaliacoes_titulo_usuario_temporada_unique;

alter table public.avaliacoes
  drop constraint if exists avaliacoes_temporada_check;

alter table public.avaliacoes
  add constraint avaliacoes_temporada_check check (temporada >= 0);

alter table public.avaliacoes
  add constraint avaliacoes_titulo_usuario_temporada_unique
  unique (titulo_id, usuario_id, temporada);

-- Centraliza a verificação de acesso e evita políticas permissivas para
-- qualquer conta autenticada no projeto Supabase.
create or replace function public.usuario_do_casal()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.perfis
    where id = auth.uid()
      and nome in ('caio', 'noemy')
  );
$$;

revoke all on function public.usuario_do_casal() from public;
grant execute on function public.usuario_do_casal() to authenticated;

alter table public.titulos enable row level security;
alter table public.avaliacoes enable row level security;
alter table public.perfis enable row level security;

drop policy if exists perfis_select on public.perfis;
drop policy if exists titulos_select on public.titulos;
drop policy if exists titulos_insert on public.titulos;
drop policy if exists titulos_update on public.titulos;
drop policy if exists titulos_delete on public.titulos;
drop policy if exists avaliacoes_select on public.avaliacoes;
drop policy if exists avaliacoes_insert on public.avaliacoes;
drop policy if exists avaliacoes_update on public.avaliacoes;
drop policy if exists avaliacoes_delete on public.avaliacoes;

create policy perfis_select on public.perfis
  for select to authenticated
  using (public.usuario_do_casal());

create policy titulos_select on public.titulos
  for select to authenticated
  using (public.usuario_do_casal());

create policy titulos_insert on public.titulos
  for insert to authenticated
  with check (public.usuario_do_casal() and criado_por = auth.uid());

create policy titulos_update on public.titulos
  for update to authenticated
  using (public.usuario_do_casal())
  with check (public.usuario_do_casal());

create policy titulos_delete on public.titulos
  for delete to authenticated
  using (public.usuario_do_casal());

create policy avaliacoes_select on public.avaliacoes
  for select to authenticated
  using (public.usuario_do_casal());

create policy avaliacoes_insert on public.avaliacoes
  for insert to authenticated
  with check (public.usuario_do_casal() and usuario_id = auth.uid());

create policy avaliacoes_update on public.avaliacoes
  for update to authenticated
  using (public.usuario_do_casal() and usuario_id = auth.uid())
  with check (public.usuario_do_casal() and usuario_id = auth.uid());

create policy avaliacoes_delete on public.avaliacoes
  for delete to authenticated
  using (public.usuario_do_casal() and usuario_id = auth.uid());

commit;
