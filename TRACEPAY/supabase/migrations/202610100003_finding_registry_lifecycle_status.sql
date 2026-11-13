-- Restore lifecycle status after the temporary observation-label constraint.
-- Diff labels stay in the reconciliation result. They are not stored.
-- last_seen_at is the last time a report included the finding.

update public.finding_registry
set status = 'open'
where status in ('new', 'unchanged', 'materially_changed');

alter table public.finding_registry
  drop constraint if exists finding_registry_status_check;

alter table public.finding_registry
  add constraint finding_registry_status_check
  check (
    status in (
      'open',
      'explained',
      'action_recorded',
      'monitoring',
      'dismissed',
      'not_observed'
    )
  );

alter table public.finding_registry
  alter column status set default 'open';

alter table public.finding_registry
  drop column if exists last_detected_at;

comment on column public.finding_registry.status is
  'not_observed means the latest run did not include the finding. It does not mean resolved or saved.';

comment on column public.finding_registry.last_seen_at is
  'Last time a report included this finding.';

comment on column public.finding_registry.last_statement_import_id is
  'Last processed import that reconciled this row, including a run that did not observe it.';
