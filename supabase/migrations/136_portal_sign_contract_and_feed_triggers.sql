-- Portal RLS hardening — Stage A: move signing fully server-side.
--
-- Today the portal (and candidate onboarding) sign contracts by a direct anon
-- INSERT into contract_signatures, and write the "signed" feed events by a
-- direct anon INSERT into feed_events. Both rely on permissive anon policies
-- that Stage D will drop. This migration moves those server-side:
--
--   1. portal_sign_contract(): token-validated SECURITY DEFINER insert of the
--      employee's contract signature (mirrors portal_sign_sop from 117). The
--      front end stops inserting contract_signatures directly.
--
--   2. AFTER INSERT triggers on sop_signatures and contract_signatures emit the
--      sop_signed / contract_signed feed events. Making the feed event a
--      consequence of the signature row (rather than a separate client insert)
--      means it fires for every signing path — portal SOP signing
--      (portal_sign_sop), portal contract signing (portal_sign_contract), and
--      candidate-onboarding contract signing — so the front end stops inserting
--      these feed_events rows directly, letting Stage D drop the anon
--      feed_events INSERT policy. contract_signatures fires only for the
--      employee's own signature, never the employer countersignature.
--
-- NOTE: this migration is coupled to the Portal.tsx / CandidateOnboarding.tsx
-- change that removes the direct inserts. Apply + deploy them together, or
-- signing will briefly create duplicate feed events.

-- ─── portal_sign_contract ──────────────────────────────

create or replace function public.portal_sign_contract(
  emp_slug         text,
  emp_token        text,
  p_contract_id    uuid,
  p_typed_name     text,
  p_signature_font text default null,
  p_consent_text   text default null,
  p_document_hash  text default null,
  p_user_agent     text default null
)
returns public.contract_signatures
language plpgsql
security definer
set search_path = public
as $$
declare
  emp     public.employees%rowtype;
  con     public.contracts%rowtype;
  new_row public.contract_signatures%rowtype;
begin
  -- 1. Portal auth: slug + access_token must match a non-trashed employee.
  select * into emp from public.employees
  where slug = emp_slug and access_token = emp_token and deleted_at is null
  limit 1;
  if emp.id is null then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;

  -- 2. Contract must exist, be addressed to this employee, same org, active.
  select * into con from public.contracts where id = p_contract_id;
  if con.id is null or con.deleted_at is not null then
    raise exception 'Contract not found' using errcode = 'P0002';
  end if;
  if con.org_id <> emp.org_id then
    raise exception 'Contract belongs to another organisation';
  end if;
  if con.employee_id <> emp.id then
    raise exception 'This contract is not addressed to you' using errcode = '42501';
  end if;
  if con.status <> 'active' then
    raise exception 'Contract is not active and cannot be signed';
  end if;

  -- 3. Insert the employee signature against the current version. signer_email /
  --    signer_phone come from the validated employee row (server-trusted); the
  --    evidentiary fields (typed_name, font, consent, hash, user_agent) are
  --    client-supplied, mirroring the prior direct insert. IP is stamped
  --    afterwards by the sign-contract-ip edge function (unchanged).
  insert into public.contract_signatures
    (contract_id, version_number, employee_id, typed_name, signature_font,
     signer_role, consent_text, document_hash, user_agent, signer_email, signer_phone)
  values
    (p_contract_id, con.current_version, emp.id, p_typed_name, p_signature_font,
     'employee', p_consent_text, p_document_hash, p_user_agent, emp.email, emp.phone)
  returning * into new_row;

  -- feed event is emitted by the contract_signatures AFTER INSERT trigger.
  return new_row;
end;
$$;

revoke execute on function public.portal_sign_contract(text, text, uuid, text, text, text, text, text) from public;
grant execute on function public.portal_sign_contract(text, text, uuid, text, text, text, text, text) to anon, authenticated;

-- ─── feed trigger: SOP signed ──────────────────────────

create or replace function public.tg_feed_sop_signed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.sops%rowtype;
begin
  select * into s from public.sops where id = new.sop_id;
  if s.id is null then
    return new;
  end if;
  insert into public.feed_events (org_id, employee_id, event_type, title, description, metadata)
  values (
    s.org_id, new.employee_id, 'sop_signed', s.title,
    'Version ' || new.version_number,
    jsonb_build_object('sop_id', new.sop_id, 'version', new.version_number, 'signature_font', new.signature_font)
  );
  return new;
end;
$$;

drop trigger if exists sop_signatures_feed_signed on public.sop_signatures;
create trigger sop_signatures_feed_signed
  after insert on public.sop_signatures
  for each row
  execute function public.tg_feed_sop_signed();

-- ─── feed trigger: contract signed (employee only) ─────

create or replace function public.tg_feed_contract_signed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.contracts%rowtype;
begin
  select * into c from public.contracts where id = new.contract_id;
  if c.id is null then
    return new;
  end if;
  insert into public.feed_events (org_id, employee_id, event_type, title, description, metadata)
  values (
    c.org_id, new.employee_id, 'contract_signed', c.title,
    'Version ' || new.version_number,
    jsonb_build_object('contract_id', new.contract_id, 'version', new.version_number, 'signature_font', new.signature_font)
  );
  return new;
end;
$$;

drop trigger if exists contract_signatures_feed_signed on public.contract_signatures;
create trigger contract_signatures_feed_signed
  after insert on public.contract_signatures
  for each row
  when (new.signer_role = 'employee')
  execute function public.tg_feed_contract_signed();
