-- Recomendações anônimas entre usuários com histórico realmente compatível.
-- Nenhum identificador de usuário externo é devolvido ao cliente.

begin;

create index if not exists titulos_tipo_tmdb_idx
  on public.titulos(tipo, tmdb_id)
  where tmdb_id is not null;

create or replace function public.sugestoes_usuarios_compativeis(
  p_espaco_id uuid,
  p_tipo text default 'filme',
  p_limite integer default 30
)
returns table (
  tmdb_id bigint,
  tipo text,
  usuarios_compativeis bigint,
  membros_compativeis bigint,
  media_nota numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Autenticação obrigatória.';
  end if;
  if not public.membro_do_espaco(p_espaco_id) then
    raise exception 'Espaço indisponível.';
  end if;
  if p_tipo not in ('filme', 'serie') then
    raise exception 'Tipo de título inválido.';
  end if;

  return query
  with membros_atuais as (
    select em.usuario_id
    from public.espaco_membros em
    where em.espaco_id = p_espaco_id
  ),
  notas_do_espaco as (
    select distinct on (a.usuario_id, t.tmdb_id, t.tipo)
      a.usuario_id,
      t.tmdb_id::bigint as tmdb_id,
      t.tipo,
      a.nota::numeric as nota
    from public.avaliacoes a
    join public.titulos t on t.id = a.titulo_id
    join membros_atuais m on m.usuario_id = a.usuario_id
    where t.espaco_id = p_espaco_id
      and t.tmdb_id is not null
      and coalesce(a.temporada, 0) = 0
    order by a.usuario_id, t.tmdb_id, t.tipo, a.data_avaliacao desc nulls last, a.id desc
  ),
  notas_externas as (
    select distinct on (a.usuario_id, t.tmdb_id, t.tipo)
      a.usuario_id,
      t.tmdb_id::bigint as tmdb_id,
      t.tipo,
      a.nota::numeric as nota
    from public.avaliacoes a
    join public.titulos t on t.id = a.titulo_id
    where t.tmdb_id is not null
      and coalesce(a.temporada, 0) = 0
      and not exists (
        select 1 from membros_atuais m where m.usuario_id = a.usuario_id
      )
    order by a.usuario_id, t.tmdb_id, t.tipo, a.data_avaliacao desc nulls last, a.id desc
  ),
  pares_compativeis as (
    select
      local.usuario_id as membro_id,
      externo.usuario_id as usuario_compativel,
      count(*)::bigint as titulos_em_comum,
      count(*) filter (where local.nota = externo.nota)::bigint as notas_iguais
    from notas_do_espaco local
    join notas_externas externo
      on externo.tmdb_id = local.tmdb_id
      and externo.tipo = local.tipo
    group by local.usuario_id, externo.usuario_id
    having count(*) >= 20
      and count(*) filter (where local.nota = externo.nota)::numeric / count(*)::numeric >= 0.45
  ),
  gostos_compativeis as (
    select
      externo.tmdb_id,
      externo.tipo,
      externo.usuario_id as usuario_compativel,
      par.membro_id,
      externo.nota
    from pares_compativeis par
    join notas_externas externo on externo.usuario_id = par.usuario_compativel
    where externo.nota >= 8
      and externo.tipo = p_tipo
  )
  select
    gosto.tmdb_id,
    gosto.tipo,
    count(distinct gosto.usuario_compativel)::bigint as usuarios_compativeis,
    count(distinct gosto.membro_id)::bigint as membros_compativeis,
    round(avg(gosto.nota), 2) as media_nota
  from gostos_compativeis gosto
  group by gosto.tmdb_id, gosto.tipo
  order by
    count(distinct gosto.membro_id) desc,
    count(distinct gosto.usuario_compativel) desc,
    avg(gosto.nota) desc,
    gosto.tmdb_id
  limit greatest(1, least(coalesce(p_limite, 30), 100));
end;
$$;

comment on function public.sugestoes_usuarios_compativeis(uuid, text, integer) is
  'Retorna apenas agregados de títulos avaliados com nota >= 8 por usuários que tenham ao menos 20 avaliações em comum e 45% de notas exatamente iguais a algum membro do espaço.';

revoke all on function public.sugestoes_usuarios_compativeis(uuid, text, integer) from public;
grant execute on function public.sugestoes_usuarios_compativeis(uuid, text, integer) to authenticated;

commit;
