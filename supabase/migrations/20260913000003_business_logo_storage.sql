-- Logo upload: businesses.logo_url already existed in the schema with no
-- way to set it from the UI. Storage bucket + RLS so an owner can upload
-- their own logo and it's publicly readable on the booking page.
insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

-- Objects are stored as "<business_id>/<filename>" — policies check that
-- the first path segment is a business the caller owns.
create policy "Business owners manage their own logo"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'logos' and public.is_business_owner((storage.foldername(name))[1]::uuid))
  with check (bucket_id = 'logos' and public.is_business_owner((storage.foldername(name))[1]::uuid));

create policy "Logos are publicly readable"
  on storage.objects for select
  to anon
  using (bucket_id = 'logos');
