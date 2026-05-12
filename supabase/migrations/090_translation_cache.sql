-- Translation cache (Phase E).
--
-- Org-scoped lookup keyed by (source_hash, direction). The snapshot
-- helper computes a SHA-256 over the source text of each text-bearing
-- block (paragraph, heading, list item, table cell, callout child)
-- and consults this table before calling OpenRouter. A hit reuses the
-- prior translation; a miss runs the model and writes the result back.
--
-- Why org-scoped:
--   - Different orgs may have different translation tone or domain
--     conventions; caching globally could leak phrasing across tenants.
--   - Easier to size and reason about per-org behavior.
--   - org_id is foreign-keyed so the cache is GC'd automatically when
--     an org is deleted.
--
-- Why store source_content (truncated):
--   - Debug: when a cache entry is "weird", you can see what it
--     translated *from*.
--   - Future de-dup analysis: see how often the same input shows up.
--
-- Why no expiry / TTL:
--   - Translations of plain prose don't go stale; LLM outputs for a
--     given input are effectively deterministic across model versions
--     of the same model family.
--   - If a model upgrade produces materially better translations and
--     we want to invalidate, deleting rows by `model` is trivial.

create table public.translation_cache (
  source_hash text not null,
  direction text not null,
  org_id uuid not null references public.organizations(id) on delete cascade,
  -- Truncated source for audit / debug; full text isn't needed to use
  -- the cache (the hash is the lookup key).
  source_excerpt text not null,
  translated_content text not null,
  model text,
  created_at timestamptz not null default now(),
  primary key (source_hash, direction, org_id),
  constraint translation_cache_direction_check
    check (direction in ('en-to-id', 'id-to-en'))
);

comment on table public.translation_cache is
  'Per-org cache of LLM translations keyed by SHA-256 of the source text + direction. Used by the snapshot helper to skip OpenRouter calls for content it has already translated.';

create index translation_cache_org_created_idx
  on public.translation_cache (org_id, created_at desc);

alter table public.translation_cache enable row level security;

-- Users can read cache entries scoped to orgs they belong to. Reads
-- are how the snapshot helper checks for hits when running under a
-- user JWT (the snapshot-sop edge function uses the caller's
-- session).
create policy "members read own org cache"
  on public.translation_cache
  for select
  using (
    org_id in (select org_id from public.users where id = auth.uid())
  );

-- Same scoping for writes. The snapshot helper inserts entries under
-- the user's JWT, so RLS enforces org membership.
create policy "members insert own org cache"
  on public.translation_cache
  for insert
  with check (
    org_id in (select org_id from public.users where id = auth.uid())
  );
