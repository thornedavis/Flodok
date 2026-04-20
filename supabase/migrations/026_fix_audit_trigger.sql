-- Fix bug in tg_org_integrations_audit from migration 023.
--
-- The trigger used `changed || 'col_name'` to append strings to a text[]
-- array. Postgres' operator resolution here falls back to text-concat, which
-- calls array_out() on the array and then tries to parse the string back as
-- an array literal — failing with "malformed array literal". Any UPDATE to
-- an org_integrations row was broken as a result.
--
-- Fix: use array_append() explicitly.

create or replace function public.tg_org_integrations_audit()
returns trigger
language plpgsql
security definer
as $$
declare
  changed text[] := array[]::text[];
  act text;
begin
  if tg_op = 'INSERT' then
    act := 'create';
    insert into public.org_integrations_audit (
      org_id, integration_id, provider, action, actor_user_id, changed_fields, detail
    ) values (
      new.org_id, new.id, new.provider, act, new.created_by, null,
      jsonb_build_object('status', new.status)
    );
    return new;
  elsif tg_op = 'UPDATE' then
    if new.credentials_encrypted is distinct from old.credentials_encrypted then
      changed := array_append(changed, 'credentials_encrypted');
    end if;
    if new.config is distinct from old.config then
      changed := array_append(changed, 'config');
    end if;
    if new.status is distinct from old.status then
      changed := array_append(changed, 'status');
    end if;
    if new.last_error is distinct from old.last_error then
      changed := array_append(changed, 'last_error');
    end if;
    if new.last_verified_at is distinct from old.last_verified_at then
      changed := array_append(changed, 'last_verified_at');
    end if;

    if 'credentials_encrypted' = any(changed) then
      act := 'rotate';
    elsif 'status' = any(changed) then
      act := 'status_change';
    elsif array_length(changed, 1) is null then
      return new;
    else
      act := 'update';
    end if;

    insert into public.org_integrations_audit (
      org_id, integration_id, provider, action, actor_user_id, changed_fields, detail
    ) values (
      new.org_id, new.id, new.provider, act, auth.uid(), changed,
      jsonb_build_object(
        'old_status', old.status,
        'new_status', new.status
      )
    );
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.org_integrations_audit (
      org_id, integration_id, provider, action, actor_user_id, changed_fields, detail
    ) values (
      old.org_id, old.id, old.provider, 'delete', auth.uid(), null,
      jsonb_build_object('status', old.status)
    );
    return old;
  end if;
  return null;
end;
$$;
