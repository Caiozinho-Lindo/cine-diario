-- Personalização dos espaços: tipo, capa e tema compartilhado/pessoal.
alter table public.espacos
  add column if not exists tipo text not null default 'pessoal',
  add column if not exists tema text not null default 'cinema',
  add column if not exists modo_tema text not null default 'pessoal';

alter table public.espacos
  drop constraint if exists espacos_tipo_check,
  drop constraint if exists espacos_modo_tema_check;

update public.espacos set tipo = 'pessoal'
where lower(trim(coalesce(tipo, ''))) in ('pessoal', 'individual');
update public.espacos set tipo = 'casal'
where lower(trim(coalesce(tipo, ''))) = 'casal';
update public.espacos set tipo = 'amigos'
where lower(trim(coalesce(tipo, ''))) not in ('pessoal', 'individual', 'casal');

alter table public.espacos
  add constraint espacos_tipo_check check (tipo in ('pessoal', 'casal', 'amigos')),
  add constraint espacos_modo_tema_check check (modo_tema in ('pessoal', 'fixo'));

drop function if exists public.criar_espaco(text);
create or replace function public.criar_espaco(
  nome_espaco text,
  tipo_espaco text default 'pessoal',
  tema_espaco text default 'cinema',
  modo_tema_espaco text default 'pessoal'
)
returns public.espacos
language plpgsql
security definer
set search_path = public
as $$
declare novo_espaco public.espacos;
begin
  if auth.uid() is null then raise exception 'Autenticação obrigatória.'; end if;
  if char_length(trim(nome_espaco)) not between 1 and 80 then raise exception 'Nome do espaço inválido.'; end if;
  if tipo_espaco not in ('pessoal', 'casal', 'amigos') then raise exception 'Tipo de espaço inválido.'; end if;
  if modo_tema_espaco not in ('pessoal', 'fixo') then raise exception 'Modo de tema inválido.'; end if;

  insert into public.espacos (nome, tipo, tema, modo_tema, criado_por)
  values (trim(nome_espaco), tipo_espaco, tema_espaco, modo_tema_espaco, auth.uid())
  returning * into novo_espaco;

  insert into public.espaco_membros (espaco_id, usuario_id, papel)
  values (novo_espaco.id, auth.uid(), 'administrador');
  return novo_espaco;
end;
$$;

drop policy if exists espacos_update_criador on public.espacos;
create policy espacos_update_admin on public.espacos
  for update to authenticated
  using (public.admin_do_espaco(id))
  with check (public.admin_do_espaco(id));

grant execute on function public.criar_espaco(text, text, text, text) to authenticated;
