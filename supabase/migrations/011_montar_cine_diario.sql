-- Guarda o gosto inicial usado pelo Descobrir para usuários novos.

alter table public.perfis
  add column if not exists preferencias_descoberta jsonb not null default '{}'::jsonb;

alter table public.perfis
  add column if not exists onboarding_cine_diario_concluido_em timestamptz;
