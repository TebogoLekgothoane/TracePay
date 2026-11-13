-- Public CDN-style assets for the mobile app (illustrations, static images).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'app-assets',
  'app-assets',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update
set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "app assets are publicly readable" on storage.objects;
create policy "app assets are publicly readable"
  on storage.objects
  for select
  using (bucket_id = 'app-assets');
