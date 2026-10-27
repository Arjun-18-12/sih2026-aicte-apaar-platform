# Supabase deployment guide: existing AICTE–APAAR project

This guide preserves the existing Supabase project and its data. Do **not** rerun `001_initial_schema.sql` and do **not** apply any SQL to production before review and a tested staging run.

## Phase 0 — protect the project

1. In Supabase, create or select a staging project that contains only synthetic data. Do not use real student or APAAR data in test uploads.
2. Use the dashboard's database backup/export process before any production change.
3. Confirm that you are signed in as the database owner (`postgres`/`supabase_admin`) in the SQL Editor. The new functions intentionally set their owner to `postgres`.

## Phase 1 — read-only checks

Run these checks in **staging** first. They do not modify data.

```sql
select table_name, row_security
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'profiles', 'students', 'enrolments', 'submission_batches',
    'submission_errors', 'verification_events', 'duplicate_review_cases', 'audit_logs'
  )
order by table_name;

select p.proname, pg_get_userbyid(p.proowner) as owner, p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('handle_new_user', 'current_user_role', 'current_user_institution_id');

select id, email, role, institution_id, is_active
from public.profiles
order by created_at;

select profile_id, institution_id, is_active
from public.institution_memberships
order by granted_at;
```

Record any unexpected AICTE administrator role or inactive membership. Do not change them until their owner and purpose have been confirmed.

## Phase 2 — provision the first AICTE administrator

Create the user through Supabase Authentication first. Then, only while signed in as the database owner, link that user's existing profile. Replace the placeholder with the user ID copied from the Authentication user details page.

```sql
update public.profiles
set role = 'aicte_admin', institution_id = null, is_active = true
where id = '<AUTH_USER_UUID>'::uuid;
```

Verify exactly one intended profile was changed before proceeding. Future profile-management actions should be audited through an administrator workflow; do not allow users to choose a role in signup metadata.

For an institution administrator, the database owner must also link the profile to an existing institution and create the matching active membership. Substitute the two values with IDs from your own project; do not use the synthetic IDs in the old README.

```sql
update public.profiles
set role = 'institution_admin', institution_id = '<INSTITUTION_UUID>'::uuid, is_active = true
where id = '<AUTH_USER_UUID>'::uuid;

insert into public.institution_memberships (profile_id, institution_id, is_active)
values ('<AUTH_USER_UUID>'::uuid, '<INSTITUTION_UUID>'::uuid, true)
on conflict (profile_id, institution_id)
do update set is_active = true;
```

Verify that the institution identifier is correct before executing the second statement: it determines which student records and approved intake data that administrator can access.

## Phase 3 — review and apply migration 002 in staging

1. Review [002_security_hardening_and_batch_provisioning.sql](../supabase/migrations/002_security_hardening_and_batch_provisioning.sql), especially the policy removals and function-owner statements.
2. Copy its complete contents into the Supabase **staging** SQL Editor and run it once as the database owner.
3. Sign in as an institution administrator with an active membership. Upload a synthetic CSV and confirm a draft batch is created through `create_submission_batch_draft`.
4. Confirm that direct browser inserts into `students`, `enrolments`, `audit_logs`, and `verification_events` are denied.

## Phase 4 — atomic enrolment persistence (separate review gate)

The full `submit_enrolment_batch_atomic` function is already documented as a review-only specification in `docs/AICTE_APAAR_P0_1_STUDENT_ENROLMENT_PERSISTENCE_SPECIFICATION.md`. It is intentionally **not** applied by migration 002.

Before applying it, complete the preflight gates and synthetic test cases in `docs/AICTE_APAAR_P0_1_CONTROLLED_STAGING_TEST_PLAN.md`. This is the operation that writes students, enrolments, row-level errors, duplicate-review cases, and submission audit events.

Only after the staging evidence is accepted should the reviewed function be placed in a new numbered migration and executed in production by the database owner.
