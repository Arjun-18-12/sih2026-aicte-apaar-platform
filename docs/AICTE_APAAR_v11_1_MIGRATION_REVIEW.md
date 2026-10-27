# AICTE–APAAR Student Data Management Platform
## Migration Engineering & Staging Review (v11.1)
**Document Status:** OFFICIAL REVIEW ARTIFACT  
**Target Migration:** `supabase/migrations/002_rls_security_hardening.sql` (Proposed Specification)  
**Baseline Inspection:** `supabase/migrations/001_initial_schema.sql`  

---

## 1. Migration Artifact Status

Static analysis of `supabase/migrations/` confirms that **`002_rls_security_hardening.sql` DOES NOT EXIST on disk**. 
In earlier iterations, this migration was drafted within markdown review documents. This review assesses the proposed SQL specification to ensure technical and operational readiness prior to authoring the migration file.

---

## 2. Technical Evaluation of Proposed SQL

### A. SQL Syntax and Dependency Ordering
- **Topological Correctness:** The proposed migration respects all foreign-key and trigger dependencies:
  1. Extensions and fixed search paths are set.
  2. Obsolete generic audit functions are dropped.
  3. Composite type `enrolment_result` is created idempotently.
  4. Core helper functions (`current_user_role`, `current_user_institution_id`, `is_aicte_admin`) are created as `STABLE SECURITY DEFINER`.
  5. Membership deduplication executes before applying `uq_profile_single_active_membership`.
  6. Insert guard triggers and state transition triggers are created before applying RLS policies.
  7. RLS policies are applied across all 12 tables.
  8. Table-level mutations are revoked before granting specific column-level updates.

### B. Idempotency & Re-run Safety
- Type creation is wrapped in a conditional block:
  ```sql
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enrolment_result' AND typnamespace = 'public'::regnamespace) THEN
      CREATE TYPE public.enrolment_result AS (...);
    END IF;
  END $$;
  ```
- Indexes use `DROP INDEX IF EXISTS` followed by `CREATE UNIQUE INDEX`.
- Triggers use `DROP TRIGGER IF EXISTS` followed by `CREATE TRIGGER`.
- Policies are dropped via a dynamic allowlist loop scoping the 12 application tables before recreation.

### C. Grant Reconciliation Across All 12 Tables
To eliminate permissive bypasses, table-level privileges must be reconciled across the entire schema:

| Table | Default Supabase Privilege | Proposed Action in v11.1 | Resulting Privilege for `authenticated` |
|---|---|---|---|
| `profiles` | `ALL` | `REVOKE ALL`, `GRANT SELECT`, `GRANT UPDATE (full_name)` | Read own/AICTE; Update display name only |
| `institutions` | `ALL` | Retain `SELECT` for authenticated; write locked to AICTE | Read all institutions; Write AICTE only |
| `institution_memberships` | `ALL` | `REVOKE ALL`, `GRANT SELECT` | Read self/own institution/AICTE; Write AICTE only |
| `programmes` | `ALL` | Retain CRUD under institution RLS | CRUD scoped to own institution |
| `approved_intakes` | `ALL` | Write locked to AICTE admin | Read own institution; Write AICTE only |
| `students` | `ALL` | `REVOKE ALL`, `GRANT SELECT` | Read enrolled institution; Mutations via RPC only |
| `submission_batches` | `ALL` | Retain CRUD under batch institution RLS | CRUD draft batches; Reviewer fields protected |
| `enrolments` | `ALL` | `REVOKE ALL`, `GRANT SELECT`, `GRANT UPDATE (submission_status)` | Read own inst; Mutations via RPC; Status transitions via trigger |
| `submission_errors` | `ALL` | Retain CRUD under batch institution RLS | CRUD scoped to batch ownership |
| `verification_events` | `ALL` | `REVOKE ALL`, `GRANT SELECT` | Read enrolled inst; Write via official RPC only |
| `duplicate_review_cases` | `ALL` | Retain `SELECT` for involved insts; `UPDATE` for AICTE | Read involved insts; Adjudication AICTE only |
| `audit_logs` | `ALL` | `REVOKE ALL`, `GRANT SELECT` | Read own inst / AICTE; Direct writes revoked |

---

## 3. Verified Staging Backup & Recovery Protocol

> [!CAUTION]
> **Defect Correction:**  
> A command such as `supabase db dump --data=true` is a row-data dump only. It completely omits DDL, triggers, RLS policies, functions, and PostgreSQL privileges. Restoring from it will not restore security controls.

### Approved Staging Backup Procedure
Prior to applying any migration in staging, generate a full binary and schema backup:

```bash
# 1. Full schema DDL (roles, grants, RLS policies, triggers, functions)
supabase db dump --data=false > backup_staging_schema_v11_1.sql

# 2. Complete row data
supabase db dump --data=true > backup_staging_data_v11_1.sql

# 3. Complete standalone PostgreSQL binary archive
pg_dump -h <staging-host> -U postgres -d postgres -F c -b -v -f backup_staging_full_v11_1.dump
```

### Staging Recovery Protocol
1. **Interactive Failure:** The migration is wrapped in a single `BEGIN ... COMMIT;` block. Syntax or constraint errors trigger an automatic transaction rollback with zero persistent changes.
2. **Post-Commit Failure:** If defects appear during post-migration testing:
   - Terminate active client connections:
     ```sql
     SELECT pg_terminate_backend(pid) FROM pg_stat_activity 
     WHERE datname = current_database() AND pid <> pg_backend_pid();
     ```
   - Restore the verified pre-migration archive:
     ```bash
     pg_restore -h <staging-host> -U postgres -d postgres -c -v backup_staging_full_v11_1.dump
     ```
   - Re-run preflight diagnostics to verify clean restoration to baseline.
