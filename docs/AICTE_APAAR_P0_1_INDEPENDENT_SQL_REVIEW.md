# AICTE–APAAR P0-1: Independent SQL Review — Corrected RPC v1.1 & v1.2 Findings Resolution

**Document Status:** OFFICIAL INDEPENDENT SQL REVIEW REPORT & CORRECTION RESOLUTION  
**Target Specification Reviewed:** `docs/AICTE_APAAR_P0_1_STUDENT_ENROLMENT_PERSISTENCE_SPECIFICATION.md` (Revisions v1.1 Corrected & v1.2 Final Corrected)  
**Corroborating Document:** `docs/AICTE_APAAR_P0_1_RPC_REVIEW_GATE.md`  
**Baseline Evidence Sources:**
- `supabase/migrations/001_initial_schema.sql` (12-table baseline schema and constraints)
- `docs/AICTE_APAAR_v11_3_2_PROBLEM_02_PRIVILEGE_FIX.md` (Routine-privilege reconciliation)
- `docs/AICTE_APAAR_v11_3_2_PROBLEM_03_PROFILE_BOOTSTRAP_INVESTIGATION.md` (SECURITY DEFINER, pg_catalog search path, advisory locking)
- Application contract source files: `src/services/enrolmentService.ts`, `src/types/index.ts`, `src/pages/institution/CSVUploadPage.tsx`, `src/services/validationEngine.ts`
**Review Mode:** Strictly Read-Only Static Analysis (No database connection, no SQL executed, no migrations applied, no application source code altered)  
**Date:** 2026-10-25  

---

## 1. Executive Summary & Review Scope

This independent review evaluates the proposed PostgreSQL function body:
$$\mathbf{public.submit\_enrolment\_batch\_atomic(p\_batch\_id\;uuid,\;p\_records\;jsonb)}$$
as originally drafted in revision v1.0, corrected in revision v1.1, and finalized in revision v1.2 of `docs/AICTE_APAAR_P0_1_STUDENT_ENROLMENT_PERSISTENCE_SPECIFICATION.md`.

The primary audit confirmed that all eight initial review gate findings (**F-01 through F-08**) were formally resolved in revision v1.1. In addition, static analysis of the actual PL/pgSQL logic identified four operational and concurrency improvements (**IR-01 through IR-04**). Revision v1.2 of the specification incorporates the precise fixes for IR-01 through IR-04.

This updated report provides the comprehensive evaluation across the 8 core review domains, the complete finding-by-finding resolution matrix for IR-01 through IR-04, and the formal static review verdict.

---

## 2. In-Depth Evaluation Across the 8 Review Domains

### 2.1 Identity-Conflict Handling
- **Demographic Mismatch Isolation:**
  In Step 5J (lines 550–595), when an uploaded record matches an existing `students.apaar_id` but exhibits a mismatch on `full_name` or `date_of_birth`:
  - The conflicting row is routed to duplicate review, `v_duplicate_count` is incremented, and `CONTINUE` is called.
  - The conflicting row is **not enrolled** in `public.enrolments`.
- **Candidate Record Creation:** In `001_initial_schema.sql`, table `duplicate_review_cases` enforces foreign keys `student_id_1 UUID NOT NULL REFERENCES students(id)` and `student_id_2 UUID NOT NULL REFERENCES students(id)`. Because `student_id_2` has a `NOT NULL` reference to `students`, a candidate record in `students` is required by the schema to record a review case. Inserting the candidate with `apaar_id = NULL` satisfies the partial unique index `students_apaar_id_unique`. Within a single transaction, candidate creation and review case creation are atomic.
- **Safe Resubmission (Resolves IR-01):** On batch retry, unadjudicated pending review cases are deleted and their candidate records cleaned up only if unreferenced and unenrolled.

### 2.2 Row-Level Atomicity & Partial Acceptance
- **PostgreSQL Exception Behavior:** The row-processing loop contains localized `BEGIN ... EXCEPTION WHEN OTHERS THEN ... END;` blocks for date parsing (`admission_date` and `date_of_birth`). The remaining operations do not use per-row subtransaction savepoints.
- **Partial Acceptance Policy:** The specification achieves partial acceptance deterministically by pre-validating all expected business and schema constraints (missing fields, duplicate IDs, enum types, gender values, intake limits, unique enrolments, academic year consistency) and branching via `IF ... THEN INSERT INTO submission_errors ... CONTINUE;`.
- **Atomicity:** If an unexpected unhandled database exception were to occur during row insertion, PostgreSQL aborts the entire transaction, guaranteeing that half-persisted row state cannot survive.

### 2.3 Privacy & Identifier Masking
- **Raw Data Logging (`submission_errors.raw_data`):** Sanitizes `v_row` by masking the APAAR ID for all non-empty inputs (including short or malformed values) to `'XXXXXXXX' || substring(...)` or `'XXXXXXXX'` before storing in `submission_errors.raw_data` (Resolves IR-03).
- **Review Reason (`duplicate_review_cases.detection_reason`):** Masks the candidate APAAR identifier (`'Demographic mismatch on candidate APAAR XXXXXXXX' || substring(v_apaar FROM 9 FOR 4)`).
- **Audit Logs (`audit_logs.new_values`):** Contains only batch aggregate counters (`total_records`, `accepted_records`, `rejected_records`, `duplicate_records`) and batch status. No student PII is recorded.
- **Returned Payload (`row_results`):** Returns only `row_number`, `institution_student_id`, `status`, and generated UUIDs (`student_id`, `enrolment_id`). APAAR numbers are excluded.
- **Exception Messages:** All `RAISE EXCEPTION` calls use generic tenant and batch status messages without embedding user PII.

### 2.4 Concurrency, Locking & Idempotency
- **Advisory Lock Scope:** `PERFORM pg_advisory_xact_lock(hashtext('batch_submit_' || p_batch_id::text));` locks the submission batch at the transaction level, preventing concurrent double-submission of the same batch.
- **Batch Row Lock:** `SELECT ... FROM public.submission_batches WHERE id = p_batch_id FOR UPDATE;` prevents race conditions on batch status and verifies state machine transitions (`draft` or `returned_for_correction`).
- **Deterministic Quota Locking (Resolves IR-02):** Step 4B pre-locks active intake quota rows across all distinct programmes in `p_records` in monotonic primary-key order (`ORDER BY id ASC FOR UPDATE`). This eliminates cyclic lock deadlocks (`40P01`) between concurrent multi-programme batches.
- **Constraint Pre-Checks:** Intra-batch duplicates (`v_seen_ids`), institutional duplicates `(institution_id, institution_student_id, academic_year)`, and central unique enrolments `(student_id, institution_id, programme_id, academic_year)` are checked pre-emptively.

### 2.5 Authorization & Privileged Execution
- **Caller Identity:** Validates `v_caller_id := auth.uid() IS NOT NULL` and verifies that the caller's profile exists and has `is_active = TRUE`.
- **Tenant Context:** If the caller is not an `aicte_admin`, the routine verifies that `v_caller_inst_id = v_batch_inst_id` and checks active membership in `public.institution_memberships`. All student, programme, and enrolment operations are pinned to `v_batch_inst_id` from the locked database batch record; client payloads cannot alter the institution context.
- **Routine Privilege Hardening:** Configured with `SET search_path = pg_catalog;` strictly (excluding `public`). All objects are schema-qualified (`public.profiles`, `public.enrolments`, etc.). Explicitly sets `OWNER TO postgres;`, revokes all privileges from `PUBLIC`, and grants `EXECUTE` strictly to `authenticated`.

### 2.6 Schema Compatibility
- All 10 referenced tables, 3 enums, and 4 table constraints were verified against `supabase/migrations/001_initial_schema.sql`.
- Pre-cast membership checks against literal enum values in `public.admission_category` and `public.supernumerary_classification` match the baseline schema definitions.
- Normalization of blank gender values to `'prefer_not_to_say'` matches the `students.gender` CHECK constraint.

### 2.7 Audit & Batch Lifecycle
- Only accepted rows insert into `public.enrolments`.
- Rejected and duplicate rows are recorded in `public.submission_errors`.
- Batch counter invariants (`total_records = valid_records + error_records`) and status transitions (`submitted` on any accepted rows, `validation_failed` on 0 accepted rows) are maintained.
- Audit log entries are written server-side under elevated `SECURITY DEFINER` authority; client roles cannot forge audit records.

### 2.8 Frontend/RPC Contract Alignment
- **Input Payload:** `formatCSVRowToRpcInput()` in `src/services/enrolmentService.ts` maps CSV rows to `BatchEnrolmentRecordInput`, matching the JSON fields extracted in SQL (`row_number`, `institution_student_id`, `full_name`, `programme_code`, `academic_year`, `admission_date`, `admission_category`, `is_nri`, `is_oci`, `is_foreign_national`, `supernumerary_classification`, `apaar_id`, `date_of_birth`, `gender`, `remarks`).
- **Response Payload:** The return JSON in Step 8 matches `BatchEnrolmentResponse` in `src/types/index.ts`.
- **UI State Machine:** `CSVUploadPage.tsx` handles both partial acceptance (`accepted_records > 0`) and validation failure (`accepted_records === 0`).

---

## 3. Resolution Matrix for Independent Review Findings (IR-01 through IR-04)

The table below details the exact resolution implemented in revision v1.2 of `docs/AICTE_APAAR_P0_1_STUDENT_ENROLMENT_PERSISTENCE_SPECIFICATION.md`:

| Finding ID | Severity | Audit Domain | Failure Scenario & Original Risk | Exact Resolution Implemented in v1.2 Specification | Exact Specification Reference | Status |
|---|---|---|---|---|---|:---:|
| **IR-01** | **MEDIUM** | Safe Resubmission & Retry Cleanup | Step 4 deleted only `submission_errors`. Resubmitting a returned batch with demographic conflicts created duplicate `duplicate_review_cases` and orphaned phantom records in `students` with `apaar_id = NULL`. | Step 4 incorporates transactional cleanup using a CTE: deletes pending review cases (`review_status = 'pending'`) for `p_batch_id`, and cascades delete to associated candidate students **only if** `apaar_id IS NULL`, has zero enrolments, and has no other review case references. Adjudicated review evidence (`review_status != 'pending'`) is strictly preserved. | Section 3 (Step 4, lines 230–258) | **RESOLVED IN v1.2** |
| **IR-02** | **LOW / PERF** | Concurrency & Deadlock Prevention | `SELECT ... FROM approved_intakes ... FOR UPDATE` was executed dynamically row-by-row inside the iteration loop. Concurrent batches with multiple programmes in reverse order caused cyclic lock deadlocks (`40P01`). | Step 4B executes deterministic pre-locking of all active intake quota rows required by the batch in monotonic primary-key order (`ORDER BY id ASC FOR UPDATE`) prior to row processing. Eliminates cyclic lock waiting between concurrent multi-programme uploads. | Section 3 (Step 4B, lines 260–280) | **RESOLVED IN v1.2** |
| **IR-03** | **LOW** | Complete APAAR Sanitization | Condition `length(trim(...)) >= 4` skipped short or malformed APAAR values (1–3 chars), allowing unmasked values (e.g. `"123"`) into `submission_errors.raw_data`. | Step 5 applies universal sanitization to every non-empty APAAR string: values with $\ge 4$ numeric digits are masked to `'XXXXXXXX' \|\| last 4 digits`, and short/malformed values (<4 digits) are masked completely to `'XXXXXXXX'`. Raw records cannot leak unmasked identifiers. | Section 3 (Step 5, lines 295–320) | **RESOLVED IN v1.2** |
| **IR-04** | **INFORMATIONAL** | Batch Academic-Year Consistency | Expression `v_ay := trim(COALESCE(v_row->>'academic_year', v_batch_ay))` allowed rows to specify a different academic year, enrolling students into conflicting academic years under the same batch ID. | Step 5A enforces batch consistency: authoritative academic year is pinned to `v_batch_ay`. If `v_row->>'academic_year'` is non-empty and differs from `v_batch_ay`, the row is rejected with `error_type = 'consistency'` without aborting other valid rows. Blank values normalize safely to `v_batch_ay`. | Section 3 (Step 5A, lines 322–348) | **RESOLVED IN v1.2** |

---

## 4. Verification Categorization Matrix

| Element / Check | Confirmed from Repository | Proposed in Specification | Requires DBA Verification |
|---|:---:|:---:|:---:|
| **Tables, columns & foreign keys** (`001_initial_schema.sql`) | **CONFIRMED** | — | — |
| **Enum literal values** (`admission_category`, `supernumerary_classification`) | **CONFIRMED** | — | — |
| **Check constraints** (`students.gender`, `submission_errors.error_type`) | **CONFIRMED** | — | — |
| **Unique constraints** (`no_duplicate_enrolment`, `different_students`) | **CONFIRMED** | — | — |
| **Security search path policy** (`SET search_path = pg_catalog`) | **CONFIRMED** | — | — |
| **Full SQL routine implementation** (`submit_enrolment_batch_atomic` v1.2) | — | **PROPOSED** | — |
| **Pre-cast enum membership validation** | — | **PROPOSED** | — |
| **Safe candidate record cleanup & pending case reuse** (IR-01) | — | **PROPOSED** | — |
| **Deterministic quota lock ordering (`ORDER BY id ASC FOR UPDATE`)** (IR-02) | — | **PROPOSED** | — |
| **Complete APAAR sanitization logic** (IR-03) | — | **PROPOSED** | — |
| **Batch academic-year consistency enforcement** (IR-04) | — | **PROPOSED** | — |
| **Deployment role execution privileges** (`postgres` vs `supabase_admin`) | — | — | **REQUIRES DBA** |
| **Database transaction isolation level** (`READ COMMITTED` default) | — | — | **REQUIRES DBA** |
| **Connection pooler advisory lock support** (Supavisor configuration) | — | — | **REQUIRES DBA** |
| **Live database triggers on `enrolments` / `students`** | — | — | **REQUIRES DBA** |

---

## 5. Formal Review Conclusion & Final Verdict

The proposed PostgreSQL routine `public.submit_enrolment_batch_atomic(uuid, jsonb)` in revision v1.2 addresses all eight review gate findings (**F-01 through F-08**) and all four independent review findings (**IR-01 through IR-04**).

The corrected SQL specification:
1. Safely manages retry state without orphaned records or duplicate review cases (IR-01).
2. Enforces deterministic quota locking in monotonic order, mitigating concurrency deadlocks (IR-02).
3. Completely sanitizes all APAAR strings in error logs and review reasons (IR-03).
4. Strictly enforces batch-level academic year consistency while preserving partial acceptance (IR-04).
5. Strictly maintains `SET search_path = pg_catalog;` and schema-qualified entities.
6. Aligns 100% with the frontend TypeScript interfaces and UI state machines.

### Final Verdict:

$$\mathbf{DOCUMENTATION\;CORRECTED\;—\;AWAITING\;FINAL\;INDEPENDENT\;REVIEW}$$

> [!CAUTION]
> **Staging Deployment Guardrail:**
> This verdict certifies that all static review findings have been resolved in the specification documentation. In compliance with mandatory safeguards:
> - No database connection was initiated.
> - No SQL was executed on Supabase.
> - No migrations were added or modified in `supabase/migrations/`.
> - Application source code remains unchanged.
> 
> Migration execution is **not approved** in this task. Prior to scheduling staging deployment, the Database Administrator must verify Category C prerequisites in the live environment.
