-- Task → document link (Phase 6): a task can point at one of the org's
-- documents (a contract / SOP / NDA / letter / job description). Stored as a
-- lightweight polymorphic pair on the task itself (one link per task for v1);
-- a task_links table can supersede this later if multiple links are wanted.
-- No FK — related_id references different tables by related_doc_type — so the
-- app resolves the title and the deep-link, and a purged document just leaves a
-- dangling pointer the UI renders as "unavailable".

alter table public.tasks
  add column if not exists related_doc_type text
    check (related_doc_type in ('sop', 'contract', 'nda', 'letter', 'job_description')),
  add column if not exists related_doc_id uuid;

create index if not exists idx_tasks_related_doc
  on public.tasks (related_doc_type, related_doc_id)
  where deleted_at is null and related_doc_id is not null;
