-- Permite excluir um espaço junto com seu catálogo e avaliações relacionadas.
alter table public.titulos
  drop constraint if exists titulos_espaco_id_fkey;

alter table public.titulos
  add constraint titulos_espaco_id_fkey
  foreign key (espaco_id)
  references public.espacos(id)
  on delete cascade;
