-- Estrutura inicial para exclusão de conta confirmada por e-mail.
-- Esta migração não remove dados existentes.
create table if not exists public.solicitacoes_exclusao_conta (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  solicitado_em timestamptz not null default now(),
  expira_em timestamptz not null default (now() + interval '24 hours'),
  confirmado_em timestamptz,
  concluido_em timestamptz,
  cancelado_em timestamptz
);

create index if not exists solicitacoes_exclusao_conta_usuario_idx
  on public.solicitacoes_exclusao_conta (usuario_id, solicitado_em desc);

alter table public.solicitacoes_exclusao_conta enable row level security;

drop policy if exists solicitacoes_exclusao_conta_select_propria
  on public.solicitacoes_exclusao_conta;
create policy solicitacoes_exclusao_conta_select_propria
  on public.solicitacoes_exclusao_conta
  for select to authenticated
  using (usuario_id = auth.uid());

revoke all on public.solicitacoes_exclusao_conta from anon, authenticated;
grant select on public.solicitacoes_exclusao_conta to authenticated;

comment on table public.solicitacoes_exclusao_conta is
  'Solicitações de exclusão confirmadas por e-mail; a execução é feita por função protegida do Supabase.';
