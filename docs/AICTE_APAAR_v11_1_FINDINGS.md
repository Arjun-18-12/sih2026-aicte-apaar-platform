# AICTE–APAAR Student Data Management Platform
## Findings & Defect Resolution Matrix (v11.1)
**Document Status:** OFFICIAL REVIEW ARTIFACT  
**Repository:** `D:\aicte-apaar-platform`  
**Baseline Inspection:** `supabase/migrations/001_initial_schema.sql`  
**Review Date:** 2026-10-24  

---

## 1. Executive Summary of Investigation

Static analysis of the repository and earlier security proposals (v8 through v11) was conducted to verify every schema object, column, constraint, grant, and frontend query.

### Primary Discovery: Missing Migration Artifact
The proposed security remediation migration `002_rls_security_hardening.sql` **does NOT exist on disk** in `supabase/migrations/`. In earlier conversation turns (v8–v11), this migration was drafted solely inside markdown review artifacts and completion reports. The only migration file present in the repository is:
- `supabase/migrations/001_initial_schema.sql` (Baseline schema, 12 tables, 11 enums, 32 legacy policies).

Consequently, any references to evaluating "the v11 migration on disk" must evaluate the proposed SQL specification drafted in `docs/AICTE_APAAR_v11_MIGRATION_PLAN.md`.

---

## 2. Comprehensive Defect-by-Defect Matrix

| Finding ID | Severity | Scope / Location | Description & Concrete Evidence | Impact | Status | Proposed v11.1 Resolution |
|---|---|---|---|---|---|---|
| **F-01** | **CRITICAL** | Migration Artifacts | `002_rls_security_hardening.sql` is absent from `supabase/migrations/`. Only `001_initial_schema.sql` exists. | Staging cannot be deployed until a verified, approved SQL migration file is authored. | **CONFIRMED** | Maintain migration as a strictly documented proposal in `AICTE_APAAR_v11_1_MIGRATION_REVIEW.md`. Do not deploy to disk until all approval gates pass. |
| **F-02** | **CRITICAL** | Student Identity Authorization | v10/v11 drafts did not provide a formal correction workflow after revoking direct student updates. | Legitimate typo corrections on unverified student records are blocked, forcing admins to seek database-level manual edits. | **CONFIRMED** | Implement RPC `correct_student_demographics()` restricted to the enrolled institution while student is unverified. If verified, updates require AICTE review. |
| **F-03** | **CRITICAL** | CSV Upload Disconnect | `src/pages/institution/CSVUploadPage.tsx:123-170` creates batches and validates rows in client JS, but never invokes `enrol_student_atomic()`. | No student or enrolment records are written to PostgreSQL during CSV batch upload; batches remain empty shells. | **CONFIRMED** | Define complete 10-stage CSV workflow in `AICTE_APAAR_v11_1_CSV_WORKFLOW.md` with row-level commits and client integration contract. |
| **F-04** | **CRITICAL** | Official Verification Boundary | Directory `supabase/functions/` is missing; no DigiLocker/UIDAI credentials or contracts exist. | Official verification cannot be performed safely. Calling RPC with caller-supplied proof allows verification forgery. | **CONFIRMED** | Formally reclassify official verification as **BLOCKED — OFFICIAL CONTRACT REQUIRED**. Keep mock verification explicitly labelled as simulation. |
| **F-05** | **HIGH** | Membership Cardinality Policy | v11 enforced 1 active membership per profile, deactivating previous memberships upon reassignment. | Could unexpectedly deactivate legitimate access if an administrator legitimately oversees multiple colleges under one university. | **CONFIRMED** | Formally evaluate Option A (1 active institution) vs Option B (multi-institution). Recommend Option A for current release with clear operational trade-offs. |
| **F-06** | **HIGH** | Candidate APAAR Advisory Lock | v11 added `pg_advisory_xact_lock(hashtext('candidate_apaar_' || v_normalized_apaar))` but did not normalize non-digit characters in input. | Inputs with formatting spaces or dashes (e.g., "1234 5678 9012" vs "1234-5678-9012") hash to different lock keys, failing to prevent concurrent race conditions. | **CONFIRMED** | Enforce strict regex normalization `regexp_replace(trim(p_candidate_apaar_id), '[^0-9]', '', 'g')` and assert exactly 12 digits prior to locking. |
| **F-07** | **HIGH** | Unique Constraint Conflict Target in Enrolment | `enrol_student_atomic` in v11 used `ON CONFLICT (institution_id, institution_student_id, academic_year)`, ignoring `no_duplicate_enrolment (student_id, institution_id, programme_id, academic_year)`. | Concurrent duplicate enrolment of the same student into the same programme crashes with unhandled unique constraint violation instead of clean idempotency. | **CONFIRMED** | Add pre-check query on `no_duplicate_enrolment` within the locked transaction to return clean duplicate error before attempting insert. |
| **F-08** | **HIGH** | Audit Log Actor Attribution on System Operations | When `auth.uid()` is null, v11 labeled actor as `'unauthenticated_or_system'` without distinguishing internal triggers from unauthenticated API attempts. | Degrades audit forensic precision. | **CONFIRMED** | Check `current_user` and session context. Distinguish internal trigger execution from anon context. |
| **F-09** | **MEDIUM** | Frontend Query Dependency on Legacy Grants | `AICTEDashboard.tsx`, `DuplicateReviewPage.tsx`, `InstitutionsPage.tsx`, and `SubmissionsPage.tsx` perform direct updates on batches and cases. | Tightening table-level grants without corresponding column-level update grants will break AICTE review actions. | **CONFIRMED** | Ensure `duplicate_review_cases` and `submission_batches` grant column-level update on reviewer fields to AICTE administrators. |
| **F-10** | **MEDIUM** | Staging Backup Incompleteness | Previous proposals recommended `supabase db dump --data=true`, which omits DDL, triggers, RLS, and grants. | A restore using this dump fails to recover security policies and constraints. | **CONFIRMED** | Replace with comprehensive backup strategy combining full schema DDL (`--data=false`), row data (`--data=true`), and PostgreSQL custom binary dump (`pg_dump -Fc`). |

---

## 3. Unresolved Assumptions & External Blockers

1. **DigiLocker / UIDAI Gateway Protocol:** **BLOCKED**. No technical specification, public key infrastructure, or sandbox credentials are present in the repository. Official verification cannot proceed beyond simulation until AICTE provides official integration contracts.
2. **Multi-Institution Delegated Registrar Model:** Assumed strictly 1 active institution per profile (Option A). If AICTE governance mandates that registrars may administer multiple affiliated colleges simultaneously without separate accounts, an architectural revision to session tenant context will be required.
3. **Staging Environment Access:** No staging database connection is configured or accessible in the repository. All security tests remain in **PROPOSED** status until an authorized staging environment is provisioned.
