-- Cine Diário: títulos que um usuário não quer receber como recomendação.
-- Preferência pessoal e sincronizada entre dispositivos.

begin;

create table if not exists public.usuario_recomendacoes_bloqueadas (
  usuario_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('filme', 'serie')),
  chave text not null,
  tmdb_id bigint,
  titulo_id uuid references public.titulos(id) on delete set null,
  nome text,
  bloqueado_em timestamptz not null default now(),
  primary key (usuario_id, tipo, chave),
  check (
    (tmdb_id is not null and chave = 'tmdb:' || tmdb_id::text)
    or
    (tmdb_id is null and titulo_id is not null and chave = 'titulo:' || titulo_id::text)
  )
);

create index if not exists usuario_recomendacoes_bloqueadas_usuario_idx
  on public.usuario_recomendacoes_bloqueadas(usuario_id);

alter table public.usuario_recomendacoes_bloqueadas enable row level security;

drop policy if exists recomendacoes_bloqueadas_select_proprio
  on public.usuario_recomendacoes_bloqueadas;
drop policy if exists recomendacoes_bloqueadas_insert_proprio
  on public.usuario_recomendacoes_bloqueadas;
drop policy if exists recomendacoes_bloqueadas_update_proprio
  on public.usuario_recomendacoes_bloqueadas;
drop policy if exists recomendacoes_bloqueadas_delete_proprio
  on public.usuario_recomendacoes_bloqueadas;

create policy recomendacoes_bloqueadas_select_proprio
  on public.usuario_recomendacoes_bloqueadas
  for select to authenticated
  using (usuario_id = auth.uid());

create policy recomendacoes_bloqueadas_insert_proprio
  on public.usuario_recomendacoes_bloqueadas
  for insert to authenticated
  with check (usuario_id = auth.uid());

create policy recomendacoes_bloqueadas_update_proprio
  on public.usuario_recomendacoes_bloqueadas
  for update to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

create policy recomendacoes_bloqueadas_delete_proprio
  on public.usuario_recomendacoes_bloqueadas
  for delete to authenticated
  using (usuario_id = auth.uid());

commit;
