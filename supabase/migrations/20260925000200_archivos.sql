-- =====================================================================
-- Vidriera · migración 2 · archivos (fotos de perfil y de productos)
-- Bucket público "media". Ruta de cada archivo: pages/<id de página>/<nombre>
-- Solo quien puede editar la página puede subir, reemplazar o borrar.
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "subir fotos a mis páginas" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'pages'
    and public.can_edit_page(public.try_uuid((storage.foldername(name))[2])));

create policy "reemplazar fotos de mis páginas" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'pages'
    and public.can_edit_page(public.try_uuid((storage.foldername(name))[2])))
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'pages'
    and public.can_edit_page(public.try_uuid((storage.foldername(name))[2])));

create policy "borrar fotos de mis páginas" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'pages'
    and public.can_edit_page(public.try_uuid((storage.foldername(name))[2])));
