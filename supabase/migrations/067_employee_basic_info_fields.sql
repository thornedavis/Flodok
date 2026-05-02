-- Expanded "Basic info" fields on employees, modeled on Talenta's HRIS layout.
--
-- Personal data (added):
--   first_name, last_name — split out from the existing `name` column.
--                          The legacy `name` column is kept and is treated as a derived
--                          display name (= first_name + ' ' + last_name). This avoids
--                          touching the many call sites that read `name` (sidebar,
--                          slug generation, avatar gradient, lists, etc.).
--   place_of_birth        — city/town, free text
--   gender                — only male/female per product decision
--   marital_status        — controlled vocab, see check
--   blood_type            — A/B/AB/O × +/-, plus 'unknown'
--   religion              — Indonesia's six recognized religions plus 'other'
--
-- Identity & Address (added):
--   citizen_id_address    — address as printed on the citizen ID card; may differ
--                           from `address` (residential)
--   postal_code           — short text, no validation
--   passport_number       — free text, optional
--   passport_expiry       — date, optional
--
-- All new columns nullable; existing rows get nulls except first_name which is
-- backfilled from `name` (single-word names get last_name = null).

alter table public.employees
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists place_of_birth text,
  add column if not exists gender text
    check (gender is null or gender in ('male', 'female')),
  add column if not exists marital_status text
    check (marital_status is null or marital_status in ('single', 'married', 'divorced', 'widowed')),
  add column if not exists blood_type text
    check (blood_type is null or blood_type in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown')),
  add column if not exists religion text
    check (religion is null or religion in ('islam', 'protestant', 'catholic', 'hindu', 'buddhist', 'confucian', 'other')),
  add column if not exists citizen_id_address text,
  add column if not exists postal_code text,
  add column if not exists passport_number text,
  add column if not exists passport_expiry date;

-- Backfill first_name / last_name from the existing `name` column.
-- Single-word names → first_name = name, last_name = null.
-- Multi-word names  → first_name = first token, last_name = the rest joined.
update public.employees
   set first_name = split_part(name, ' ', 1),
       last_name  = nullif(trim(substring(name from position(' ' in name) + 1)), '')
 where first_name is null
   and name is not null
   and name <> '';
