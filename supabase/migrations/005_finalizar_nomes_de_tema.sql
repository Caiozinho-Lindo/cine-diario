-- Execute somente depois que o código novo estiver publicado.
-- Remove a ponte temporária mantida para a versão anterior do site.

begin;

drop function if exists public.criar_espaco(text, text);
alter table public.espacos drop column if exists tipo;

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

commit;
