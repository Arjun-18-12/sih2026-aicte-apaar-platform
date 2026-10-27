# AICTE–APAAR Student Data Management Platform
## Security Architecture & Remediation Specification (v11)
**Document Status:** PROPOSAL / REVIEW ONLY — NOT FOR DIRECT EXECUTION  
**Target Repository:** `D:\aicte-apaar-platform`  
**Baseline Migration:** `supabase/migrations/001_initial_schema.sql`

---

## 1. Executive Summary & Verification Context

This document establishes the corrected **v11 Security Architecture** for the AICTE–APAAR Student Data Management Platform. The platform manages multi-tenant academic and identity data across independently participating educational institutions under national AICTE supervision.

### Core Security Mandates
1. **Student Privacy & Confidentially:** Prevent data scraping, cross-institution leakage, and unredacted PII exposure in logs and error streams.
2. **Strict Multi-Tenant Isolation:** Enforce tenant boundaries at the database layer via PostgreSQL Row Level Security (RLS) and granular SQL privilege boundaries.
3. **Identity Correctness:** Prevent unverified, mistyped, or maliciously claimed 12-digit APAAR numbers from merging into unrelated student records.
4. **Authentic Official Verification:** Terminate the official verification trust boundary at an authenticated server-side Edge Function and a service-role restricted database procedure. Browser clients cannot assert official verification.
5. **Tamper-Resistant Auditing:** Capture genuine row state transitions and caller attribution via internal triggers, preventing direct client manipulation of audit trails.

---

## 2. Verified Baseline Facts

Static analysis of the repository establishes the following ground truths:

- **Schema Baseline:** Exactly one migration file exists in the repository: `supabase/migrations/001_initial_schema.sql`.
- **Core Application Tables (12):**
  1. `profiles`
  2. `institutions`
  3. `institution_memberships`
  4. `programmes`
  5. `approved_intakes`
  6. `students`
  7. `submission_batches`
  8. `enrolments`
  9. `submission_errors`
  10. `verification_events`
  11. `duplicate_review_cases`
  12. `audit_logs`
- **Enums Verified (11):**
  - `user_role` (`aicte_admin`, `institution_admin`).
  - `institution_type` (`university`, `autonomous_college`, `affiliated_college`, `deemed_university`, `institute_of_national_importance`, `polytechnic`).
  - `approval_status` (`active`, `suspended`, `pending_approval`).
  - `programme_status` (`approved`, `under_review`, `discontinued`).
  - `apaar_verification_status` (`verified`, `unverified`, `pending`, `invalid`, `unavailable`). *Note: `failed` does NOT exist.*
  - `enrolment_status` (`active`, `transferred`, `withdrawn`, `graduated`, `suspended`).
  - `submission_status` (`draft`, `validation_failed`, `submitted`, `under_review`, `approved`, `rejected`, `returned_for_correction`).
  - `batch_status` (`draft`, `processing`, `validation_failed`, `validation_complete`, `submitted`, `under_review`, `approved`, `rejected`, `returned_for_correction`).
  - `admission_category` (`general`, `sc`, `st`, `obc`, `ews`, `pwd`, `nri`, `oci`, `foreign_national`, `management_quota`, `other`).
  - `supernumerary_classification` (`nri`, `oci`, `fn`, `pwd_extra`, `tuition_fee_waiver`, `kashmiri_migrants`, `none`).
  - `duplicate_review_status` (`pending`, `reviewed`, `confirmed_duplicate`, `legitimate`, `dismissed`).
- **Serverless Functions:** Directory `supabase/functions/` is **MISSING**. No Edge Functions or official provider API client code exist in the repository.

---

## 3. Corrected Security Design

### A. Student Identity & Sensitive-Field Protection
In the v10 draft, authenticated users were granted direct `UPDATE` privileges on `full_name`, `date_of_birth`, `gender`, and `apaar_id`. This created severe identity vulnerability: an administrator from Institution A could overwrite legal demographic fields for a student concurrently enrolled at Institution B, or alter the `apaar_id` of an already-verified student.

#### v11 Protection Rules
1. **Revocation of Direct Client Update:** Table-level and column-level `UPDATE` on `public.students` is **completely revoked** from `PUBLIC`, `anon`, and `authenticated`.
2. **Student Creation Exclusively via Atomic Procedure:** Direct `INSERT` on `public.students` is revoked from `PUBLIC`, `anon`, and `authenticated`. Students can only be created via the trusted `enrol_student_atomic()` procedure.
3. **Separation of Candidate APAAR from Authoritative Verification:**
   - Any APAAR ID submitted by an institution via CSV or portal is stored as an **unverified candidate identifier** (`apaar_verification_status = 'unverified'`).
   - Official verification requires cryptographically authenticated confirmation from the official DigiLocker/UIDAI gateway via `execute_official_apaar_verification()`.
4. **Correction Workflow for Demographics:**
   - Pre-verification: Demographic corrections must be submitted via an explicit, audited procedure `request_student_correction()` that validates institutional enrollment.
   - Post-verification: If `apaar_verification_status = 'verified'`, identity fields are **immutable**. Corrections require a formal AICTE administrative review case.

### B. Official Verification Trust Boundary
The verification process is structured into two non-bypassable layers:

```
[ Browser / Institution Admin ]
            │  (Calls Edge Function with Student ID & Candidate APAAR)
            ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: Supabase Edge Function (verify-apaar)              │
│  - Authenticates caller JWT via Supabase Auth               │
│  - Asserts caller is active admin of student's institution  │
│  - Retrieves gateway credentials from Server Vault Secrets   │
│  - Communicates via mTLS / JWS with official DigiLocker     │
│  - Validates provider signature, timestamp freshness, nonce │
└─────────────────────────────────────────────────────────────┘
            │  (Transmits Validated Evidence via Service-Role Context)
            ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 2: Database RPC (execute_official_apaar_verification)  │
│  - Granted STRICTLY to service_role; Revoked from all else │
│  - Locks student row (FOR UPDATE)                           │
│  - Enforces invariant: verified status cannot be overwritten│
│  - Emits verification_events record                         │
│  - Updates status to 'verified' or 'invalid'                │
└─────────────────────────────────────────────────────────────┘
```

> [!IMPORTANT]
> **Status: BLOCKED — Requires Official Integration Documentation.**  
> The official DigiLocker/UIDAI integration specifications, certificates, and endpoints are absent from the repository. The Edge Function cannot be implemented until official technical contracts are delivered by AICTE.

### C. Concurrency-Safe Atomic Enrolment (`enrol_student_atomic`)
The procedure guarantees transactional consistency, quota safety, and conflict isolation:

1. **Transaction Ordering & Deadlock Prevention:**
   - **Step 1:** Validate caller active membership and institution match.
   - **Step 2 (Row Lock):** Lock submission batch: `SELECT status FROM submission_batches WHERE id = p_batch_id FOR UPDATE;`. Asserts status is `'draft'`.
   - **Step 3 (Row Lock):** Lock approved intake: `SELECT approved_intake FROM approved_intakes WHERE id = ... FOR UPDATE;`.
   - **Step 4 (Advisory Lock):** If candidate APAAR is provided, normalize input (strip non-digits, assert 12 digits) and acquire a transaction advisory lock:
     `PERFORM pg_advisory_xact_lock(hashtext('candidate_apaar_' || v_normalized_apaar));`
2. **Quota Enforcement:**
   - Evaluates active enrolments:
     ```sql
     SELECT COUNT(*) FROM enrolments
     WHERE institution_id = p_institution_id
       AND programme_id = p_programme_id
       AND academic_year = p_academic_year
       AND enrolment_status = 'active'
       AND submission_status != 'rejected';
     ```
   - If count $\ge$ approved intake limit: throws exception `54000 (Intake capacity exceeded)`.
3. **Identity Reconciliation & Conflict Isolation:**
   - Checks if student with `apaar_id = v_normalized_apaar` exists.
   - If match found: compares normalized `full_name` and `date_of_birth`.
   - **On Demographic Mismatch:**
     - Creates candidate student record with `apaar_id = NULL` (unverified).
     - Inserts a record into `duplicate_review_cases` with structured reason code `ERR_DEMOGRAPHIC_MISMATCH`.
     - **Does NOT throw an exception.** Commits the review case cleanly and returns structured code `'duplicate_review_required'`.
   - **On Identity Match:** Reuses existing student ID and creates institutional enrolment.
   - **If Identifier Not Found:** Inserts new student with `apaar_id = v_normalized_apaar` and `apaar_verification_status = 'unverified'`.
4. **Idempotency:**
   - Leverages `UNIQUE (institution_id, institution_student_id, academic_year)` and `CONSTRAINT no_duplicate_enrolment UNIQUE (student_id, institution_id, programme_id, academic_year)`.
   - Network retries with the same `institution_student_id` return the existing enrolment without creating duplicate records.

---

## 4. Comprehensive Per-Table Access Matrix

| Table Name | SELECT Allowed Roles | INSERT Allowed Roles | UPDATE Allowed Roles | DELETE Allowed Roles | Primary Security Mechanism |
|---|---|---|---|---|---|
| `profiles` | `authenticated` (Own ID, AICTE Admin) | `service_role` (via `handle_new_user` trigger) | `authenticated` (AICTE Admin: all; Self: `full_name` only) | None | RLS + `protect_profile_security_fields()` trigger |
| `institutions` | `authenticated` (All) | `authenticated` (AICTE Admin only) | `authenticated` (AICTE Admin only) | `authenticated` (AICTE Admin only) | RLS |
| `institution_memberships` | `authenticated` (Own Profile, Own Inst, AICTE Admin) | `service_role` / AICTE Admin | `authenticated` (AICTE Admin only) | None | RLS + Partial Unique Index + Sync Trigger |
| `programmes` | `authenticated` (Own Inst, AICTE Admin) | `authenticated` (Own Inst Admin, AICTE Admin) | `authenticated` (Own Inst Admin, AICTE Admin) | `authenticated` (AICTE Admin only) | RLS |
| `approved_intakes` | `authenticated` (Own Inst, AICTE Admin) | `authenticated` (AICTE Admin only) | `authenticated` (AICTE Admin only) | `authenticated` (AICTE Admin only) | RLS + Row Locks in `enrol_student_atomic` |
| `students` | `authenticated` (Enrolled Inst, AICTE Admin) | **None directly** (RPC only) | **None directly** (RPC / AICTE Admin override only) | None | RLS + Table-level Revoke + Guard Triggers |
| `submission_batches` | `authenticated` (Own Inst, AICTE Admin) | `authenticated` (Own Inst Admin, AICTE Admin) | `authenticated` (Own Inst Admin: draft; AICTE: review) | None | RLS + `protect_batch_reviewer_fields()` trigger |
| `enrolments` | `authenticated` (Own Inst, AICTE Admin) | **None directly** (RPC only) | `authenticated` (Column: `submission_status` only) | None | RLS + Table-level Revoke + Transition Trigger |
| `submission_errors` | `authenticated` (Batch Inst, AICTE Admin) | `service_role` / Batch Inst Admin | None | None | RLS |
| `verification_events` | `authenticated` (Student Inst, AICTE Admin) | **None directly** (Official RPC only) | None | None | RLS + Table-level Revoke |
| `duplicate_review_cases` | `authenticated` (Case Inst, AICTE Admin) | **None directly** (Atomic RPC only) | `authenticated` (AICTE Admin only) | None | RLS + Trigger Audit |
| `audit_logs` | `authenticated` (Own Inst, AICTE Admin) | **None directly** (Internal Triggers only) | None | None | RLS + Table-level Revoke |

---

## 5. Privileged Function Inventory

| Function Name | Owner | Security Type | Fixed search_path | Execution Grants | Caller Requirements |
|---|---|---|---|---|---|
| `current_user_role()` | `postgres` | `SECURITY DEFINER` | `public, pg_catalog` | `authenticated` | Session must have active profile in `profiles`. |
| `current_user_institution_id()` | `postgres` | `SECURITY DEFINER` | `public, pg_catalog` | `authenticated` | Profile must have active membership in an `active` institution. |
| `is_aicte_admin()` | `postgres` | `SECURITY DEFINER` | `public, pg_catalog` | `authenticated` | Profile role must be `aicte_admin` and `is_active = true`. |
| `handle_new_user()` | `postgres` | `SECURITY DEFINER` | `public, pg_catalog` | Trigger on `auth.users` | Supabase GoTrue engine execution only. Hardcodes inactive role. |
| `protect_profile_security_fields()`| `postgres` | `SECURITY DEFINER` | `public, pg_catalog` | Trigger on `profiles` | Enforces fail-closed privilege escalation prevention. |
| `sync_profile_membership_state()` | `postgres` | `SECURITY DEFINER` | `public, pg_catalog` | Trigger on `profiles` | Prevents recursion; deactivates stale memberships on reassignment. |
| `enrol_student_atomic()` | `postgres` | `SECURITY DEFINER` | `public, pg_catalog` | `authenticated` | Validates caller institution match; row-locks intake and batch. |
| `execute_official_apaar_verification()`| `postgres` | `SECURITY DEFINER` | `public, pg_catalog` | `service_role` ONLY | Rejects non-service-role callers; row-locks student; skew check. |
| `enforce_enrolment_state_transitions()`| `postgres` | `SECURITY DEFINER` | `public, pg_catalog` | Trigger on `enrolments` | Enforces strict role-based status transition matrix. |
| `protect_batch_reviewer_fields()` | `postgres` | `SECURITY DEFINER` | `public, pg_catalog` | Trigger on `submission_batches` | Blocks institution admins from editing reviewer metadata. |
| `audit_table_mutation_trigger()` | `postgres` | `SECURITY DEFINER` | `public, pg_catalog` | Trigger on audited tables | Resolves authentic caller context; redacts PII. |

---

## 6. CSV Submission & Enrolment Workflow Reconciliation

The existing frontend implementation in [CSVUploadPage.tsx](file:///d:/aicte-apaar-platform/src/pages/institution/CSVUploadPage.tsx) creates a batch and validates rows in JavaScript, but fails to populate database records.

### Complete 10-Stage Workflow
1. **Batch Initialization:** Institution Admin creates a `submission_batches` record with status `'draft'`.
2. **Client-Side Schema Check:** Frontend validates CSV headers, date formats, and required strings.
3. **Atomic Row Submission:** For each valid row, frontend invokes `public.enrol_student_atomic()`.
4. **Row Error Capture:** Any row-level integrity or format error is inserted into `submission_errors` associated with the `batch_id`.
5. **Conflict Isolation:** Rows encountering demographic mismatches trigger `duplicate_review_cases` without aborting the batch upload.
6. **Counter Finalization:** `submission_batches` record counters (`total_records`, `valid_records`, `error_records`) are updated to reflect processed rows.
7. **Institutional Submission:** Admin reviews error summary. If satisfactory, clicks "Submit Batch", transitioning batch status to `'submitted'`.
8. **Enrolment Status Synchronization:** A database trigger synchronizes associated enrolments from `'draft'` to `'submitted'`.
9. **AICTE Review:** AICTE officer reviews submission via [SubmissionsPage.tsx](file:///d:/aicte-apaar-platform/src/pages/shared/SubmissionsPage.tsx), transitioning batch to `'under_review'`.
10. **Final Adjudication:** AICTE officer marks batch as `'approved'`, `'rejected'`, or `'returned_for_correction'`.

---

## 7. Audit Integrity & Privacy Design

- **Tamper Resistance:** All direct client `INSERT, UPDATE, DELETE` permissions on `audit_logs` are revoked. Only database triggers executing in trusted system context can emit records.
- **Actor Attribution:**
  - If `auth.uid()` is present: trigger looks up verified `email` and `role` directly from `public.profiles`.
  - If `auth.uid()` is null: trigger records `actor_email = 'unauthenticated_or_system'` and `actor_role = NULL`. It never fabricates an AICTE administrator identity.
- **PII Minimization:** The audit trigger strips `date_of_birth` and `apaar_id` from `old_values` and `new_values` JSONB payloads when mutating `public.students`.
- **Duplicate Review Privacy:** `detection_reason` stores structured error tokens (e.g., `ERR_DEMOGRAPHIC_MISMATCH`) rather than unmasked PII.
- **Production Audit Boundary:** Database triggers prevent application-level tampering, but cannot protect against PostgreSQL superuser or cloud infrastructure compromise. An external append-only log sink (e.g., AWS S3 Object Lock or CloudWatch Logs) is required for production compliance.
