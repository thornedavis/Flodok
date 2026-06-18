-- NDA signing — server-side, token-validated (mirrors portal_sign_contract, 136).
--
-- Employee portal signing never inserts nda_signatures directly; it calls this
-- SECURITY DEFINER function, which validates the employee slug+token, checks the
-- NDA is addressed to them, in their org, and active, then records the employee
-- signature against the current version. signer_email / signer_phone come from
-- the validated employee row (server-trusted). The 'nda_signed' feed event is a
-- consequence of the row insert (AFTER INSERT trigger), so it fires for every
-- signing path and never double-writes. Employer countersignatures are a direct
-- authenticated insert from the editor and intentionally do NOT emit a feed event.

-- ─── portal_sign_nda ───────────────────────────────────
create or replace function public.portal_sign_nda(
  emp_slug         text,
  emp_token        text,
  p_nda_id         uuid,
  p_typed_name     text,
  p_signature_font text default null,
  p_consent_text   text default null,
  p_document_hash  text default null,
  p_user_agent     text default null
)
returns public.nda_signatures
language plpgsql
security definer
set search_path = public
as $$
declare
  emp     public.employees%rowtype;
  nda     public.ndas%rowtype;
  new_row public.nda_signatures%rowtype;
begin
  -- 1. Portal auth: slug + access_token must match a non-trashed employee.
  select * into emp from public.employees
  where slug = emp_slug and access_token = emp_token and deleted_at is null
  limit 1;
  if emp.id is null then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;

  -- 2. NDA must exist, be addressed to this employee, same org, active.
  select * into nda from public.ndas where id = p_nda_id;
  if nda.id is null or nda.deleted_at is not null then
    raise exception 'NDA not found' using errcode = 'P0002';
  end if;
  if nda.org_id <> emp.org_id then
    raise exception 'NDA belongs to another organisation';
  end if;
  if nda.employee_id <> emp.id then
    raise exception 'This NDA is not addressed to you' using errcode = '42501';
  end if;
  if nda.status <> 'active' then
    raise exception 'NDA is not active and cannot be signed';
  end if;

  -- 3. Insert the employee signature against the current version.
  insert into public.nda_signatures
    (nda_id, version_number, employee_id, typed_name, signature_font,
     signer_role, consent_text, document_hash, user_agent, signer_email, signer_phone)
  values
    (p_nda_id, nda.current_version, emp.id, p_typed_name, p_signature_font,
     'employee', p_consent_text, p_document_hash, p_user_agent, emp.email, emp.phone)
  returning * into new_row;

  -- feed event is emitted by the nda_signatures AFTER INSERT trigger.
  return new_row;
end;
$$;

revoke execute on function public.portal_sign_nda(text, text, uuid, text, text, text, text, text) from public;
grant execute on function public.portal_sign_nda(text, text, uuid, text, text, text, text, text) to anon, authenticated;

-- ─── feed trigger: NDA signed (employee only) ──────────
create or replace function public.tg_feed_nda_signed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  n public.ndas%rowtype;
begin
  select * into n from public.ndas where id = new.nda_id;
  if n.id is null then
    return new;
  end if;
  insert into public.feed_events (org_id, employee_id, event_type, title, description, metadata)
  values (
    n.org_id, new.employee_id, 'nda_signed', n.title,
    'Version ' || new.version_number,
    jsonb_build_object('nda_id', new.nda_id, 'version', new.version_number, 'signature_font', new.signature_font)
  );
  return new;
end;
$$;

drop trigger if exists nda_signatures_feed_signed on public.nda_signatures;
create trigger nda_signatures_feed_signed
  after insert on public.nda_signatures
  for each row
  when (new.signer_role = 'employee')
  execute function public.tg_feed_nda_signed();
