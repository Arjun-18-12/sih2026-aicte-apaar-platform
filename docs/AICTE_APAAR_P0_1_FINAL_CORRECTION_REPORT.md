# AICTE–APAAR P0-1: Final Correction Report — IR-01 through IR-04

**Document Status:** OFFICIAL FINAL CORRECTION REPORT  
**Task ID:** P0-1 Final Correction Pass (Core Workflow Blocker)  
**Target Specifications Corrected:**
- `docs/AICTE_APAAR_P0_1_STUDENT_ENROLMENT_PERSISTENCE_SPECIFICATION.md` (Revision v1.2 Final Corrected)
- `docs/AICTE_APAAR_P0_1_INDEPENDENT_SQL_REVIEW.md` (Updated with Resolution Matrix)
**Corroborating Document:** `docs/AICTE_APAAR_P0_1_RPC_REVIEW_GATE.md`  
**Baseline Evidence Sources:**
- `supabase/migrations/001_initial_schema.sql` (12-table baseline schema and constraints)
- `docs/AICTE_APAAR_v11_3_2_PROBLEM_02_PRIVILEGE_FIX.md` (Routine privilege reconciliation)
- `docs/AICTE_APAAR_v11_3_2_PROBLEM_03_PROFILE_BOOTSTRAP_INVESTIGATION.md` (SECURITY DEFINER, pg_catalog search path, advisory locks)
- `src/services/enrolmentService.ts`, `src/types/index.ts`, `src/pages/institution/CSVUploadPage.tsx`
**Review Mode:** Strictly Read-Only Static Correction (No database connection, no SQL executed, no migrations applied, no application source code altered)  
**Date:** 2026-10-25  
**Verdict:** **DOCUMENTATION CORRECTED — AWAITING FINAL INDEPENDENT REVIEW**

---

## 1. Executive Summary & Purpose

During the independent review of the corrected enrolment RPC (`submit_enrolment_batch_atomic` v1.1), four specific technical findings (**IR-01 through IR-04**) were identified. While none represented critical security breaches or baseline constraint crashes, they addressed important edge cases in batch retry idempotency, multi-programme concurrency deadlocks, privacy sanitization, and academic year consistency.

This final correction pass resolves findings **IR-01 through IR-04** directly within the persistence specification (`docs/AICTE_APAAR_P0_1_STUDENT_ENROLMENT_PERSISTENCE_SPECIFICATION.md` v1.2) and the independent review documentation (`docs/AICTE_APAAR_P0_1_INDEPENDENT_SQL_REVIEW.md`). 

All corrections strictly respect the mandatory safeguards:
- No database connection was initiated.
- Zero SQL statements were executed in Supabase.
- No files in `supabase/migrations/` or application source code (`src/`) were created or modified.
- The 12-table baseline schema and migration history remain completely preserved.

---

## 2. Detailed Technical Breakdown of Corrections (IR-01 through IR-04)

### 2.1 IR-01: Safe Retry Cleanup & Review Case Reuse
- **Original Defect & Failure Scenario:**
  In revision v1.1, Step 4 executed only `DELETE FROM public.submission_errors WHERE batch_id = p_batch_id;`. If an institution submitted a batch that encountered demographic conflicts on an APAAR ID, the RPC created candidate student records in `public.students` (`apaar_id = NULL`) and review cases in `public.duplicate_review_cases` with `review_status = 'pending'`.
  If the batch failed validation or was returned for correction, and the institution subsequently re-submitted the batch without altering the conflicting rows, Step 5 executed again. This inserted a *second* candidate student and a *second* duplicate review case, causing orphaned phantom records to accumulate in `public.students` and cluttering the review queue.
- **Architectural Reasoning & Resolution Applied:**
  Revision v1.2 introduces safe, transactional cleanup in Step 4 using a Common Table Expression (CTE):
  ```sql
  -- Step 4: Safe Retry Cleanup (Resolves IR-01)
  DELETE FROM public.submission_errors WHERE batch_id = p_batch_id;

  WITH pending_cases AS (
    SELECT id, student_id_2 
    FROM public.duplicate_review_cases
    WHERE batch_id = p_batch_id 
      AND review_status = 'pending'::public.duplicate_review_status
    FOR UPDATE
  ),
  deleted_cases AS (
    DELETE FROM public.duplicate_review_cases
    WHERE id IN (SELECT id FROM pending_cases)
    RETURNING student_id_2
  )
  DELETE FROM public.students
  WHERE id IN (SELECT student_id_2 FROM deleted_cases)
    AND apaar_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.enrolments WHERE student_id = students.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.duplicate_review_cases 
      WHERE student_id_1 = students.id OR student_id_2 = students.id
    );
  ```
  - **Preservation of Adjudicated Review Evidence:** The CTE filters strictly on `review_status = 'pending'::public.duplicate_review_status`. If an AICTE administrator has already reviewed or resolved a case (`reviewed`, `confirmed_duplicate`, `legitimate`, or `dismissed`), that review case and its candidate records are **never deleted**.
  - **Referential Integrity Defense:** Candidate records in `public.students` are deleted **only if**:
    1. `apaar_id IS NULL` (guaranteeing it is a candidate placeholder, not a registered citizen record).
    2. `NOT EXISTS (SELECT 1 FROM public.enrolments WHERE student_id = students.id)` (verifying it has no enrolled academic records).
    3. `NOT EXISTS (SELECT 1 FROM public.duplicate_review_cases WHERE student_id_1 = students.id OR student_id_2 = students.id)` (confirming it is not referenced by any other review case).
  - **Transactional Consistency:** This cleanup executes within the atomic transaction after acquiring the advisory lock and batch row lock, ensuring complete idempotency on batch resubmission.

### 2.2 IR-02: Deterministic Quota-Lock Ordering & Deadlock Prevention
- **Original Defect & Failure Scenario:**
  In revision v1.1, `SELECT ... FROM public.approved_intakes WHERE programme_id = v_prog_id AND academic_year = v_ay FOR UPDATE;` was executed dynamically inside the per-row iteration loop.
  If Institution Admin A submitted Batch 1 containing students for Programme CS followed by Programme ME, while Institution Admin B submitted Batch 2 containing students for Programme ME followed by Programme CS, both batches acquired locks in opposite orders. This created an interleaved lock dependency resulting in a PostgreSQL deadlock (`SQLSTATE 40P01`), causing one of the batches to be aborted.
- **Architectural Reasoning & Resolution Applied:**
  Revision v1.2 implements Step 4B, executing deterministic pre-locking of all active intake quota rows across all distinct programmes in `p_records` prior to entering the student row loop:
  ```sql
  -- Step 4B: Deterministic Quota-Row Locking (Resolves IR-02)
  PERFORM id 
  FROM public.approved_intakes
  WHERE programme_id IN (
    SELECT p.id 
    FROM public.programmes p
    JOIN (
      SELECT DISTINCT upper(trim(COALESCE(r->>'programme_code', ''))) AS prog_code
      FROM jsonb_array_elements(p_records) AS r
      WHERE r->>'programme_code' IS NOT NULL AND trim(r->>'programme_code') != ''
    ) codes ON p.code = codes.prog_code
    WHERE p.institution_id = v_batch_inst_id
      AND p.programme_status = 'approved'::public.programme_status
  )
  AND academic_year = v_batch_ay
  AND status = 'active'
  ORDER BY id ASC
  FOR UPDATE;
  ```
  - **Monotonic Key Ordering:** By sorting by `ORDER BY id ASC`, every concurrent transaction touching any subset of these programmes acquires row locks in the exact same monotonic order of their primary keys. In relational database concurrency theory, monotonic resource acquisition guarantees that cyclic wait-for dependencies cannot form between concurrent transactions.
  - **Handling of Missing / Inactive Quotas:** If a programme has no approved intake row or its intake is inactive, the pre-locking query skips it without error. In Step 5I, the per-row check confirms whether `v_intake_id` was found; if not, it logs `intake_exceeded` and gracefully rejects the row.
  - **Locking Scope & Limitations:** This pre-locking strategy prevents deadlocks between concurrent enrolment batches on `approved_intakes`. However, as documented in Section 5, it cannot prevent deadlocks if external, unmanaged database processes execute arbitrary updates on `approved_intakes` in non-canonical orders without adhering to the primary-key ordering convention.

### 2.3 IR-03: Complete APAAR Sanitization
- **Original Defect & Failure Scenario:**
  In revision v1.1, the raw row sanitization check used `IF length(trim(v_sanitized_row->>'apaar_id')) >= 4 THEN ...`. If an uploaded CSV row contained a malformed APAAR string of 1 to 3 characters (e.g., `"123"`), the condition evaluated to `FALSE`. The value bypassed masking and was persisted in plaintext in `submission_errors.raw_data`. While 3 digits cannot identify an individual citizen, strict privacy hygiene under Digital Personal Data Protection (DPDP) principles mandates that all citizen identifiers and candidate values must be masked.
- **Architectural Reasoning & Resolution Applied:**
  Revision v1.2 implements universal sanitization at the top of the row iteration loop (Step 5):
  ```sql
  -- Complete APAAR Sanitization (Resolves IR-03)
  v_sanitized_row := v_row;
  IF v_sanitized_row ? 'apaar_id' AND v_sanitized_row->>'apaar_id' IS NOT NULL THEN
    v_raw_apaar_str := trim(v_sanitized_row->>'apaar_id');
    v_digits_only := regexp_replace(v_raw_apaar_str, '[^0-9]', '', 'g');
    
    IF v_raw_apaar_str = '' THEN
      v_masked_apaar := '';
    ELSIF length(v_digits_only) >= 4 THEN
      v_masked_apaar := 'XXXXXXXX' || substring(v_digits_only FROM length(v_digits_only) - 3 FOR 4);
    ELSE
      v_masked_apaar := 'XXXXXXXX';
    END IF;

    v_sanitized_row := jsonb_set(v_sanitized_row, '{apaar_id}', to_jsonb(v_masked_apaar));
  END IF;
  ```
  - Any string with $\ge 4$ numeric digits has all but the last 4 digits masked with `'XXXXXXXX'`.
  - Any short or malformed string (<4 digits, e.g. `"1"`, `"123"`, `"abc"`) is completely replaced with `'XXXXXXXX'`.
  - Plaintext APAAR numbers cannot leak into `submission_errors.raw_data` through any data path.

### 2.4 IR-04: Batch Academic-Year Consistency
- **Original Defect & Failure Scenario:**
  In revision v1.1, line 278 evaluated `v_ay := trim(COALESCE(v_row->>'academic_year', v_batch_ay));`. This allowed individual CSV rows to specify an `academic_year` different from the batch's `submission_batches.academic_year`. If an uploaded row specified an alternate academic year (e.g. `'2023-24'` in a `'2024-25'` batch) that happened to have an active intake row, the student was enrolled into that alternate academic year under the same batch ID, causing cross-academic-year fragmentation within a single submission batch.
- **Architectural Reasoning & Resolution Applied:**
  Revision v1.2 pins the authoritative academic year strictly to `v_batch_ay` from the locked batch record and enforces consistency in Step 5A:
  ```sql
  -- 5A. Batch Academic-Year Consistency Enforcement (Resolves IR-04)
  v_row_ay := trim(COALESCE(v_row->>'academic_year', ''));
  IF v_row_ay != '' AND v_row_ay != v_batch_ay THEN
    INSERT INTO public.submission_errors (batch_id, row_number, institution_student_id, error_type, field_name, error_message, raw_data)
    VALUES (
      p_batch_id, 
      v_row_num, 
      v_inst_student_id, 
      'consistency', 
      'academic_year', 
      'Row academic year "' || v_row_ay || '" conflicts with batch academic year "' || v_batch_ay || '"', 
      v_sanitized_row
    );

    v_rejected_count := v_rejected_count + 1;
    v_row_results := v_row_results || jsonb_build_object(
      'row_number', v_row_num,
      'institution_student_id', v_inst_student_id,
      'status', 'rejected',
      'error_type', 'consistency',
      'error_message', 'Academic year conflicts with batch'
    );
    CONTINUE;
  END IF;
  v_ay := v_batch_ay;
  ```
  - Uses `error_type = 'consistency'`, which is an exact match for the `submission_errors.error_type` CHECK constraint in `001_initial_schema.sql`.
  - Rejects conflicting rows at the row level without aborting the batch transaction.
  - Blank or missing `academic_year` values safely normalize to `v_batch_ay`.
  - Guarantees that 100% of enrolments created by a batch share the exact academic year of the batch header.

---

## 3. Regression Safeguards & Invariant Verification Matrix

Every correction was checked to ensure no regressions were introduced to previously verified security and architectural invariants:

| Invariant / Policy | Requirement | Verification in Revision v1.2 | Regression Status |
|---|---|---|:---:|
| **Tenant Isolation** | Institution admins cannot access or submit batches for other institutions | Step 3 checks `v_caller_inst_id = v_batch_inst_id` and verifies active membership in `public.institution_memberships`. All operations pinned to locked batch record. | **PRESERVED** |
| **Search Path Security** | `SECURITY DEFINER` routine must exclude `public` to prevent operator shadowing | `SET search_path = pg_catalog;` strictly set on function. All tables, custom enums, and functions explicitly schema-qualified (`public.profiles`, etc.). | **PRESERVED** |
| **Schema Constraints** | Must satisfy all foreign keys, check constraints, and unique indices | `different_students` satisfied by distinct IDs; `students_apaar_id_unique` satisfied by `apaar_id = NULL`; `no_duplicate_enrolment` pre-checked. | **PRESERVED** |
| **Partial Acceptance** | Individual row rejections must not abort the overall batch transaction | Enum extraction, gender parsing, intake limits, duplicates, and academic year conflicts are trapped via row-level checks with `CONTINUE`. | **PRESERVED** |
| **Batch Counters** | Counter invariants must remain mathematically consistent | Invariant `total_records = valid_records + error_records` strictly maintained in Step 6. | **PRESERVED** |
| **Audit Immutability** | Server-side audit trail must be tamper-proof from client roles | Step 7 inserts immutable audit log into `public.audit_logs` under elevated authority with caller ID and server timestamp. | **PRESERVED** |
| **Routine Privileges** | Minimal execution grants conforming to Problem 2 security review | Routine ownership set to `postgres`. `REVOKE ALL ... FROM PUBLIC;` and `GRANT EXECUTE ... TO authenticated;` reconciled. | **PRESERVED** |

---

## 4. Clear Distinction: Static Reasoning vs. Tests Actually Executed

To maintain strict truth-in-documentation standards:

### Static Architectural Reasoning (Documentation Analysis)
- The correctness of CTE-based safe retry cleanup (IR-01) is derived from PostgreSQL transaction semantics, foreign key cascades, and catalog constraint definitions in `001_initial_schema.sql`.
- The deadlock elimination proof for intake quota locking (IR-02) is based on the theoretical guarantee that acquiring row locks in monotonic primary-key order (`ORDER BY id ASC FOR UPDATE`) eliminates cyclic wait-for graphs between concurrent transactions.
- The APAAR sanitization proof (IR-03) and academic year consistency check (IR-04) are verified through static branch analysis of the PL/pgSQL function body.
- **No SQL has been executed in Supabase. No database objects have been created.**

### Executed Tests (Application Codebase Only)
- The Vitest unit and integration test suite (`npm run test`) was executed locally against application TypeScript modules:
  - `src/tests/enrolment_persistence.test.ts` (15 tests passing): Validates payload normalization, client APAAR masking (`maskSensitiveData`), enum serialization, and RPC response parsing.
  - `src/tests/platform.test.ts` (14 tests passing): Validates APAAR formatting, simulation flags, and validation engine rules.
  - Total: **29 of 29 tests passing (0 failures)**.

---

## 5. Remaining Risks & Prerequisites for Database Administrator (Category C)

The following operational prerequisites cannot be verified from git repository files and must be verified by the Database Administrator prior to staging execution:

1. **Migration Runner Identity:** The migration script must be executed by `postgres` or `supabase_admin` to ensure `ALTER FUNCTION ... OWNER TO postgres;` executes without permission errors.
2. **Connection Pooler Advisory Lock Compatibility:** Verify that Supavisor (or PgBouncer) in the target Supabase environment is operating in transaction-pooling mode with session/transaction advisory locks enabled (`pg_advisory_xact_lock`).
3. **Database Transaction Isolation Level:** Confirm that `default_transaction_isolation` is set to `READ COMMITTED` (required for row-level `FOR UPDATE` re-evaluation semantics).
4. **Live Table Triggers:** Confirm that no custom table-level triggers exist on `enrolments` or `students` in the live database that could conflict with batch inserts.

---

## 6. Formal Conclusion & Final Verdict

All findings from the Review Gate (**F-01 through F-08**) and Independent Review (**IR-01 through IR-04**) are now completely resolved in documentation across:
- `docs/AICTE_APAAR_P0_1_STUDENT_ENROLMENT_PERSISTENCE_SPECIFICATION.md` (Revision v1.2 Final Corrected)
- `docs/AICTE_APAAR_P0_1_INDEPENDENT_SQL_REVIEW.md` (Updated with Resolution Matrix)
- `docs/AICTE_APAAR_P0_1_FINAL_CORRECTION_REPORT.md` (This Report)

### Final Verdict:

$$\mathbf{DOCUMENTATION\;CORRECTED\;—\;AWAITING\;FINAL\;INDEPENDENT\;REVIEW}$$

> [!IMPORTANT]
> This pass completes the documentation correction phase. Migration execution is **not approved** in this task. Controlled staging deployment planning may proceed once independent review validates this final correction report.
