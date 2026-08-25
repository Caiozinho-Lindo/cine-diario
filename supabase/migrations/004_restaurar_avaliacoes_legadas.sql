-- Restaura a exibição das avaliações legadas sem perder versões anteriores.
--
-- Antes desta correção, temporada NULL permitia mais de uma avaliação para a
-- mesma obra e pessoa. A aplicação atual usa temporada 0 para a obra inteira.
-- Mantemos como avaliação ativa a inserção mais recente e arquivamos todas as
-- versões anteriores, inclusive quando a nota é idêntica.

begin;

create table if not exists public.avaliacoes_historico_migracao (
  original_avaliacao_id uuid primary key,
  titulo_id uuid not null,
  usuario_id uuid not null,
  temporada integer,
  nota numeric(3,1) not null,
  observacao text,
  data_avaliacao date not null,
  motivo text not null,
  arquivado_em timestamptz not null default now()
);

alter table public.avaliacoes_historico_migracao enable row level security;
revoke all on table public.avaliacoes_historico_migracao from anon, authenticated;

-- O SQL Editor pode alternar a sessão entre statements; por isso estas tabelas
-- transitórias são comuns e removidas antes do COMMIT, em vez de serem TEMP.
create table public.cinediarioavaliacoesantes004 as
select count(*)::bigint as total
from public.avaliacoes;

create table public.cinediarioavaliacoesduplicadas004 as
select id
from (
  select
    id,
    row_number() over (
      partition by titulo_id, usuario_id, coalesce(temporada, 0)
      order by
        data_avaliacao desc,
        xmin::text::bigint desc,
        ctid desc
    ) as posicao
  from public.avaliacoes
) ordenadas
where posicao > 1;

insert into public.avaliacoes_historico_migracao (
  original_avaliacao_id,
  titulo_id,
  usuario_id,
  temporada,
  nota,
  observacao,
  data_avaliacao,
  motivo
)
select
  a.id,
  a.titulo_id,
  a.usuario_id,
  a.temporada,
  a.nota,
  a.observacao,
  a.data_avaliacao,
  'Versão anterior preservada ao normalizar temporada NULL para 0'
from public.avaliacoes a
join public.cinediarioavaliacoesduplicadas004 d on d.id = a.id
on conflict (original_avaliacao_id) do nothing;

delete from public.avaliacoes a
using public.cinediarioavaliacoesduplicadas004 d
where a.id = d.id;

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

do $$
declare
  total_antes bigint;
  total_ativo bigint;
  total_arquivado_desta_correcao bigint;
  temporadas_nulas bigint;
begin
  select total into total_antes
  from public.cinediarioavaliacoesantes004;
  select count(*) into total_ativo from public.avaliacoes;
  select count(*) into total_arquivado_desta_correcao
  from public.avaliacoes_historico_migracao h
  join public.cinediarioavaliacoesduplicadas004 d
    on d.id = h.original_avaliacao_id;
  select count(*) into temporadas_nulas
  from public.avaliacoes
  where temporada is null;

  if total_ativo + total_arquivado_desta_correcao <> total_antes then
    raise exception
      'Falha de preservação: antes %, ativas %, arquivadas %',
      total_antes, total_ativo, total_arquivado_desta_correcao;
  end if;

  if temporadas_nulas <> 0 then
    raise exception 'Ainda existem % avaliações com temporada NULL', temporadas_nulas;
  end if;
end;
$$;

drop table public.cinediarioavaliacoesduplicadas004;
drop table public.cinediarioavaliacoesantes004;

commit;
