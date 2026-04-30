-- Saved signing profile for managers. Title shows up in the EMPLOYER block
-- of contracts (e.g. "Director", "CEO"); signature_font is the manager's
-- preferred default cursive style so they don't have to pick the same font
-- every time they sign. Both feed the "Activate & sign" panel as defaults
-- and the contract template merge fields ({{employer_title}}) as fallbacks
-- before a signature exists.

alter table public.users
  add column if not exists title text;

alter table public.users
  add column if not exists signature_font text;
