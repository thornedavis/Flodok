-- Add a phone number to the signed-in user and to the organization.
-- Stored as E.164 strings (e.g. '+628123456789'), nullable. The existing
-- employees.phone column uses the same format.

alter table public.users
  add column if not exists phone text;

alter table public.organizations
  add column if not exists phone text;
