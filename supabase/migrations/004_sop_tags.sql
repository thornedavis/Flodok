-- Tags for SOPs (org-level, many-to-many)

create table tags (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

create table sop_tags (
  sop_id uuid not null references sops on delete cascade,
  tag_id uuid not null references tags on delete cascade,
  primary key (sop_id, tag_id)
);

create index idx_tags_org on tags (org_id);
create index idx_sop_tags_sop on sop_tags (sop_id);
create index idx_sop_tags_tag on sop_tags (tag_id);

-- RLS
alter table tags enable row level security;
alter table sop_tags enable row level security;

create policy "Managers can CRUD tags in own org"
  on tags for all
  using (org_id = public.get_user_org_id());

create policy "Managers can CRUD sop_tags in own org"
  on sop_tags for all
  using (
    sop_id in (select id from sops where org_id = public.get_user_org_id())
  );

create policy "Public can view tags"
  on tags for select
  to anon
  using (true);

create policy "Public can view sop_tags"
  on sop_tags for select
  to anon
  using (true);
