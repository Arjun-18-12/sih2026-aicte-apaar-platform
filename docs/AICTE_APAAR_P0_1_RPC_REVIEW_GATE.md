# AICTE–APAAR P0-1: Enrolment RPC Review Gate (v1.1 Corrected)

**Document Status:** OFFICIAL REVIEW GATE REPORT & FINDINGS RESOLUTION  
**Target Document Reviewed:** `docs/AICTE_APAAR_P0_1_STUDENT_ENROLMENT_PERSISTENCE_SPECIFICATION.md` (Revision v1.1 Corrected)  
**Baseline Verification Sources:**
- `supabase/migrations/001_initial_schema.sql` (12-table baseline schema and constraints)
- `docs/AICTE_APAAR_v11_3_2_PROBLEM_02_PRIVILEGE_FIX.md` (Routine-privilege reconciliation & grant policies)
- `docs/AICTE_APAAR_v11_3_2_PROBLEM_03_PROFILE_BOOTSTRAP_INVESTIGATION.md` (SECURITY DEFINER, pg_catalog search_path & advisory lock patterns)
**Review Mode:** Strictly Read-Only (No database connection, no SQL executed, no migrations applied, no application code altered)  
**Date:** 2026-10-24  
**Verdict:** **DOCUMENTATION CORRECTED — AWAITING INDEPENDENT REVIEW**

---

## 1. Executive Summary & Review Gate Purpose

This review gate evaluates the proposed transactional database operation:
$$\mathbf{public.submit\_enrolment\_batch\_atomic(p\_batch\_id\;uuid,\;p\_records\;jsonb)}$$
drafted in `docs/AICTE_APAAR_P0_1_STUDENT_ENROLMENT_PERSISTENCE_SPECIFICATION.md`.

The initial review gate conducted on revision v1.0 of the specification identified **eight technical findings (F-01 through F-08)** across schema constraint compatibility, data integrity, `SECURITY DEFINER` search-path hardening, enum type resilience, constraint pre-checks, privacy hygiene, and routine ownership.

Following the P0-1 Correction Pass, all eight findings have been formally addressed and incorporated into revision v1.1 of the persistence specification. This updated report provides:
1. The comprehensive finding-by-finding resolution table linking each finding to its concrete fix and specification citation.
2. In-depth technical justifications for how each constraint and invariant was corrected using existing repository evidence.
3. An explicit three-tier classification separating confirmed repository facts, proposed database code, and database-owner verification requirements.
4. The final verdict concluding this documentation correction pass.

---

## 2. Comprehensive Finding-by-Finding Resolution Table (F-01 through F-08)

| Finding ID | Severity | Audit Domain | Original Issue & Concrete Impact | Exact Resolution Applied in v1.1 Specification | Specification Citation | Verification Classification |
|---|---|---|---|---|---|---|
| **F-01** | **CRITICAL** | Schema Constraint Compatibility | Proposed code inserted `v_existing_student_id` for **both** `student_id_1` and `student_id_2` into `duplicate_review_cases`. Violated `CHECK (student_id_1 != student_id_2)` (`001_initial_schema.sql` line 213), triggering unhandled SQLSTATE `23514` and aborting the entire batch transaction. | Created a distinct candidate student record (`apaar_id = NULL`) and passed distinct IDs: `student_id_1 = v_existing_student_id` and `student_id_2 = v_candidate_student_id`. | Section 3 (Step 5I, lines 552–578) | **Confirmed from repository inspection** (`001_initial_schema.sql`); **Proposed in docs** |
| **F-02** | **CRITICAL** | Identity Integrity & Safety | When demographic mismatch occurred on a shared APAAR ID, the draft code inserted a review case but still assigned `v_student_id := v_existing_student_id;` and enrolled the student, conflating two distinct individuals under one record. | Isolated the candidate record with `apaar_id = NULL` (satisfying partial unique index `students_apaar_id_unique`). Held enrolment from insertion, logged a row error in `submission_errors` (`error_type = 'duplicate'`), incremented duplicate counter, and advanced (`CONTINUE`) without enrolling. | Section 3 (Step 5I, lines 565–596) | **Confirmed from repository inspection**; **Proposed in docs** |
| **F-03** | **HIGH** | SECURITY DEFINER Hardening | Draft routine specified `SET search_path = pg_catalog, public`. Retaining `public` in a SECURITY DEFINER routine exposes the database to function/operator shadowing attacks, violating Problem 3 security mandate. | Hardened search path to strictly `SET search_path = pg_catalog` (excluding `public`). Explicitly schema-qualified all application tables, types, and functions with `public.`. Added explicit permission reconciliation (`REVOKE ALL ... FROM PUBLIC; GRANT EXECUTE ... TO authenticated;`). | Section 3 (Function Header & Permissions, lines 135–142, 715–725) | **Confirmed from repository inspection** (Problem 3 spec); **Proposed in docs** |
| **F-04** | **MEDIUM** | Resilience & Partial Acceptance | Direct type casts `::public.admission_category` and `::public.supernumerary_classification` crashed the entire batch with unhandled SQLSTATE `22P02` whenever an uploaded CSV contained a typo or unsupported value. | Added pre-cast membership checks against all valid enum values defined in `001_initial_schema.sql`. Invalid values are logged as row-level errors in `submission_errors` (`error_type = 'invalid_format'`), the row is marked rejected, and the batch continues processing remaining rows. | Section 3 (Steps 5A & 5B, lines 315–354) | **Confirmed from repository inspection** (Enum types in `001_initial_schema.sql`); **Proposed in docs** |
| **F-05** | **MEDIUM** | Schema Constraint Safety | Blank, empty string, or lowercase invalid gender strings bypassed `COALESCE(v_row->>'gender', 'prefer_not_to_say')` and violated `students.gender` CHECK constraint (`'male', 'female', 'other', 'prefer_not_to_say'`), aborting the transaction. | Documented explicit gender policy: blank, empty string, or whitespace normalizes to `'prefer_not_to_say'`. Unsupported non-blank values are trapped and logged as `invalid_format` row errors in `submission_errors` before any insert occurs. | Section 3 (Step 5C, lines 360–385); Section 5 | **Confirmed from repository inspection**; **Proposed in docs** |
| **F-06** | **MEDIUM** | Idempotency & Unique Constraints | Draft routine only checked intra-batch duplicates and `(institution_id, institution_student_id, academic_year)`. Resubmitting a matched student under a different student ID crashed on table constraint `no_duplicate_enrolment` (`001_initial_schema.sql` line 122). | Added explicit pre-check query against `public.enrolments` for `(student_id, institution_id, programme_id, academic_year)`. Existing enrolments are logged as duplicate errors in `submission_errors` and safely skipped without crashing the batch. | Section 3 (Step 5J, lines 610–630) | **Confirmed from repository inspection** (`001_initial_schema.sql`); **Proposed in docs** |
| **F-07** | **LOW** | Privacy & DPDP Hygiene | Draft routine embedded unmasked 12-digit APAAR numbers into `duplicate_review_cases.detection_reason` and stored raw unmasked row data in `submission_errors.raw_data`, exposing student identifiers in logs and review screens. | APAAR numbers in review reasons are masked to last 4 digits (`'XXXXXXXX' || substring(v_apaar FROM 9 FOR 4)`). `v_sanitized_row` replaces sensitive APAAR values with masked strings in `submission_errors` and `audit_logs`. | Section 3 (Step 5, lines 305–312, 570–575) | **Confirmed from repository inspection**; **Proposed in docs** |
| **F-08** | **INFORMATIONAL** | Routine Ownership & Deployment Parity | Draft specification lacked explicit `ALTER FUNCTION ... OWNER TO`. In Supabase environments, functions default to the executing role, creating potential privilege elevation or migration discrepancy risks. | Documented intended function owner (`postgres`) with explicit SQL: `ALTER FUNCTION public.submit_enrolment_batch_atomic(uuid, jsonb) OWNER TO postgres;`. Added deployment checklist requiring DBA to verify deployer role and ownership. | Section 3 (line 720); Section 7 | **Proposed in docs**; **Requires database-owner verification** |

---

## 3. Detailed Technical Resolution Analysis

### 3.1 F-01 & F-02: Identity Integrity, Schema Constraints & Safe Review Isolation
- **Repository Evidence:**
  `supabase/migrations/001_initial_schema.sql` defines:
  ```sql
  CREATE TABLE IF NOT EXISTS duplicate_review_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID REFERENCES submission_batches(id) ON DELETE SET NULL,
    student_id_1 UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    student_id_2 UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    detection_reason TEXT NOT NULL,
    review_status duplicate_review_status NOT NULL DEFAULT 'pending',
    ...
    CONSTRAINT different_students CHECK (student_id_1 != student_id_2)
  );
  ```
  Furthermore, `students` defines a partial unique index on APAAR:
  ```sql
  CREATE UNIQUE INDEX IF NOT EXISTS students_apaar_id_unique 
  ON students(apaar_id) 
  WHERE apaar_id IS NOT NULL AND apaar_id != '';
  ```
- **The Defect:**
  In the initial draft, when an incoming student row matched an existing APAAR record but exhibited conflicting demographics (e.g., submitted name "Priya Sharma" vs registered "Rahul Sharma"), the code attempted to record a duplicate case by passing `v_existing_student_id` for both `student_id_1` and `student_id_2`. This directly violated `CONSTRAINT different_students CHECK (student_id_1 != student_id_2)`, crashing the transaction with SQLSTATE `23514`.
  Even worse, if the constraint had not triggered, the draft code proceeded to assign `v_student_id := v_existing_student_id;`, enrolling Priya's enrolment record under Rahul's identity, corrupting the central student repository.
- **The v1.1 Resolution:**
  1. A separate candidate student record is created for the conflicting applicant with `apaar_id = NULL` (satisfying the partial unique index `students_apaar_id_unique`) and demographic details as submitted.
  2. `duplicate_review_cases` is inserted with distinct IDs: `student_id_1 = v_existing_student_id` and `student_id_2 = v_candidate_student_id`.
  3. The enrolment is **not** created. The row is marked as held, a descriptive duplicate error is logged in `submission_errors`, `v_duplicate_count` is incremented, and processing continues to the next row (`CONTINUE`).
  4. Both student identities are preserved safely for AICTE administrative adjudication without identity conflation or constraint violations.

### 3.2 F-03: SECURITY DEFINER Search-Path & Routine Authorization Hardening
- **Repository Evidence:**
  `docs/AICTE_APAAR_v11_3_2_PROBLEM_03_PROFILE_BOOTSTRAP_INVESTIGATION.md` (lines 130–140) mandates that all SECURITY DEFINER routines must set `search_path = pg_catalog` strictly, excluding `public`.
- **The Defect:**
  The draft specification used `SET search_path = pg_catalog, public`. Because `public` is writable by default or shared schemas, objects inside `public` could shadow system operators or functions during execution under elevated privileges.
- **The v1.1 Resolution:**
  The function definition in Section 3 now explicitly declares:
  ```sql
  CREATE OR REPLACE FUNCTION public.submit_enrolment_batch_atomic(
    p_batch_id uuid,
    p_records jsonb
  )
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog
  AS $$ ...
  ```
  Every table, custom enum, and utility function inside the procedure body is explicitly qualified with `public.` (e.g., `public.profiles`, `public.submission_batches`, `public.admission_category`, `public.enrolments`).
  Privileges are reconciled at the end of the script:
  ```sql
  REVOKE ALL ON FUNCTION public.submit_enrolment_batch_atomic(uuid, jsonb) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.submit_enrolment_batch_atomic(uuid, jsonb) TO authenticated;
  ```

### 3.3 F-04: Resilient Enum Extraction & Partial Acceptance
- **Repository Evidence:**
  `supabase/migrations/001_initial_schema.sql` defines:
  ```sql
  CREATE TYPE admission_category AS ENUM ('general', 'sc', 'st', 'obc', 'ews', 'pwd', 'nri', 'oci', 'foreign_national', 'management_quota', 'other');
  CREATE TYPE supernumerary_classification AS ENUM ('nri', 'oci', 'fn', 'pwd_extra', 'tuition_fee_waiver', 'kashmiri_migrants', 'none');
  ```
- **The Defect:**
  In the draft, expressions such as `v_row->>'admission_category'::public.admission_category` failed with fatal error `22P02 (invalid_text_representation)` if the CSV contained a non-enum string (e.g., `"General Category"` or `"OBC-NCL"`). Because PostgreSQL aborts an entire transaction when an unhandled cast error occurs, a single malformed row crashed the entire submission batch, breaking the core SIH requirement for partial acceptance.
- **The v1.1 Resolution:**
  The v1.1 specification extracts raw text values, cleans whitespace, normalizes casing, and validates membership against the literal set of valid enum identifiers prior to casting:
  ```sql
  v_raw_cat := lower(trim(COALESCE(v_row->>'admission_category', 'general')));
  IF v_raw_cat IN ('general', 'sc', 'st', 'obc', 'ews', 'pwd', 'nri', 'oci', 'foreign_national', 'management_quota', 'other') THEN
    v_adm_category := v_raw_cat::public.admission_category;
  ELSE
    -- Log row error in submission_errors and gracefully reject row
    INSERT INTO public.submission_errors (batch_id, row_number, institution_student_id, error_type, field_name, error_message, raw_data)
    VALUES (p_batch_id, v_row_num, v_inst_student_id, 'invalid_format', 'admission_category', 'Invalid admission category: ' || v_raw_cat, v_sanitized_row);
    v_rejected_count := v_rejected_count + 1;
    v_row_results := v_row_results || jsonb_build_object(
      'row_number', v_row_num,
      'institution_student_id', v_inst_student_id,
      'status', 'rejected',
      'error_type', 'invalid_format',
      'error_message', 'Invalid admission category'
    );
    CONTINUE;
  END IF;
  ```
  The same validation is applied to `supernumerary_classification`. The batch transaction remains resilient and valid rows continue to be processed.

### 3.4 F-05: Explicit Gender Normalization Policy
- **Repository Evidence:**
  `001_initial_schema.sql` line 90:
  ```sql
  gender TEXT CHECK (gender IN ('male', 'female', 'other', 'prefer_not_to_say'))
  ```
- **The Defect:**
  The draft specification used `COALESCE(v_row->>'gender', 'prefer_not_to_say')`. If an uploaded row contained an empty string (`""`) or spaces, `COALESCE` did not replace it. Subsequent insert into `public.students` violated the CHECK constraint, aborting the transaction.
- **The v1.1 Resolution:**
  Section 3 & Section 5 formalize the explicit platform policy:
  - Blank, empty string, or whitespace-only gender values normalize to `'prefer_not_to_say'`.
  - Supported non-blank values: `'male'`, `'female'`, `'other'`, `'prefer_not_to_say'`.
  - Any other value (e.g., `"M"`, `"F"`, `"Unknown"`) is rejected as an `invalid_format` row error in `submission_errors`, protecting the database constraint while giving clear feedback to the institution admin.

### 3.5 F-06: Pre-emptive `no_duplicate_enrolment` Unique Constraint Verification
- **Repository Evidence:**
  `001_initial_schema.sql` line 122:
  ```sql
  CONSTRAINT no_duplicate_enrolment UNIQUE (student_id, institution_id, programme_id, academic_year)
  ```
- **The Defect:**
  The draft routine only verified uniqueness of `(institution_id, institution_student_id, academic_year)`. If an institution uploaded a student who had already been enrolled in that programme and academic year under a different local ID (or during a previous batch), the insert into `public.enrolments` triggered a unique constraint violation (`23505`), crashing the entire batch.
- **The v1.1 Resolution:**
  Section 3 (Step 5J) executes an explicit pre-check prior to inserting into `public.enrolments`:
  ```sql
  IF EXISTS (
    SELECT 1 FROM public.enrolments
    WHERE student_id = v_student_id
      AND institution_id = v_batch_inst_id
      AND programme_id = v_prog_id
      AND academic_year = v_ay
  ) THEN
    INSERT INTO public.submission_errors (batch_id, row_number, institution_student_id, error_type, field_name, error_message, raw_data)
    VALUES (p_batch_id, v_row_num, v_inst_student_id, 'duplicate', 'student_id', 'Student is already enrolled in this programme and academic year at this institution', v_sanitized_row);
    v_duplicate_count := v_duplicate_count + 1;
    v_row_results := v_row_results || jsonb_build_object(
      'row_number', v_row_num,
      'institution_student_id', v_inst_student_id,
      'status', 'duplicate',
      'error_type', 'duplicate',
      'error_message', 'Student already enrolled in programme'
    );
    CONTINUE;
  END IF;
  ```
  This prevents database-level constraint crashes and provides row-level duplicate reporting.

### 3.6 F-07: Privacy, Masking & DPDP Compliance
- **Repository Evidence:**
  Government of India Digital Personal Data Protection (DPDP) standards and AICTE security directives require academic identifiers and student PII to be protected from plaintext logging.
- **The Defect:**
  Draft code stored unmasked 12-digit APAAR numbers in `detection_reason` and stored raw uploaded JSON rows in `submission_errors.raw_data`.
- **The v1.1 Resolution:**
  1. `detection_reason` now masks the first 8 digits: `'Demographic mismatch on candidate APAAR XXXXXXXX' || substring(v_apaar FROM 9 FOR 4)`.
  2. `v_sanitized_row` masks the APAAR ID before storing in `public.submission_errors.raw_data` and `public.audit_logs.new_values`.
  3. Unmasked identifiers exist only in the secured `public.students.apaar_id` column subject to database-level access controls.

### 3.7 F-08: Routine Ownership & Deployment Pre-requisite
- **Repository Evidence:**
  Supabase projects execute migrations through the Supabase CLI or dashboard using role `postgres` or `supabase_admin`.
- **The Defect:**
  Omitting explicit ownership in SECURITY DEFINER function definitions can result in the function inheriting permissions of an unintended deployment role or failing in environments where default function ownership is strictly audited.
- **The v1.1 Resolution:**
  1. Section 3 explicitly includes:
     ```sql
     ALTER FUNCTION public.submit_enrolment_batch_atomic(uuid, jsonb) OWNER TO postgres;
     ```
  2. Section 7 defines the mandatory pre-deployment checklist for the Database Administrator to verify the role executing migrations.

---

## 4. Verification Boundaries: Three-Tier Classification Matrix

To maintain rigorous architectural hygiene, every component of the persistence implementation is classified into one of three distinct categories:

### Category A: Confirmed from Repository Inspection
These elements have been directly verified against existing repository code files, schema files, and prior audit reports:
- Schema tables: `profiles`, `institution_memberships`, `submission_batches`, `submission_errors`, `programmes`, `approved_intakes`, `students`, `enrolments`, `audit_logs`, `duplicate_review_cases`.
- Exact constraint names: `different_students` (`CHECK (student_id_1 != student_id_2)`), `no_duplicate_enrolment` (`UNIQUE (student_id, institution_id, programme_id, academic_year)`), `students_apaar_id_unique` (`UNIQUE INDEX ON students(apaar_id) WHERE apaar_id IS NOT NULL AND apaar_id != ''`).
- Enum definitions: `admission_category`, `supernumerary_classification`, `duplicate_review_status`, `batch_status`, `enrolment_status`, `submission_status`.
- Check constraints: `students.gender` (`'male', 'female', 'other', 'prefer_not_to_say'`), `submission_errors.error_type` (`'missing_field', 'duplicate', 'invalid_format', 'intake_exceeded', 'supernumerary_exceeded'`).
- Security rules: Problem 3 `SET search_path = pg_catalog` rule and caller authentication pattern via `auth.uid()`.

### Category B: Proposed but Not Executed
These elements represent the proposed SQL logic and documentation updates designed to resolve the persistence defect. **No SQL has been executed and no migrations have been applied to Supabase**:
- The complete function body of `public.submit_enrolment_batch_atomic(p_batch_id uuid, p_records jsonb)`.
- The row-by-row validation loop, exception trapping, and enum parsing logic.
- The advisory lock key formulation (`hashtext('batch_submit_' || p_batch_id::text)`).
- Candidate student record generation for duplicate review isolation.
- Pre-checks for `no_duplicate_enrolment` and quota limits.
- Staging verification test queries in Section 6 of the specification.

### Category C: Requires Database-Owner Verification
These elements depend on runtime database configuration, hosting environment policies, or DBA actions that cannot be verified solely from git repository files:
- **Deployment Role Identity:** Verifying whether the migration runner is `postgres` or `supabase_admin`.
- **Default Transaction Isolation:** Confirming that the Supabase PostgreSQL instance operates under `READ COMMITTED` transaction isolation (required for advisory lock / SELECT FOR UPDATE row-locking semantics).
- **Audit Table Trigger Compatibility:** Verifying whether custom triggers exist on `enrolments` or `students` in the live database that might conflict with batch inserts.
- **Connection Pool Configuration:** Ensuring that Supabase connection poolers (e.g., Supavisor) support session/transaction advisory locks for the RPC.

---

## 5. Review Gate Verification Conclusion & Final Verdict

All eight findings (**F-01 through F-08**) raised during the initial review gate have been completely resolved within the proposed specification document (`docs/AICTE_APAAR_P0_1_STUDENT_ENROLMENT_PERSISTENCE_SPECIFICATION.md` v1.1 Corrected).

The proposed RPC design now guarantees:
1. **Schema Safety:** Fully complies with all table constraints, partial unique indices, and check constraints in `001_initial_schema.sql`.
2. **Identity Protection:** Prevents demographic conflation on APAAR matches by isolating candidate records and routing disputes to duplicate review.
3. **Execution Hardening:** Enforces `SET search_path = pg_catalog`, explicit `public.` qualification, and explicit privilege revocation/grants.
4. **Transaction Resilience:** Guarantees partial acceptance by trapping formatting and enum errors at the row level without aborting the transaction.
5. **Concurrency Serialization:** Combines advisory transaction locks with row-level `FOR UPDATE` locks on batch and intake quotas to prevent race conditions.
6. **Privacy Compliance:** Masks sensitive student identifiers in logs and duplicate review cases.

### Final Verdict:

$$\mathbf{DOCUMENTATION\;CORRECTED\;—\;AWAITING\;INDEPENDENT\;REVIEW}$$

> [!IMPORTANT]
> **Staging Deployment Status:**
> This pass is strictly a **documentation correction**. In compliance with mandatory safeguards:
> - No database connection was initiated.
> - No SQL was executed in Supabase.
> - No migrations were added or modified in `supabase/migrations/`.
> - Application source code remains unchanged.
> 
> The proposed RPC specification is **not declared staging-ready**. It must undergo independent review and DBA verification of Category C prerequisites before any deployment to a database environment.
