# AICTE–APAAR Student Data Management Platform
## Audit Findings & Defect Resolution Matrix (v11)
**Document Status:** PROPOSAL / REVIEW ONLY  
**Baseline Artifacts Reviewed:**
- Repository Schema: `supabase/migrations/001_initial_schema.sql`
- Frontend Codebase: `src/` (`AuthContext.tsx`, `CSVUploadPage.tsx`, `SubmissionsPage.tsx`, `AuditLogPage.tsx`, etc.)
- Specification Baseline: AICTE–APAAR Security Remediation Proposal v10

---

## 1. Executive Findings Summary

Static code and schema analysis confirms that while earlier remediation proposals correctly identified baseline open policies in `001_initial_schema.sql`, the v10 specification introduced several critical privilege vulnerabilities, runtime syntax errors, and transaction failures.

| Defect ID | Defect Classification | v10 Status | Repository File & Evidence | Proposed v11 Resolution |
|---|---|---|---|---|
| **FIND-01** | **CRITICAL** — Student Demographic Manipulation | **CONFIRMED** in v10 Sec. 13 | `001_initial_schema.sql:133-146`, v10 SQL | Revoke all table-level and column-level `UPDATE` on `students` from `authenticated`. All demographic corrections require procedure or AICTE review. |
| **FIND-02** | **CRITICAL** — Direct Student Insertion Backdoor | **CONFIRMED** in v10 Sec. 12 | `001_initial_schema.sql:130-132`, v10 SQL | Revoke `INSERT ON students` from `PUBLIC, anon, authenticated`. Restrict student creation to `enrol_student_atomic()`. |
| **FIND-03** | **CRITICAL** — Table-Level Grant Shadowing on Enrolments | **CONFIRMED** in v10 Sec. 13 | `001_initial_schema.sql:174-178`, v10 SQL | Execute `REVOKE ALL ON public.enrolments` before granting `UPDATE (submission_status)`. |
| **FIND-04** | **CRITICAL** — Unverified Official Verification Boundary | **CONFIRMED** in v10 Sec. 9 | `supabase/functions/` (Directory Missing) | Reclassify official provider verification as **BLOCKED — OFFICIAL CONTRACT REQUIRED**. Require server-side mTLS/signature validation. |
| **FIND-05** | **HIGH** — Non-Idempotent Composite Type Creation | **CONFIRMED** in v10 Sec. 3 | PostgreSQL 14+ DDL engine | Wrap type creation in idempotent `DO $$ BEGIN IF NOT EXISTS ... END $$;` block. |
| **FIND-06** | **HIGH** — Partial Unique Index vs Conflict Target | **CONFIRMED** in v10 Sec. 5 | `001_initial_schema.sql:40-49`, v10 SQL | Explicitly deactivate existing active memberships in trigger prior to inserting or activating a new membership row. |
| **FIND-07** | **HIGH** — APAAR Race Condition in Atomic Enrolment | **CONFIRMED** in v10 Sec. 8 | `001_initial_schema.sql:135`, v10 SQL | Acquire transaction advisory lock `pg_advisory_xact_lock(hashtext('candidate_apaar_' \|\| normalized_apaar))` during enrolment. |
| **FIND-08** | **HIGH** — Insecure Staging Recovery Strategy | **CONFIRMED** in v10 Sec. H | v10 Specification Sec. H | Remove permissive recovery scripts. Enforce transactional rollback and full snapshot recovery. |
| **FIND-09** | **MEDIUM** — Demographic Conflict PII Leakage in Audit | **CONFIRMED** in v10 Sec. 8 | `001_initial_schema.sql:240-255` | Use structured token `ERR_DEMOGRAPHIC_MISMATCH` instead of storing raw unmasked student PII in `detection_reason`. |
| **FIND-10** | **MEDIUM** — Unauthenticated Audit Context Attribution | **CONFIRMED** in v10 Sec. 11 | `001_initial_schema.sql:260-275` | Attribute unauthenticated context as `actor_email = 'unauthenticated_or_system'` and `actor_role = NULL` without fabricating roles. |

---

## 2. Detailed Line-by-Line Evidence & Remediation

### Finding 1: Unrestricted Demographic Column Updates
- **v10 Flaw:** v10 Section 13 granted `UPDATE (full_name, date_of_birth, gender, apaar_id) ON public.students TO authenticated`.
- **Repository Context:** In `001_initial_schema.sql` (lines 133–146), students are linked to enrolments. When multiple institutions enroll the same student, granting update rights to an institutional administrator allows them to alter legal demographics for all other institutions. Furthermore, allowing direct updates to `apaar_id` enables an administrator to replace an officially verified identifier.
- **Evidence:** Line in v10 Sec. 13: `GRANT UPDATE (full_name, date_of_birth, gender, apaar_id) ON public.students TO authenticated;`.
- **v11 Correction:** Completely revoke table-level and column-level `UPDATE` on `public.students` from `authenticated`. All identity changes require an explicit, audited procedure or AICTE administrative action.

### Finding 2: Student Table Direct Insertion Backdoor
- **v10 Flaw:** v10 Section 12 granted `INSERT ON public.students TO authenticated` paired with a policy of `WITH CHECK (true)`.
- **Repository Context:** This allowed any authenticated user to directly call `supabase.from('students').insert(...)`, bypassing all validation, batch checks, and quota locks in `enrol_student_atomic()`.
- **v11 Correction:** Revoke `INSERT ON public.students` from `PUBLIC, anon, authenticated`. The `SECURITY DEFINER` procedure `enrol_student_atomic()` is the sole authorized mechanism to create student identity rows.

### Finding 3: Table-Level Grant Shadowing on Enrolments
- **v10 Flaw:** In PostgreSQL, granting column-level update (`GRANT UPDATE (submission_status)`) does NOT restrict column access if the role already holds table-level `UPDATE` privileges (which Supabase grants by default to `authenticated`).
- **Repository Context:** `001_initial_schema.sql` relies on default Supabase public grants. Without an explicit `REVOKE ALL ON public.enrolments`, clients can update `enrolment_status`, `student_id`, and `institution_id`.
- **v11 Correction:** In Section 13, execute `REVOKE ALL ON public.enrolments FROM PUBLIC, anon, authenticated;` before granting `UPDATE (submission_status)`.

### Finding 4: Unverified Official Verification Trust Boundary
- **v10 Flaw:** v10 implemented `execute_official_apaar_verification()` with caller-supplied outcomes, references, and timestamps, relying solely on `current_user = 'service_role'`.
- **Repository Context:** Directory `supabase/functions/` does not exist. No DigiLocker/UIDAI API client, mTLS credentials, or signature validation logic exist in the repository.
- **v11 Correction:** Formally reclassify official verification as **BLOCKED — OFFICIAL CONTRACT REQUIRED**. Require server-side Edge Function architecture with cryptographic signature validation, nonce replay protection, and strict timestamp skew guards.

### Finding 5: Non-Idempotent Type Definition Failure
- **v10 Flaw:** v10 Section 3 executed `CREATE TYPE public.enrolment_result AS (...)`.
- **Repository Context:** PostgreSQL throws `42710 (duplicate_object)` if `CREATE TYPE` is re-run during staging repair or replay.
- **v11 Correction:** Wrap type creation in conditional logic:
  ```sql
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enrolment_result' AND typnamespace = 'public'::regnamespace) THEN
      CREATE TYPE public.enrolment_result AS (...);
    END IF;
  END $$;
  ```

### Finding 6: Partial Unique Index Target Incompatibility
- **v10 Flaw:** v10 created `CREATE UNIQUE INDEX uq_profile_single_active_membership ON institution_memberships (profile_id) WHERE is_active = true;` but the sync trigger used `ON CONFLICT (profile_id, institution_id)`.
- **Repository Context:** In `001_initial_schema.sql` (lines 40–49), `institution_memberships` has `UNIQUE (profile_id, institution_id)`. If an administrator active at Institution A is assigned to Institution B, `ON CONFLICT (profile_id, institution_id)` does not conflict; instead, the insert collides with `uq_profile_single_active_membership` and aborts.
- **v11 Correction:** The synchronization trigger explicitly executes `UPDATE institution_memberships SET is_active = false WHERE profile_id = NEW.id AND is_active = true;` before inserting or activating the new membership.

### Finding 7: Race Condition on Candidate APAAR Creation
- **v10 Flaw:** v10 performed `SELECT` followed by `INSERT` on candidate APAAR numbers without row or advisory locking.
- **Repository Context:** During concurrent CSV batch uploads across multiple browser sessions, two workers submitting the same candidate APAAR simultaneously would both see no existing record and attempt concurrent inserts, leading to unique constraint collisions or orphaned duplicate review cases.
- **v11 Correction:** Acquire a transaction-level advisory lock at the start of resolution:
  ```sql
  PERFORM pg_advisory_xact_lock(hashtext('candidate_apaar_' || v_normalized_apaar));
  ```

### Finding 8: Security-Degrading Staging Recovery Plan
- **v10 Flaw:** v10 Section H proposed granting direct `INSERT` on `enrolments` and dropping transition triggers during staging recovery.
- **v11 Correction:** Completely remove all permissive recovery fallbacks. Staging recovery must strictly use transaction rollbacks (`ROLLBACK`) or complete point-in-time snapshot restores (`pg_restore`).

### Finding 9: Demographic Conflict Free-Text PII Exposure
- **v10 Flaw:** v10 formatted `detection_reason` with raw unmasked candidate names, APAAR IDs, and dates of birth.
- **Repository Context:** `duplicate_review_cases` is readable by institution administrators. Exposing unredacted PII in free text breaches privacy isolation.
- **v11 Correction:** Use structured error tokens (e.g., `ERR_DEMOGRAPHIC_MISMATCH`) and redact unmasked PII from reason fields.

### Finding 10: Unauthenticated Audit Context Misattribution
- **v10 Flaw:** When `auth.uid()` was null, v10 labelled the actor as `'system_service'`.
- **Repository Context:** A null `auth.uid()` can represent an internal trigger, unauthenticated script, or background database connection.
- **v11 Correction:** Explicitly attribute unauthenticated operations as `actor_email = 'unauthenticated_or_system'` and `actor_role = NULL`.

---

## 3. Unresolved Assumptions & External Blockers

1. **Official Verification Gateway Integration:** **BLOCKED**. Integration with DigiLocker or UIDAI cannot be implemented or simulated safely without the official API specification, schema contracts, and cryptographic certificate standards from AICTE.
2. **Multi-Institution Administration Business Rule:** Assumed strictly 1 active institution membership per profile. If delegated registrars must administer multiple institutions simultaneously, a formal governance decision by AICTE is required before schema constraints can be relaxed.
3. **Frontend CSV Upload Alignment:** The frontend currently creates batches without creating enrolment records. Implementation of `enrol_student_atomic()` calls within [CSVUploadPage.tsx](file:///d:/aicte-apaar-platform/src/pages/institution/CSVUploadPage.tsx) is required before staging validation can proceed.
