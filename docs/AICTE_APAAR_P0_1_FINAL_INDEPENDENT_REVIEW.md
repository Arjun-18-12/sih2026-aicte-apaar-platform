# AICTE–APAAR P0-1: Final Independent Review — Corrected RPC v1.3

**Document Status:** OFFICIAL FINAL INDEPENDENT REVIEW REPORT & RESOLUTION AUDIT  
**Target Specification Reviewed:** `docs/AICTE_APAAR_P0_1_STUDENT_ENROLMENT_PERSISTENCE_SPECIFICATION.md` (Revision v1.3 Final Corrected)  
**Corroborating Reports:**
- `docs/AICTE_APAAR_P0_1_FINAL_CORRECTION_REPORT.md`
- `docs/AICTE_APAAR_P0_1_INDEPENDENT_SQL_REVIEW.md`
- `docs/AICTE_APAAR_P0_1_RPC_REVIEW_GATE.md`
**Baseline Evidence Sources:**
- `supabase/migrations/001_initial_schema.sql` (12-table baseline schema and constraints)
- `docs/AICTE_APAAR_v11_3_2_PROBLEM_02_PRIVILEGE_FIX.md` (Routine-privilege reconciliation)
- `docs/AICTE_APAAR_v11_3_2_PROBLEM_03_PROFILE_BOOTSTRAP_INVESTIGATION.md` (SECURITY DEFINER, pg_catalog search path, advisory locking)
**Review Mode:** Strictly Read-Only Static Verification (No database connection, no SQL executed, no migrations applied, no application source code altered)  
**Date:** 2026-10-25  

---

## 1. Executive Summary & Purpose

This independent audit reviews the final corrected implementation of `public.submit_enrolment_batch_atomic(p_batch_id uuid, p_records jsonb)` in revision v1.3 of `docs/AICTE_APAAR_P0_1_STUDENT_ENROLMENT_PERSISTENCE_SPECIFICATION.md`.

Specifically, this review verifies the remediation of finding **IR-01 (Safe Retry Cleanup & Foreign-Key Safety)**. The review assesses whether the transition from a single data-modifying CTE to a **two-statement sequential cleanup** resolves PostgreSQL MVCC snapshot visibility issues without causing foreign key violations, deleting unrelated records, or accumulating phantom candidate students.

---

## 2. In-Depth Analysis of IR-01 Sequential Cleanup Implementation

### 2.1 The Two-Statement Sequential Command Architecture
In Step 4 of revision v1.3:
```sql
  -- Step 4: Safe Retry Cleanup (Resolves IR-01)
  DELETE FROM public.submission_errors WHERE batch_id = p_batch_id;

  -- 4A. Delete pending duplicate review cases for this batch and capture candidate IDs
  WITH deleted_cases AS (
    DELETE FROM public.duplicate_review_cases
    WHERE batch_id = p_batch_id 
      AND review_status = 'pending'::public.duplicate_review_status
    RETURNING student_id_2
  )
  SELECT COALESCE(array_agg(student_id_2), ARRAY[]::uuid[])
  INTO v_candidate_ids
  FROM deleted_cases;

  -- 4B. Clean up candidate students in subsequent command with updated snapshot visibility
  IF v_candidate_ids IS NOT NULL AND array_length(v_candidate_ids, 1) > 0 THEN
    DELETE FROM public.students
    WHERE id = ANY(v_candidate_ids)
      AND apaar_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.enrolments 
        WHERE student_id = students.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.duplicate_review_cases 
        WHERE student_id_1 = students.id OR student_id_2 = students.id
      );
  END IF;
```

### 2.2 Verification Against Engine & Schema Invariants
1. **Resolution of MVCC Snapshot Shielding:**
   In PostgreSQL PL/pgSQL, each separate top-level SQL command executed in `READ COMMITTED` isolation acquires a **new query snapshot**.
   - Statement 4A executes `DELETE FROM public.duplicate_review_cases` and captures the exact candidate IDs into `v_candidate_ids`.
   - Statement 4B executes as a subsequent command. Because Statement 4A has finished, Statement 4B’s snapshot directly observes that the rows in `duplicate_review_cases` are deleted.
   - Consequently, the subquery `NOT EXISTS (SELECT 1 FROM public.duplicate_review_cases WHERE student_id_1 = students.id OR student_id_2 = students.id)` no longer sees the deleted case from this batch, and candidate students are cleanly deleted.
2. **Foreign-Key Constraint Safety:**
   In `001_initial_schema.sql`, foreign keys on `duplicate_review_cases` (`student_id_1` and `student_id_2`) have default `NO ACTION` (RESTRICT).
   Because the referencing rows in `duplicate_review_cases` are removed in Statement 4A, Statement 4B can delete candidate records from `public.students` without raising a foreign key violation (`SQLSTATE 23503`).
3. **Preservation of Reviewed / Adjudicated Cases:**
   Statement 4A filters strictly by `WHERE batch_id = p_batch_id AND review_status = 'pending'`. Any review case that has been adjudicated by an AICTE administrator (`reviewed`, `confirmed_duplicate`, `legitimate`, `dismissed`) is excluded from deletion. Furthermore, Statement 4B's `NOT EXISTS` check detects any remaining adjudicated case referencing the student and prevents student deletion.
4. **Strict Scope Bounding (No Unrelated Deletions):**
   Statement 4B restricts its target rows with `WHERE id = ANY(v_candidate_ids)`. Candidate students from other batches, registered citizens with valid APAAR numbers, and standard students admitted without an APAAR are never contained in `v_candidate_ids` and cannot be deleted.

---

## 3. Focused Static Test Matrix for IR-01

The matrix below evaluates seven specific test scenarios across foreign keys, MVCC visibility, referential integrity, and concurrency:

| Test Scenario | Starting Database State | Triggering Action | Expected SQL Execution & Branching | Verification Result & Invariant Proof |
|---|---|---|---|:---:|
| **TM-01: Pending case and orphan candidate from same batch** | Batch 100 in `returned_for_correction` has review case `C1` (`batch_id=100`, `review_status='pending'`, `student_id_2=S_cand`). `S_cand` has `apaar_id IS NULL`, 0 enrolments, no other cases. | Batch 100 resubmitted via `submit_enrolment_batch_atomic(100, ...)` | Statement 4A deletes `C1` and populates `v_candidate_ids = [S_cand]`. Statement 4B runs in a new snapshot; `id = ANY([S_cand])` matches; `apaar_id IS NULL` is true; `NOT EXISTS enrolments` is true; `NOT EXISTS review cases` is true. `S_cand` is deleted. | **PASS** — Clean deletion; zero orphaned records remain in `students`. |
| **TM-02: Reviewed / adjudicated case preservation** | Batch 100 has case `C2` (`batch_id=100`, `review_status='confirmed_duplicate'`, `student_id_2=S_cand`). | Batch 100 resubmitted | Statement 4A filter `review_status = 'pending'` does not match `C2`. `C2` is not deleted. `v_candidate_ids` is empty (`ARRAY[]::uuid[]`). Statement 4B does not execute. | **PASS** — Official AICTE adjudication evidence and student record are preserved. |
| **TM-03: Candidate referenced by another review case** | Batch 100 has pending case `C1` (`student_id_2=S_cand`). Batch 200 also has case `C3` referencing `S_cand` as `student_id_1` or `student_id_2`. | Batch 100 resubmitted | Statement 4A deletes `C1` and returns `S_cand`. Statement 4B evaluates `NOT EXISTS duplicate_review_cases`; detects `C3` still referencing `S_cand`; `NOT EXISTS` is false. `S_cand` is NOT deleted from `students`. | **PASS** — Foreign key integrity of `C3` preserved; zero constraint violations. |
| **TM-04: Candidate referenced by an enrolment** | Batch 100 has pending case `C1` (`student_id_2=S_cand`), but `S_cand` was previously enrolled in another programme or institution. | Batch 100 resubmitted | Statement 4A deletes `C1`. In Statement 4B, `NOT EXISTS enrolments` detects the enrolment row and evaluates to false. `S_cand` is NOT deleted from `students`. | **PASS** — Academic history preserved; `enrolments.student_id` constraint satisfied. |
| **TM-05: Unrelated NULL-APAAR student preservation** | Student `S_other` admitted without APAAR (`apaar_id IS NULL`) in a standard admission batch. | Batch 100 resubmitted | `S_other` is not in `v_candidate_ids` for Batch 100. Condition `id = ANY(v_candidate_ids)` is FALSE. Statement 4B does not scan or touch `S_other`. | **PASS** — Unrelated students are protected from collateral deletion. |
| **TM-06: Retry repeated twice** | Batch 100 retried, fails validation again, and is retried a second time immediately. | Second resubmission of Batch 100 | On second run, Statement 4A deletes any newly created pending case from attempt 1. If none exists, `v_candidate_ids` is empty. Statement 4B skipped cleanly. Batch proceeds idempotently. | **PASS** — Resubmission is completely idempotent; no duplicate key crashes. |
| **TM-07: Concurrent retry or review activity** | Session 1: Institution Admin retries Batch 100. Session 2: AICTE Admin reviews pending case `C1` or retries Batch 100 concurrently. | Concurrent execution | Step 1 transaction advisory lock `pg_advisory_xact_lock(batch_submit_100)` and Step 3 `FOR UPDATE` lock serialize Session 2 until Session 1 commits. If AICTE admin updates case `C1` before Statement 4A, status becomes `confirmed_duplicate`, preserving it from deletion. | **PASS** — Concurrency serialized without race conditions or partial cleanup. |

---

## 4. Evaluation of IR-02 through IR-04 in Revision v1.3

- **IR-02 (Quota-Lock Ordering):** Re-verified in Step 4C. Pre-locking `public.approved_intakes` in monotonic primary-key order (`ORDER BY id ASC FOR UPDATE`) for all distinct programmes in `p_records` eliminates cyclic lock wait-for graphs between concurrent batches. Missing or inactive quotas are handled deterministically in Step 5I with `intake_exceeded` row errors.
- **IR-03 (Complete APAAR Sanitization):** Re-verified in Step 5. Universal sanitization logic handles valid 12-digit strings, formatted strings, short values (1–3 digits), non-numeric characters, blank/whitespace, and JSON numeric inputs. All 14 `submission_errors` inserts pass `v_sanitized_row`.
- **IR-04 (Academic-Year Consistency):** Re-verified in Step 5A. `v_batch_ay` is derived authoritatively from `submission_batches`. Conflicting non-blank row values are rejected with `error_type = 'consistency'` (permitted by `001_initial_schema.sql` CHECK constraint). Missing or blank row values normalize safely to `v_batch_ay`.

---

## 5. Distinction: Static Reasoning vs. Tests Actually Executed

- **Static Reasoning (Repository & Catalog Analysis):**
  - MVCC statement snapshot separation between Statement 4A and Statement 4B.
  - Foreign-key behavior on `duplicate_review_cases` and `enrolments`.
  - Monotonic primary-key lock ordering proof for deadlock elimination.
  - Test Matrix (TM-01 through TM-07) evaluated through formal branch verification against PostgreSQL engine rules.
  - **Zero SQL was executed on Supabase. No database objects were altered.**
- **Executed Tests (Application Unit Test Suite):**
  - Vitest test suite (`npm run test`) was executed locally against application TypeScript modules:
    - `src/tests/enrolment_persistence.test.ts` (15 tests passing): Tests payload normalization, client APAAR masking (`maskSensitiveData`), enum serialization, and RPC response parsing.
    - `src/tests/platform.test.ts` (14 tests passing): Tests APAAR formatting, mock simulation flags, and validation engine rules.
    - Total: **29 of 29 tests passing (0 failures)**.

---

## 6. Remaining Operational Caveats & DBA Prerequisites (Category C)

Prior to executing the proposed migration in staging, the Database Administrator must verify:
1. **Migration Runner Identity:** The migration must be executed by `postgres` or `supabase_admin` to ensure `ALTER FUNCTION ... OWNER TO postgres;` executes without error.
2. **Connection Pooler Advisory Locks:** Verify that Supavisor (or PgBouncer) in transaction-pooling mode supports `pg_advisory_xact_lock`.
3. **Transaction Isolation:** Confirm default transaction isolation is `READ COMMITTED`.
4. **Trigger Inventory:** Confirm no custom table-level triggers exist on `enrolments` or `students` in the live database that could conflict with batch inserts.

---

## 7. Review Conclusion & Final Verdict

The static verification of `public.submit_enrolment_batch_atomic(uuid, jsonb)` revision v1.3 confirms that:
1. Finding **IR-01 is completely corrected** at the documentation level using a two-statement sequential cleanup.
2. Candidate records are cleanly identified and deleted without leaving orphaned phantom records in `students` or violating foreign keys.
3. Reviewed cases, unrelated NULL-APAAR students, and candidate records referenced elsewhere are strictly protected.
4. Concurrency deadlocks (IR-02), APAAR privacy (IR-03), and academic-year consistency (IR-04) remain fully verified.
5. All security mandates (`SET search_path = pg_catalog;`, tenant isolation, active profile verification, explicit ownership) are preserved.

### Final Verdict:

$$\mathbf{PASS\;FOR\;CONTROLLED\;STAGING\;TEST\;PLAN}$$

*(Finding IR-01 is fully resolved at the documentation level. The specification is approved for the preparation of a controlled staging test plan. No database operations or live migrations are authorized.)*
