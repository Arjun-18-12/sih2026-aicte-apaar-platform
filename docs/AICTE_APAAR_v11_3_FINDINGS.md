# AICTE–APAAR Student Data Management Platform
## Audit Findings & Defect Resolution Matrix (v11.3)
**Document Status:** OFFICIAL DEFECT REVIEW & RESOLUTION MATRIX  
**Repository:** `D:\aicte-apaar-platform`  
**Baseline Migration:** `supabase/migrations/001_initial_schema.sql`  
**Review Date:** 2026-10-24  

---

## 1. Executive Summary

This document addresses all ten critical defects identified during the review of the v11.2 security remediation specification and the `D:\aicte-apaar-platform` repository.

In accordance with strict operating safety mandates:
- **No SQL has been executed against live or staging databases.**
- **No database migrations have been applied.**
- **No production files in `src/` or `supabase/migrations/` have been modified.**
- **All tests remain strictly marked `NOT EXECUTED` (or `BLOCKED`).**
- **Official APAAR verification remains blocked pending DigiLocker/UIDAI technical contracts.**

Every finding in this catalog provides:
1. Formal severity rating.
2. Affected SQL section or frontend file.
3. Concrete failure scenario and forensic/security impact.
4. Exact code or SQL correction.
5. Reproducible test specification marked `NOT EXECUTED` or `BLOCKED`.

---

## 2. Severity-Ranked Defect Catalog (v11.3)

| Finding ID | Severity | Category | Affected Object | Failure Summary | Resolution Summary |
|---|---|---|---|---|---|
| **F-11.3-01** | **CRITICAL** | Enrolment Idempotency & Quota | `enrol_student_atomic` | Quota check and student creation occurred before idempotency check, rejecting legitimate retries when capacity was 100% full. | Check `enrolments` on `(institution_id, institution_student_id, academic_year)` first. Return `already_enrolled` with zero quota burn. |
| **F-11.3-02** | **CRITICAL** | Audit Attribution | `audit_table_mutation_trigger` | Used `current_user` inside `SECURITY DEFINER`, misattributing all mutations to function owner (`postgres`). | Use `session_user` and `auth.jwt() ->> 'role'` to accurately log authenticated users, service roles, anon clients, and DB admins. |
| **F-11.3-03** | **CRITICAL** | Duplicate Case Visibility Paradox | `duplicate_cases_select` & `students_select` | Submitting institution could not view its own duplicate cases because candidate students have no enrolment row. | Scope case visibility by `batch_id -> submission_batches.institution_id`. Grant read access to candidate students linked via cases. |
| **F-11.3-04** | **CRITICAL** | Silent Membership Deactivation | Migration Section 5 & `institution_memberships` | Automated migration script ran bulk `UPDATE` deactivating memberships without review, risking loss of institutional staff access. | Decouple data reconciliation from DDL. Implement Preflight Gate 1 assertion (`55000`). Provide audited administrative review script. |
| **F-11.3-05** | **HIGH** | Batch Counter Tampering | `submission_batches` & `CSVUploadPage.tsx` | Record counters were updated directly by client queries, permitting forged counters or bypass of validation state. | Add triggers `trg_sync_enrolment_counters` and `trg_sync_error_counters` to derive counters strictly from database rows. |
| **F-11.3-06** | **HIGH** | Official Verification Test Availability | `execute_official_apaar_verification` | Test suite assumed official verification RPC was callable on staging despite missing external provider contracts. | Mark test `TEST-13` as `BLOCKED — OFFICIAL PROVIDER CONTRACT REQUIRED`. Omit RPC from client migration until provider specs exist. |
| **F-11.3-07** | **HIGH** | Strict Candidate APAAR Validation | `enrol_student_atomic` | Format regex ran after stripping characters, permitting inputs with illegal characters (e.g., letters) to be silently accepted. | Pre-validate input with `^[0-9\s\-]+$` before stripping non-digits, then assert `length(norm) = 12`. |
| **F-11.3-08** | **MEDIUM** | Missing Irreversible Step Inventory | Migration Plan | DDL lacked formal reversibility classification, risking unrecoverable state if staging rollout failed. | Provide complete Schema Delta Catalog with granular UP and DOWN SQL commands for every modified schema object. |
| **F-11.3-09** | **MEDIUM** | First AICTE Admin Bootstrap | Profiles setup | Initial AICTE admin setup relied on untracked manual SQL, risking unrecorded privileges in fresh environments. | Author audited, deterministic SQL bootstrap script with direct insertion of immutable audit record. |
| **F-11.3-10** | **MEDIUM** | Frontend Code Separation | `CSVUploadPage.tsx` & Workflow Doc | Proposals blurred database SQL specifications with unimplemented frontend changes. | Maintain `src/` in read-only state. Clearly document frontend changes as an implementation contract for a future branch. |

---

## 3. Detailed Finding Reports

### Finding F-11.3-01: Enrolment Idempotency & Quota Pre-Check Under 100% Capacity
- **Severity:** **CRITICAL**
- **Affected SQL Section:** `enrol_student_atomic` (Lines 418–446 in v11.2 migration)
- **Failure Scenario & Impact:**
  In v11.2, `enrol_student_atomic` locked the `approved_intakes` row and verified that current active enrolments were below the approved intake limit *before* checking whether the student was already enrolled. When a programme was filled to 100% capacity (e.g., 60/60 students enrolled), any network retry, browser refresh, or re-upload of the same CSV by the institution administrator failed with exception `54000 (Intake capacity exceeded)`. Furthermore, in v11.2, candidate student records were created before checking existing enrolments, resulting in orphaned student rows on duplicate retries.
- **Exact Correction:**
  Reorder execution flow inside `enrol_student_atomic`:
  1. Acquire a transaction-scoped advisory lock on `(p_institution_id, p_institution_student_id, p_academic_year)` to serialize concurrent retries.
  2. Query `public.enrolments` for `(institution_id, institution_student_id, academic_year)` immediately after tenant authorization.
  3. If an enrolment is found:
     - Check if `programme_id` matches `p_programme_id`. If not, raise `23505 (Conflicting enrolment)`.
     - Check if existing student demographics match submitted `p_full_name` and `p_date_of_birth`. If not, raise `23505 (Conflicting identity)`.
     - If both match, return immediately with status `already_enrolled` and existing `enrolment_id`.
  4. Quota locking, capacity validation, candidate APAAR resolution, and student record insertion only execute if the enrolment is confirmed to be **NEW**.
- **Reproducible Test:**
  See [TEST-11](file:///d:/aicte-apaar-platform/docs/AICTE_APAAR_v11_3_TEST_PLAN.md#test-11) in the Test Plan. Status: `NOT EXECUTED`.

---

### Finding F-11.3-02: Non-Spoofable Audit Attribution in `SECURITY DEFINER` Triggers
- **Severity:** **CRITICAL**
- **Affected SQL Section:** `audit_table_mutation_trigger` (Section 10 in migration)
- **Failure Scenario & Impact:**
  In PostgreSQL, when a trigger or function executes under `SECURITY DEFINER`, `current_user` automatically switches to the owner of the function (in Supabase, `postgres`). Evaluating `current_user` inside the trigger body returned `'postgres'` for all callers, causing every student creation, batch update, and profile modification to be falsely attributed to `'db_superuser_or_migration'`. This destroyed legal defensibility and forensic traceability.
- **Exact Correction:**
  Replace reliance on `current_user` with `session_user` (the underlying connected database role) and `auth.jwt() ->> 'role'`:
  ```sql
  IF auth.uid() IS NOT NULL THEN
    v_actor_id := auth.uid();
    SELECT email, role INTO v_actor_email, v_actor_role
    FROM public.profiles WHERE id = auth.uid();
    IF v_actor_email IS NULL THEN
      v_actor_email := 'authenticated_uid_' || auth.uid()::text;
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
    v_actor_email := 'direct_db_admin_' || session_user;
    v_actor_role := 'aicte_admin'::public.user_role;
  ELSE
    v_actor_id := NULL;
    v_actor_email := 'system_session_' || session_user;
    v_actor_role := NULL;
  END IF;
  ```
- **Reproducible Test:**
  See [TEST-18](file:///d:/aicte-apaar-platform/docs/AICTE_APAAR_v11_3_TEST_PLAN.md#test-18) in the Test Plan. Status: `NOT EXECUTED`.

---

### Finding F-11.3-03: Duplicate Review Case Visibility Paradox & Candidate Student Reading
- **Severity:** **CRITICAL**
- **Affected SQL Section:** `duplicate_cases_select` and `students_select` RLS policies
- **Failure Scenario & Impact:**
  In v11.2, `duplicate_cases_select` checked institutional access by joining the `enrolments` table. However, when a candidate student conflicts with an existing record, the enrolment row is intentionally withheld pending AICTE review. Consequently, the submitting institution could not see the duplicate review case it had just triggered, creating an operational blindspot where uploads appeared to disappear without error. Unrelated institutions were blocked, but so was the submitter! Furthermore, `students_select` prevented the submitting institution from reading the demographics of the candidate student associated with the case.
- **Exact Correction:**
  1. Scope `duplicate_cases_select` by joining `duplicate_review_cases.batch_id` to `submission_batches.institution_id`:
     ```sql
     CREATE POLICY duplicate_cases_select ON public.duplicate_review_cases FOR SELECT TO authenticated
       USING (
         public.is_aicte_admin() OR
         EXISTS (
           SELECT 1 FROM public.submission_batches b
           WHERE b.id = duplicate_review_cases.batch_id
             AND b.institution_id = public.current_user_institution_id()
         )
       );
     ```
  2. Update `students_select` to allow institutions to read student records referenced in duplicate cases originating from their submission batches:
     ```sql
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
- **Reproducible Test:**
  See [TEST-15](file:///d:/aicte-apaar-platform/docs/AICTE_APAAR_v11_3_TEST_PLAN.md#test-15) in the Test Plan. Status: `NOT EXECUTED`.

---

### Finding F-11.3-04: Silent Active Membership Deactivation & Missing Rollback Plan
- **Severity:** **CRITICAL**
- **Affected SQL Section:** Migration Section 5 & `institution_memberships` table
- **Failure Scenario & Impact:**
  The v11.2 migration automatically executed a blanket SQL update:
  `UPDATE institution_memberships SET is_active = false WHERE profile_id IN (duplicates)...`
  In a production environment, silently deactivating active memberships without prior administrative review or a documented rollback plan risks immediate loss of access for legitimate college staff members, creating operational downtime and untracked state alterations.
- **Exact Correction:**
  1. Decouple data reconciliation from the DDL migration script.
  2. Implement an automated preflight gate check (Gate 1) inside the migration transaction that aborts with code `55000` if any profile has more than one active membership:
     ```sql
     IF EXISTS (
       SELECT 1 FROM public.institution_memberships
       WHERE is_active = true
       GROUP BY profile_id HAVING COUNT(*) > 1
     ) THEN
       RAISE EXCEPTION 'Migration Gate Failure: Multiple active memberships detected. Reconcile data before creating uq_profile_single_active_membership.'
         USING ERRCODE = '55000';
     END IF;
     ```
  3. Provide a separate preflight diagnostic script and an audited administrative reconciliation playbook with full before-and-after audit logging and a tested rollback query.
- **Reproducible Test:**
  See [TEST-08](file:///d:/aicte-apaar-platform/docs/AICTE_APAAR_v11_3_TEST_PLAN.md#test-08) in the Test Plan. Status: `NOT EXECUTED`.

---

### Finding F-11.3-05: Batch Record Counter Tampering & Lack of State Transition Verification
- **Severity:** **HIGH**
- **Affected SQL & Frontend Files:** `submission_batches` update policy, `src/pages/institution/CSVUploadPage.tsx`
- **Failure Scenario & Impact:**
  In v11.2, batch counters (`total_records`, `valid_records`, `error_records`) were updated directly by frontend code via Supabase REST queries. A malicious or compromised institutional administrator could forge counter values, reporting 100% valid records while omitting underlying student validation errors.
- **Exact Correction:**
  1. Add database trigger function `sync_batch_record_counters` attached to `enrolments` and `submission_errors` on `AFTER INSERT OR DELETE`.
  2. Counters are re-computed automatically from real database rows within the database engine.
  3. Revoke direct column updates to `total_records`, `valid_records`, and `error_records` from the `authenticated` role.
- **Reproducible Test:**
  See [TEST-17](file:///d:/aicte-apaar-platform/docs/AICTE_APAAR_v11_3_TEST_PLAN.md#test-17) in the Test Plan. Status: `NOT EXECUTED`.

---

### Finding F-11.3-06: Official APAAR Verification Test Feasibility & Provider Contract Dependency
- **Severity:** **HIGH**
- **Affected SQL & Test:** `execute_official_apaar_verification` & `TEST-13`
- **Failure Scenario & Impact:**
  The v11.2 test suite included a test case claiming to verify official APAAR verification behavior. However, no official DigiLocker or UIDAI API contracts, mTLS certificates, or webhook signing secrets exist in the repository. Proposing or testing a function that blindly trusts client-supplied verification claims introduces severe security risk.
- **Exact Correction:**
  1. Formally mark `TEST-13` as `BLOCKED — OFFICIAL PROVIDER CONTRACT REQUIRED`.
  2. Omit the `execute_official_apaar_verification` function from the migration script until official provider technical specifications and an isolated serverless Edge Function infrastructure are provisioned.
- **Reproducible Test:**
  See [TEST-13](file:///d:/aicte-apaar-platform/docs/AICTE_APAAR_v11_3_TEST_PLAN.md#test-13) in the Test Plan. Status: `BLOCKED`.

---

### Finding F-11.3-07: Strict Candidate APAAR Input Validation
- **Severity:** **HIGH**
- **Affected SQL Section:** `enrol_student_atomic` (Lines 498–508)
- **Failure Scenario & Impact:**
  In earlier versions, non-numeric characters were stripped via regex `regexp_replace(candidate_id, '[^0-9]', '', 'g')` before validating length. An invalid input containing letters (e.g., `"1234ABCD5678"`) would have its letters stripped, transforming into a valid 8-digit or 12-digit number and masking data entry errors or injection payloads.
- **Exact Correction:**
  Enforce a strict two-stage regex validation:
  ```sql
  IF trim(p_candidate_apaar_id) !~ '^[0-9\s\-]+$' THEN
    RAISE EXCEPTION 'Invalid APAAR format: identifier contains forbidden characters'
      USING ERRCODE = '22023';
  END IF;

  v_norm_apaar := regexp_replace(trim(p_candidate_apaar_id), '[^0-9]', '', 'g');
  IF length(v_norm_apaar) != 12 THEN
    RAISE EXCEPTION 'Invalid APAAR format: identifier must be exactly 12 numeric digits'
      USING ERRCODE = '22023';
  END IF;
  ```
- **Reproducible Test:**
  See [TEST-09](file:///d:/aicte-apaar-platform/docs/AICTE_APAAR_v11_3_TEST_PLAN.md#test-09) in the Test Plan. Status: `NOT EXECUTED`.

---

### Finding F-11.3-08: Missing Irreversible Step Inventory & Rollback Procedures
- **Severity:** **MEDIUM**
- **Affected Documentation:** Migration Plan Section 1 & Section 13
- **Failure Scenario & Impact:**
  Earlier proposals lacked an explicit catalog distinguishing reversible vs. irreversible DDL steps. In the event of an error during staging deployment, engineers lacked tested rollback commands, creating the risk of prolonged downtime or inconsistent schemas.
- **Exact Correction:**
  Author a complete Schema Delta Catalog in `AICTE_APAAR_v11_3_MIGRATION_PLAN.md` detailing every altered schema object, its classification, and a matching rollback SQL script (`002_rollback.sql`).
- **Reproducible Test:**
  Rollback verification test in staging harness. Status: `NOT EXECUTED`.

---

### Finding F-11.3-09: Unaudited First AICTE Administrator Provisioning Bootstrap
- **Severity:** **MEDIUM**
- **Affected Process:** Staging / Initial Environment Provisioning
- **Failure Scenario & Impact:**
  Because the public signup trigger (`handle_new_user`) hardcodes all newly registered users as inactive `institution_admin` profiles, the very first AICTE administrator must be created via administrative intervention. In previous proposals, this was left as an ad-hoc manual SQL update, creating an untracked privilege escalation risk.
- **Exact Correction:**
  Provide an audited, deterministic SQL bootstrap procedure with explicit insertion into `public.audit_logs` documenting the bootstrap actor, email, timestamp, and metadata.
- **Reproducible Test:**
  See [TEST-16](file:///d:/aicte-apaar-platform/docs/AICTE_APAAR_v11_3_TEST_PLAN.md#test-16) in the Test Plan. Status: `NOT EXECUTED`.

---

### Finding F-11.3-10: Blurring of Proposed SQL Specification and Frontend Code State
- **Severity:** **MEDIUM**
- **Affected Repository Files:** `src/pages/institution/CSVUploadPage.tsx`, Documentation
- **Failure Scenario & Impact:**
  Previous documentation referred to frontend CSV integration as if it were already active in `src/`. Inspecting `src/pages/institution/CSVUploadPage.tsx` showed that legacy direct table inserts were still present. Conflating proposed database changes with unimplemented frontend changes confuses reviewers and engineers.
- **Exact Correction:**
  Explicitly state that `src/` remains in a read-only state. Document the required frontend changes in `AICTE_APAAR_v11_3_CSV_WORKFLOW.md` as an implementation contract for a future frontend development branch.
- **Reproducible Test:**
  Frontend contract validation test. Status: `NOT EXECUTED`.

---

## 4. Unresolved External Blockers & Staging Prerequisites

The following conditions are strictly required before approving deployment to any staging or pre-production environment:

1. **Official Verification Provider Contract:**
   Official specifications, mTLS certificates, client keys, and webhook verification secrets from DigiLocker / UIDAI must be formally delivered. Until then, official verification remains **BLOCKED**.
2. **Preflight Duplicate Membership Audit:**
   Preflight Gate 1 must return 0 duplicate active memberships on the target database before applying `uq_profile_single_active_membership`.
3. **Frontend CSV Integration Branch:**
   `src/pages/institution/CSVUploadPage.tsx` must be updated in a separate Git branch to call `enrol_student_atomic` before staging validation begins.
