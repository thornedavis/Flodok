-- Portal credential hardening (H6 entropy + H7 revocation).
--
-- H6: the portal access_token was a 6-char base36 value (~2^31, modulo-biased)
-- minted CLIENT-SIDE — brute-forceable against the anon portal RPCs, which have
-- no rate-limiting. Mint a 256-bit opaque token SERVER-SIDE by default, and
-- regenerate every existing token. (Pre-onboarding: only test data exists, so
-- outstanding portal links are simply re-shared from the dashboard afterwards.)
--
-- H7: the token was never rotated, so a separated/trashed employee's portal
-- link kept resolving (and could still sign) until the 30-day purge. Rotate it
-- on separation/trash, which instantly kills the old link across EVERY portal
-- RPC at once (they all match on access_token).

-- Strong, opaque token generator. Uses gen_random_uuid() (always available,
-- already used throughout) so it never depends on pgcrypto's schema location.
-- Two UUIDs, dashes stripped -> 64 hex chars (~256 bits).
create or replace function public.gen_portal_token()
returns text
language sql
volatile
set search_path = public
as $$
  select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
$$;

-- New rows get a strong token even if the client omits it.
alter table public.employees
  alter column access_token set default public.gen_portal_token();

-- Regenerate all existing tokens (test data only; links re-shared after deploy).
update public.employees
  set access_token = public.gen_portal_token();

-- Rotate on offboarding so the old portal link dies immediately.
create or replace function public.rotate_portal_token_on_offboard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.deleted_at is not null and old.deleted_at is null)
     or (new.lifecycle_stage = 'separated'
         and old.lifecycle_stage is distinct from 'separated')
  then
    new.access_token := public.gen_portal_token();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_rotate_portal_token on public.employees;
create trigger trg_rotate_portal_token
  before update on public.employees
  for each row
  execute function public.rotate_portal_token_on_offboard();
