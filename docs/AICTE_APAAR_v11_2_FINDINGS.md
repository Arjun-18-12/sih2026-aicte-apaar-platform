# AICTE–APAAR Student Data Management Platform
## Findings & Defect Resolution Matrix (v11.2)
**Document Status:** OFFICIAL DEFECT REVIEW & RESOLUTION MATRIX  
**Repository:** `D:\aicte-apaar-platform`  
**Baseline Migration:** `supabase/migrations/001_initial_schema.sql`  
**Review Date:** 2026-10-24  

---

## 1. Executive Summary

A comprehensive forensic review of the proposed v11 SQL specification (`AICTE_APAAR_v11_MIGRATION_PLAN.md`) was conducted against the repository baseline. While v11 resolved earlier syntax and grant-shadowing flaws, deep code analysis identified critical security defects, unhandled concurrency collisions, and incomplete state machines in the proposed SQL.

This document catalogs every remaining defect, line-by-line evidence from the schema and proposed SQL, and the exact v11.2 corrections.

---

## 2. Severity-Ranked Defect Catalog

| Defect ID | Severity | Category | Concrete Flaw in v11 Proposed SQL | Security & Operational Impact | v11.2 Exact Correction |
|---|---|---|---|---|---|
| **V11-01** | **CRITICAL** | Student Identity Contamination | `enrol_student_atomic()` populated candidate identifier directly into `students.apaar_id` with `apaar_verification_status = 'unverified'`. | Downstream consumers checking `if (student.apaar_id)` treat unverified candidate IDs as authoritative. Unverified numbers could contaminate cross-institution records. | Add `candidate_apaar_id` column to `students`. Keep authoritative `apaar_id` strictly `NULL` until confirmed by official verification. |
| **V11-02** | **CRITICAL** | Unsubstantiated Verification RPC | `execute_official_apaar_verification()` accepted caller-supplied outcome, source, timestamp, and reference via `service_role`. | `service_role` check does not prove provider authenticity. Since no Edge Function or provider contract exists, this RPC presents an illusion of verification. | Mark official verification as **BLOCKED — OFFICIAL CONTRACT REQUIRED**. Strictly isolate mock verification (`is_simulated = true`). Prevent RPC from claiming official status. |
| **V11-03** | **CRITICAL** | Ambiguous Tenant Selection | `current_user_institution_id()` used non-deterministic `LIMIT 1` without ordering. | If multiple active memberships exist, arbitrary institution is selected on every query. Automatic deactivation in trigger could silently strip access. | Replace `LIMIT 1` with `SELECT INTO STRICT`. If multiple active memberships exist, fail closed (`TOO_MANY_ROWS`). Enforce Option A unique index cleanly. |
| **V11-04** | **HIGH** | Insecure Search Path Ordering | Functions set `search_path = public, pg_catalog`, placing the writable `public` schema ahead of `pg_catalog`. | User-defined objects in `public` can shadow system operators and functions in `pg_catalog` inside `SECURITY DEFINER` execution. | Reorder to `SET search_path = pg_catalog, public;` across all 13 security definer functions and schema-qualify all references. |
| **V11-05** | **HIGH** | Dual-Constraint Enrolment Collision | `enrol_student_atomic` only handled `ON CONFLICT (institution_id, institution_student_id, academic_year)`, ignoring `no_duplicate_enrolment (student_id, institution_id, programme_id, academic_year)`. | A concurrent or duplicate enrolment for the same student in the same programme crashes with unhandled unique constraint violation. | Explicitly query and validate both constraints inside the transaction before insert. Return structured code `already_enrolled` or error. |
| **V11-06** | **HIGH** | Missing Batch State Transition Guard | `submission_batches` had broad RLS update and reviewer metadata trigger, but lacked a status transition trigger. | Institution admins can directly update batch status to `approved` or `rejected` via direct API call, bypassing AICTE review. | Implement `trg_batch_status_transition` enforcing strict role-based state matrix on `submission_batches`. |
| **V11-07** | **HIGH** | Incomplete Audit Coverage | Audit triggers were attached only to 4 tables (`submission_batches`, `profiles`, `institution_memberships`, `students`). | Mutations on enrolments, verification events, duplicate cases, intakes, programmes, and institutions were unlogged. | Attach audit triggers across all 10 operational application tables. |
| **V11-08** | **HIGH** | Ambiguous System Audit Attribution | Unauthenticated contexts were grouped under `'unauthenticated_or_system'`. | Investigators cannot distinguish internal database trigger execution, background service roles, and anonymous client requests. | Differentiate attribution using `current_user`: `'service_role_internal'`, `'anon_client'`, `'db_superuser_or_migration'`. |
| **V11-09** | **MEDIUM** | Over-Permissive APAAR Sanitization | `regexp_replace(trim(p_candidate_apaar_id), '[^0-9]', '', 'g')` stripped letters, turning malformed strings (e.g. \"A123-4567-8901Z\") into valid 12-digit numbers. | Garbage, malicious, or mistyped input masked as valid identifiers instead of being rejected. | Validate input against strict regex `^[0-9\s\-]+$` first. Reject letters/symbols. Then normalize spaces/dashes and assert 12 digits. |
| **V11-10** | **MEDIUM** | Incomplete Staging Backup Strategy | Proposed commands (`supabase db dump --data=true`) omitted DDL, functions, triggers, and grants. | Restoring from this dump fails to recover security policies, constraints, and triggers. | Detail verified backup procedure combining full DDL (`--data=false`), row data (`--data=true`), and PostgreSQL custom binary archive (`pg_dump -Fc`). |

---

## 3. External Blockers Requiring Human Authorization

1. **Official Provider Contract:** DigiLocker / UIDAI API specifications, mTLS certificates, and HMAC signing keys are absent from the repository. Official verification remains **BLOCKED**.
2. **AICTE Multi-Institution Policy:** Confirmation of **Option A** (strictly 1 active institution per administrator) vs. **Option B** (multi-institution delegation). Option A is recommended and implemented in v11.2.
3. **Frontend CSV Upload Alignment:** [CSVUploadPage.tsx](file:///d:/aicte-apaar-platform/src/pages/institution/CSVUploadPage.tsx) must be updated to call `enrol_student_atomic` sequentially for valid parsed rows.
