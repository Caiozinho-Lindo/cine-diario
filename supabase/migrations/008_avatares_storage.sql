-- Cine Diário: fotos de perfil enviadas pelo próprio dispositivo.
-- Cria um bucket público para leitura dos avatares e restringe escrita/exclusão
-- à pasta do usuário autenticado.

begin;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'avatars',
  'avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $migracao$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'avatares_leitura_publica'
  ) then
    execute $politica$
      create policy avatares_leitura_publica on storage.objects
        for select to public using (bucket_id = 'avatars')
    $politica$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'avatares_inserir_proprio'
  ) then
    execute $politica$
      create policy avatares_inserir_proprio on storage.objects
        for insert to authenticated
        with check (
          bucket_id = 'avatars'
          and (storage.foldername(name))[1] = auth.uid()::text
        )
    $politica$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'avatares_atualizar_proprio'
  ) then
    execute $politica$
      create policy avatares_atualizar_proprio on storage.objects
        for update to authenticated
        using (
          bucket_id = 'avatars'
          and (storage.foldername(name))[1] = auth.uid()::text
        )
        with check (
          bucket_id = 'avatars'
          and (storage.foldername(name))[1] = auth.uid()::text
        )
    $politica$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'avatares_excluir_proprio'
  ) then
    execute $politica$
      create policy avatares_excluir_proprio on storage.objects
        for delete to authenticated
        using (
          bucket_id = 'avatars'
          and (storage.foldername(name))[1] = auth.uid()::text
        )
    $politica$;
  end if;
end
$migracao$;

commit;
