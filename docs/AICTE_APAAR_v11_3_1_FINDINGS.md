# AICTE–APAAR Student Data Management Platform
## Audit Findings & Defect Resolution Matrix (v11.3.1)
**Document Status:** OFFICIAL DEFECT REVIEW & RESOLUTION MATRIX  
**Repository:** `D:\aicte-apaar-platform`  
**Baseline Migration:** `supabase/migrations/001_initial_schema.sql`  
**Review Version:** v11.3.1 (Remediation of v11.3 Review Flaws)  
**Review Date:** 2026-10-24  
**Operating Mode:** STRICTLY READ-ONLY (No SQL executed; no database altered; all tests marked `NOT EXECUTED` or `BLOCKED`)

---

## 1. Executive Summary & Review Scope

This document reviews the complete v11.3 specification, the proposed migration script, and the `D:\aicte-apaar-platform` repository. It preserves all validated defect resolutions from v11.3 while identifying and correcting five additional security and architectural defects discovered during comprehensive review of the v11.3 proposal.

### Mandatory Compliance Declarations
- **No SQL has been executed against any live, staging, or local database.**
- **No migrations or database modifications have been applied.**
- **No frontend files in `src/` or schema files in `supabase/migrations/` have been edited.**
- **All tests remain strictly designated `NOT EXECUTED`** (or **`BLOCKED`** for official verification).
- **All rollback strategies are designated `PROPOSED, NOT EXECUTED`**; no rollback has been executed.

---

## 2. Summary Defect Catalog (v11.3.1 Delta Matrix)

The catalog below summarizes the ten foundational issues from v11.3 alongside the five critical defects resolved in v11.3.1:

| Finding ID | Severity | Category | Affected Object | Previous Flaw | v11.3.1 Resolution |
|---|---|---|---|---|---|
| **F-11.3.1-01** | **CRITICAL** | Cross-Tenant Privacy Breach | `students_select` policy | Submitting institution was granted `SELECT` on `student_id_1`, leaking full demographic records of another institution's student via duplicate review cases. | Restricted `students_select` to candidate students (`student_id_2`) only. `student_id_1` full demographics are strictly blocked from the submitting institution. |
| **F-11.3.1-02** | **CRITICAL** | Audit Attribution Misleading Role | `audit_table_mutation_trigger` | Assigned application role `'aicte_admin'` to direct database admins (`postgres`, `supabase_admin`), falsely inventing application identities. | Removed fake role assignment. Set `actor_role := NULL` for all database administrators, service-roles, and anonymous callers. |
| **F-11.3.1-03** | **HIGH** | Incomplete Privilege Revocation | 12 Tables & Sequences | v11.3 retained table-level `UPDATE` grants on tables with protected columns and omitted sequence privilege revocations. | Enforced column-level `UPDATE` grants on `submission_batches`, `enrolments`, and `profiles`. Revoked all sequence and table grants from `anon` and unnecessary tables. |
| **F-11.3.1-04** | **HIGH** | Flawed Batch Counter Accounting | `sync_batch_record_counters` | Computed `error_records` using raw `COUNT(*)` of `submission_errors`, causing multi-error rows to inflate row counts beyond source CSV rows. | Defined `error_records` authoritatively as `COUNT(DISTINCT row_number)`. Re-computed counters with row locking `FOR UPDATE` to serialize concurrent chunk uploads. |
| **F-11.3.1-05** | **MEDIUM** | Unsubstantiated Rollback Claims | Migration & Findings Docs | Claimed rollback procedure was "tested" without verifiable execution evidence from an active database. | Updated all rollback descriptions to `PROPOSED, NOT EXECUTED`. Formally classified reversible vs. irreversible changes and data loss risks. |
| **F-11.3-01** | **CRITICAL** | Enrolment Idempotency & Quota | `enrol_student_atomic` | Quota check and student creation occurred before idempotency check, rejecting retries at 100% capacity. | Pre-checked existing enrolment on `(institution_id, institution_student_id, academic_year)` first with zero quota burn. |
| **F-11.3-02** | **CRITICAL** | Audit Attribution `current_user` | `audit_table_mutation_trigger` | Used `current_user` inside `SECURITY DEFINER`, logging all mutations as `'postgres'`. | Replaced with `session_user` and `auth.jwt() ->> 'role'`. |
| **F-11.3-03** | **CRITICAL** | Duplicate Case Blindspot | `duplicate_cases_select` | Joined `enrolments` to determine case visibility, hiding cases from the submitting institution. | Scoped case visibility by `batch_id -> submission_batches.institution_id`. |
| **F-11.3-04** | **CRITICAL** | Silent Membership Deactivation | Migration Section 5 | Bulk SQL update deactivated duplicate memberships without human review or rollback record. | Decoupled data reconciliation from DDL. Enforced Gate 1 abort assertion (`55000`). Author preflight playbook. |
| **F-11.3-05** | **HIGH** | Batch Counter Client Tampering | `submission_batches` | Counters were updated directly by client queries. | Revoked client column `UPDATE`; synchronized strictly via database triggers. |
| **F-11.3-06** | **HIGH** | Official Verification Test Status | `execute_official_apaar_verification` | Assumed official verification RPC was callable on staging without external contracts. | Marked test `BLOCKED — OFFICIAL PROVIDER CONTRACT REQUIRED`. Quarantined RPC until specs exist. |
| **F-11.3-07** | **HIGH** | Candidate APAAR Regex Bypass | `enrol_student_atomic` | Regex ran after stripping characters, accepting invalid alphanumeric inputs. | Enforced strict pre-validation regex `^[0-9\s\-]+$` before stripping. |
| **F-11.3-08** | **MEDIUM** | Schema Delta Catalog | Migration Plan | Lacked comprehensive delta catalog of all schema changes. | Provided exhaustive Schema Delta Catalog with UP/DOWN SQL for every object. |
| **F-11.3-09** | **MEDIUM** | First AICTE Admin Bootstrap | Profiles setup | Initial AICTE admin setup relied on untracked manual SQL. | Provided audited, deterministic SQL bootstrap script with audit logging. |
| **F-11.3-10** | **MEDIUM** | Frontend Code Separation | `CSVUploadPage.tsx` | Proposals blurred proposed database contracts with unimplemented frontend code. | Maintained `src/` in read-only state. Documented frontend changes as staging contract. |

---

## 3. In-Depth Defect Analysis (v11.3.1 Additions)

### Finding F-11.3.1-01: Cross-Institution Student Demographic Leakage via Duplicate Cases
- **Severity:** **CRITICAL**
- **Affected SQL Section:** `students_select` RLS policy in proposed migration (Lines 993–1007 of v11.3 migration)
- **Previous Defect:**  
  In v11.3, to resolve the bug where the submitting institution could not see the candidate student created during a duplicate conflict, the `students_select` policy was expanded as follows:
  ```sql
  -- VULNERABLE v11.3 POLICY:
  CREATE POLICY students_select ON public.students FOR SELECT TO authenticated
    USING (
      public.is_aicte_admin() OR
      EXISTS (
        SELECT 1 FROM public.enrolments e
        WHERE e.student_id = students.id
          AND e.institution_id = public.current_user_institution_id()
      ) OR
      EXISTS (
        SELECT 1 FROM public.duplicate_review_cases d
        JOIN public.submission_batches b ON b.id = d.batch_id
        WHERE (d.student_id_1 = students.id OR d.student_id_2 = students.id)
          AND b.institution_id = public.current_user_institution_id()
      )
    );
  ```
- **Failure Scenario & Forensic Impact:**  
  Suppose Student S1 is enrolled at College B (an unrelated institution). College A uploads a candidate student S2 whose candidate APAAR matches S1's APAAR, but with conflicting demographics. A duplicate review case is created with `student_id_1 = S1`, `student_id_2 = S2`, and `batch_id = Batch_A`.  
  Under the v11.3 policy, because `d.student_id_1 = S1` and `b.institution_id = College_A`, an institutional administrator at College A could query:
  ```sql
  SELECT * FROM public.students WHERE id = S1;
  ```
  PostgreSQL evaluated the policy to **TRUE** and returned the **full demographic record of Student S1** (full name, date of birth, gender, APAAR ID) to College A! This constituted an unauthorized cross-institution data breach of a student enrolled at another college.
- **Exact Correction:**  
  The submitting institution must **ONLY** have direct read access to `student_id_2` (its own candidate student created in its submission batch). It must **NEVER** have direct table read access to `student_id_1` (the existing registered student of another institution).
  ```sql
  -- HARDENED v11.3.1 POLICY:
  CREATE POLICY students_select ON public.students FOR SELECT TO authenticated
    USING (
      public.is_aicte_admin() OR
      EXISTS (
        SELECT 1 FROM public.enrolments e
        WHERE e.student_id = students.id
          AND e.institution_id = public.current_user_institution_id()
      ) OR
      EXISTS (
        SELECT 1 FROM public.duplicate_review_cases d
        JOIN public.submission_batches b ON b.id = d.batch_id
        WHERE d.student_id_2 = students.id
          AND b.institution_id = public.current_user_institution_id()
      )
    );
  ```
  Minimal duplicate-resolution context (such as the detection reason and masked conflict notice) is accessed strictly through `duplicate_review_cases`. Full demographic inspection of both records is restricted exclusively to authorized AICTE regulatory personnel (`is_aicte_admin()`).
- **Threat Addressed:** Cross-institution student identity exfiltration; horizontal privilege escalation.
- **Residual Risk:** Submitting institution learns that a given APAAR is already claimed in the national registry (inherent to duplicate detection), but learns zero private demographic details of the existing student.
- **Matching Regression Test:** [TEST-19](file:///d:/aicte-apaar-platform/docs/AICTE_APAAR_v11_3_1_TEST_PLAN.md#test-19) — Status: `NOT EXECUTED`.

---

### Finding F-11.3.1-02: Misleading Audit Attribution Fabricating Application Roles for Database Admins
- **Severity:** **CRITICAL**
- **Affected SQL Section:** `audit_table_mutation_trigger` (Lines 825–829 of v11.3 migration)
- **Previous Defect:**  
  When an operation was executed directly by a database administrator via `psql` or a migration script without a JWT, the v11.3 trigger executed:
  ```sql
  ELSIF session_user IN ('postgres', 'supabase_admin') AND auth.jwt() IS NULL THEN
    v_actor_id := NULL;
    v_actor_email := 'direct_db_admin_' || session_user;
    v_actor_role := 'aicte_admin'::public.user_role; -- FLAWED: INVENTED APPLICATION ROLE
  ```
- **Failure Scenario & Forensic Impact:**  
  A PostgreSQL superuser or DBA connection running maintenance or migrations is a database engine administrator, NOT an application `aicte_admin` profile. Setting `actor_role = 'aicte_admin'` in `public.audit_logs` fabricated an application identity that did not exist in `public.profiles`. In forensic audits, this made it impossible to distinguish between an action taken by an authorized regulatory official through the authenticated web application and an action taken by an infrastructure DBA directly at the database terminal.
- **Exact Correction:**  
  Eliminate the artificial assignment of `'aicte_admin'`. Database engine administrators, service-role workers, and anonymous clients must be logged with `actor_role := NULL`:
  ```sql
  -- HARDENED v11.3.1 ATTRIBUTION LOGIC:
  IF auth.uid() IS NOT NULL THEN
    v_actor_id := auth.uid();
    SELECT email, role INTO v_actor_email, v_actor_role
    FROM public.profiles WHERE id = auth.uid();
    IF v_actor_email IS NULL THEN
      v_actor_email := COALESCE(auth.jwt() ->> 'email', 'authenticated_uid_' || auth.uid()::text);
      v_actor_role := NULL;
    END IF;

  ELSIF (auth.jwt() ->> 'role') = 'service_role' THEN
    v_actor_id := NULL;
    v_actor_email := 'service_role_worker';
    v_actor_role := NULL;

  ELSIF (auth.jwt() ->> 'role') = 'anon' OR session_user = 'anon' THEN
    v_actor_id := NULL;
    v_actor_email := 'anonymous_api_client';
    v_actor_role := NULL;

  ELSIF session_user IN ('postgres', 'supabase_admin') AND auth.jwt() IS NULL THEN
    v_actor_id := NULL;
    v_actor_email := 'direct_db_' || session_user;
    v_actor_role := NULL; -- TRUTHFUL FORENSIC ATTRIBUTION

  ELSE
    v_actor_id := NULL;
    v_actor_email := 'system_session_' || session_user;
    v_actor_role := NULL;
  END IF;
  ```
- **Threat Addressed:** Forensic misattribution; non-repudiation failure; artificial elevation of DBA operations into application regulatory actions.
- **Residual Risk:** None. The connected database role is captured truthfully in `actor_email` while `actor_role` accurately reflects that no application profile was involved.
- **Matching Regression Test:** [TEST-20](file:///d:/aicte-apaar-platform/docs/AICTE_APAAR_v11_3_1_TEST_PLAN.md#test-20) — Status: `NOT EXECUTED`.

---

### Finding F-11.3.1-03: Incomplete Table-Level and Sequence Privilege Revocation
- **Severity:** **HIGH**
- **Affected SQL Section:** Section 12 of Migration Plan & PostgreSQL Privilege Grants
- **Previous Defect:**  
  Baseline migration `001_initial_schema.sql` issued:
  ```sql
  GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
  GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
  GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role;
  ```
  In v11.3, `REVOKE ALL` was issued for only 6 of the 12 tables. Tables like `submission_batches` retained table-level `UPDATE` grants for `authenticated`, relying solely on triggers to block updates to `valid_records` and reviewer metadata. Furthermore, sequence permissions and default schema privileges were not revoked from `anon`.
- **Failure Scenario & Impact:**  
  Retaining table-level `UPDATE` grants creates defense-in-depth failure. If a trigger is temporarily disabled during maintenance or an RLS policy has an edge-case condition, an authenticated client could directly modify protected columns (`valid_records`, `error_records`, `reviewed_by`).
- **Exact Correction:**  
  1. Revoke all table, sequence, and routine privileges from `anon` across schema `public`.
  2. Revoke table-level `UPDATE` on all tables containing protected columns.
  3. Grant granular column-level `UPDATE` permissions:
     - `profiles`: `GRANT UPDATE (full_name) TO authenticated;`
     - `submission_batches`: `GRANT UPDATE (batch_name, status) TO authenticated;` (Counter and reviewer columns remain strictly revoked).
     - `enrolments`: `GRANT UPDATE (submission_status) TO authenticated;`
     - `duplicate_review_cases`: `GRANT UPDATE (review_status, reviewer_notes, resolved_at) TO authenticated;` (Restricted by RLS to AICTE admin).
- **Threat Addressed:** Privilege escalation; trigger bypass; defense-in-depth failure.
- **Residual Risk:** Staging verification must ensure no client component attempts bulk updates of ungranted columns.
- **Matching Regression Test:** [TEST-21](file:///d:/aicte-apaar-platform/docs/AICTE_APAAR_v11_3_1_TEST_PLAN.md#test-21) — Status: `NOT EXECUTED`.

---

### Finding F-11.3.1-04: Mathematical Flaw in Batch Counter Calculation Under Multi-Error Rows & Retries
- **Severity:** **HIGH**
- **Affected SQL Section:** `sync_batch_record_counters` trigger function (Lines 618–648 of v11.3 migration)
- **Previous Defect:**  
  v11.3 implemented batch counter synchronization using raw table row counts:
  ```sql
  valid_records = (SELECT COUNT(*) FROM public.enrolments WHERE batch_id = v_batch_id);
  error_records = (SELECT COUNT(*) FROM public.submission_errors WHERE batch_id = v_batch_id);
  total_records = valid_records + error_records;
  ```
- **Failure Scenario & Impact:**  
  When a CSV row contains multiple validation errors (e.g., an invalid date of birth AND an invalid gender AND a malformed candidate APAAR), the client or validation processor inserts multiple error records into `public.submission_errors` (all sharing the same `row_number`).  
  If a 10-row CSV contains 9 valid rows and 1 invalid row that triggered 3 field validation errors:
  - `valid_records` = 9
  - `error_records` = 3 (due to 3 error rows)
  - `total_records` = 12!  
  The batch reports 12 records processed for a 10-row file, breaking accounting reconciliation and causing false batch validity reporting. Furthermore, concurrent chunk uploads could interleave counter calculations without row locking.
- **Exact Correction:**  
  Authoritatively define batch counters based on **distinct source CSV rows**:
  - `error_records` = `SELECT COUNT(DISTINCT row_number) FROM public.submission_errors WHERE batch_id = v_batch_id;`
  - `valid_records` = `SELECT COUNT(*) FROM public.enrolments WHERE batch_id = v_batch_id;`
  - `total_records` = `valid_records + error_records;`
  - In `sync_batch_record_counters`, serialize execution by acquiring a row lock on `submission_batches` (`FOR UPDATE`):
  ```sql
  CREATE OR REPLACE FUNCTION public.sync_batch_record_counters()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  DECLARE
    v_batch_id uuid;
    v_valid integer;
    v_errors integer;
  BEGIN
    v_batch_id := COALESCE(NEW.batch_id, OLD.batch_id);
    IF v_batch_id IS NULL THEN RETURN NEW; END IF;

    -- Serialize concurrent counter updates for this batch
    PERFORM 1 FROM public.submission_batches WHERE id = v_batch_id FOR UPDATE;

    SELECT COUNT(*) INTO v_valid
    FROM public.enrolments 
    WHERE batch_id = v_batch_id;

    SELECT COUNT(DISTINCT row_number) INTO v_errors
    FROM public.submission_errors 
    WHERE batch_id = v_batch_id;

    UPDATE public.submission_batches
    SET valid_records = v_valid,
        error_records = v_errors,
        total_records = v_valid + v_errors,
        updated_at = NOW()
    WHERE id = v_batch_id;

    RETURN NEW;
  END;
  $$;
  ```
- **Threat Addressed:** Counter inflation; batch validation corruption; race conditions during concurrent chunk ingestion.
- **Residual Risk:** Frontend must ensure `row_number` is populated accurately (1-indexed CSV line number).
- **Matching Regression Tests:** [TEST-22](file:///d:/aicte-apaar-platform/docs/AICTE_APAAR_v11_3_1_TEST_PLAN.md#test-22) and [TEST-23](file:///d:/aicte-apaar-platform/docs/AICTE_APAAR_v11_3_1_TEST_PLAN.md#test-23) — Status: `NOT EXECUTED`.

---

### Finding F-11.3.1-05: Inaccurate Claims of "Tested Rollback" Without Execution Evidence
- **Severity:** **MEDIUM**
- **Affected Documentation:** `AICTE_APAAR_v11_3_MIGRATION_PLAN.md` & Executive Summaries
- **Previous Defect:**  
  v11.3 referred to the rollback procedure as a "tested rollback/restore strategy" or "tested rollback script." However, in compliance with operating safety mandates, no SQL was executed against any active database. Claiming a rollback has been tested without execution evidence breaches documentation integrity.
- **Exact Correction:**  
  1. Updated all references across all documentation to **`PROPOSED, NOT EXECUTED`**.
  2. Formally categorized schema changes into:
     - **Fully Reversible Automatically:** Triggers, functions, policies, index additions, and composite types.
     - **Conditionally Reversible / Data-Destructive:** Dropping column `candidate_apaar_id` destroys candidate identifiers accumulated since rollout; restoring deactivated memberships requires restoring from the pre-migration audit log snapshot.
  3. Added explicit data loss warnings and operational prerequisites to `002_rollback.sql`.
- **Threat Addressed:** False operational confidence; unverified production recovery assumptions.
- **Residual Risk:** Rollback script must be executed and validated in a disposable staging environment before production approval.
- **Matching Regression Test:** Staging Rollback Verification Harness — Status: `NOT EXECUTED`.

---

## 4. Unresolved External Blockers & Staging Prerequisites

The package remains strictly a proposal. The following explicit conditions are mandatory before staging approval:

1. **Official Provider Technical Contract:**  
   DigiLocker / UIDAI technical specifications, mTLS certificates, client keys, and webhook signing secrets remain absent from the repository. Official APAAR verification remains **BLOCKED**.
2. **Preflight Duplicate Membership Audit:**  
   Preflight Diagnostic Query 1 must return 0 duplicate active memberships on the target database before applying `uq_profile_single_active_membership`. If duplicates exist, the audited reconciliation playbook must be reviewed and executed first.
3. **Frontend Implementation on Dedicated Branch:**  
   `src/pages/institution/CSVUploadPage.tsx` must be updated in a dedicated Git branch to invoke `enrol_student_atomic` in chunks of 25 rows and map duplicate review outcomes as specified in `AICTE_APAAR_v11_3_1_CSV_WORKFLOW.md`.
4. **Disposable Sandbox Execution:**  
   All 23 test specifications in `AICTE_APAAR_v11_3_1_TEST_PLAN.md` must be executed on a disposable PostgreSQL 15+ database and recorded with verifiable logs before staging deployment is authorized.
