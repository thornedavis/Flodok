-- Add photo_url to users so the signed-in user can upload an account avatar.
-- Storage uses the existing 'avatars' bucket (created in 005_avatars_bucket.sql)
-- under the path avatars/user/<user_id>.<ext>. Organization logos reuse the
-- existing organizations.logo_url column and avatars/org/<org_id>.<ext>.

alter table public.users
  add column if not exists photo_url text;
