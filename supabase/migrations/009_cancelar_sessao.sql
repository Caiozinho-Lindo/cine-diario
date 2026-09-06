-- Cine Diário: permite descartar uma escolha pendente sem remover o título.

begin;

create or replace function public.cancelar_sessao(p_sessao_id uuid)
returns public.sessoes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sessao public.sessoes;
begin
  if auth.uid() is null then
    raise exception 'Autenticação obrigatória.';
  end if;

  select * into v_sessao
  from public.sessoes
  where id = p_sessao_id;

  if v_sessao.id is null then
    raise exception 'Sessão não encontrada.';
  end if;
  if v_sessao.status <> 'pendente' then
    return v_sessao;
  end if;
  if v_sessao.criado_por <> auth.uid()
    and not public.admin_do_espaco(v_sessao.espaco_id) then
    raise exception 'Somente quem fez a escolha ou um administrador pode cancelá-la.';
  end if;

  update public.sessoes
  set status = 'cancelada'
  where id = p_sessao_id
  returning * into v_sessao;

  return v_sessao;
end;
$$;

revoke all on function public.cancelar_sessao(uuid) from public;
grant execute on function public.cancelar_sessao(uuid) to authenticated;

commit;
