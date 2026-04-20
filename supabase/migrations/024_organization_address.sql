alter table public.organizations
  add column if not exists address_street text,
  add column if not exists address_city text,
  add column if not exists address_province text,
  add column if not exists address_postal_code text,
  add column if not exists address_country text not null default 'ID';
