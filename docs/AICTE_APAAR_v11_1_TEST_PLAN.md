# AICTE–APAAR Student Data Management Platform
## Verifiable Security Test Plan (v11.1)
**Document Status:** OFFICIAL REVIEW ARTIFACT — REPRODUCIBLE SPECIFICATIONS  
**Target Environment:** Staging PostgreSQL 15+ / Supabase Auth  
**Review Date:** 2026-10-24  

---

## 1. Test Status Protocol
- **`PROPOSED`**: Fully specified test case ready for automated execution on an isolated staging database.
- **`EXECUTED`**: Test has been run against a real database instance with captured log output.
- **`PASSED`**: Executed test satisfied all assertions.
- **`FAILED`**: Executed test failed one or more assertions.
- **`BLOCKED`**: Test requires missing dependencies or unconfirmed provider credentials.

> [!CRITICAL]
> **Execution Declaration:** All tests below are **`PROPOSED`** (or **`BLOCKED`**). In strict adherence to read-only review rules, **NO TESTS HAVE BEEN EXECUTED AGAINST LIVE DATABASES**.

---

## 2. Test Specifications (18 Core Scenarios)

### SEC-01: Anonymous Access Rejection
- **Status:** `PROPOSED`
- **Preconditions:** Unauthenticated client (no Authorization Bearer header).
- **Operation:** `GET /rest/v1/students?select=*`
- **Expected Outcome:** HTTP 401 Unauthorized or empty JSON array `[]`. Zero rows returned.
- **Evidence Required:** Response status code 401/200 with zero data rows; PostgreSQL query log confirms RLS filter applied.

### SEC-02: Tenant Isolation Across Institutions
- **Status:** `PROPOSED`
- **Preconditions:** User A authenticated and bound to Institution A. Student B enrolled exclusively in Institution B.
- **Operation:** `SELECT * FROM students WHERE id = 'student_uuid_b';`
- **Expected Outcome:** 0 rows returned.
- **Evidence Required:** Query result contains 0 rows; RLS policy `students_select` asserts false.

### SEC-03: Signup Metadata Role Escalation Prevention
- **Status:** `PROPOSED`
- **Preconditions:** Unregistered visitor signs up via Supabase Auth.
- **Operation:** `supabase.auth.signUp({ email, password, options: { data: { role: 'aicte_admin', is_active: true } } })`
- **Expected Outcome:** Profile created in `public.profiles` with `role = 'institution_admin'`, `is_active = false`, and `institution_id = NULL`.
- **Evidence Required:** Query `SELECT role, is_active FROM profiles WHERE id = ...` asserts inactive defaults.

### SEC-04: Direct Student Demographic Update Rejection
- **Status:** `PROPOSED`
- **Preconditions:** User A is active admin of Institution A. Student X enrolled in Institution A.
- **Operation:** Direct SQL update: `UPDATE students SET full_name = 'Hacked Name' WHERE id = 'student_x';`
- **Expected Outcome:** PostgreSQL error `42501 (permission denied for table students)`.
- **Evidence Required:** Error code `42501` returned; `full_name` remains unmodified.

### SEC-05: Direct Verification Event Forgery Prevention
- **Status:** `PROPOSED`
- **Preconditions:** Authenticated institutional administrator.
- **Operation:** `INSERT INTO verification_events (student_id, outcome, provider) VALUES ('student_x', 'verified', 'mock');`
- **Expected Outcome:** PostgreSQL error `42501 (permission denied for table verification_events)`.
- **Evidence Required:** Error code `42501`; verification events table unchanged.

### SEC-06: Direct Audit Log Injection Prevention
- **Status:** `PROPOSED`
- **Preconditions:** Authenticated institutional administrator.
- **Operation:** `INSERT INTO audit_logs (action, entity_type) VALUES ('BATCH_APPROVED', 'submission_batches');`
- **Expected Outcome:** PostgreSQL error `42501 (permission denied for table audit_logs)`.
- **Evidence Required:** Error code `42501`; audit log row count remains constant.

### SEC-07: Inactive Account and Suspended Institution Access
- **Status:** `PROPOSED`
- **Preconditions:** Profile has `is_active = false` OR institution `approval_status = 'suspended'`.
- **Operation:** User attempts `SELECT * FROM programmes;`
- **Expected Outcome:** 0 rows returned.
- **Evidence Required:** `current_user_institution_id()` evaluates to NULL; RLS blocks query.

### SEC-08: Membership Reassignment Lifecycle Reconciliation
- **Status:** `PROPOSED`
- **Preconditions:** User A is active at Institution A. AICTE Admin reassigns User A to Institution B.
- **Operation:** AICTE Admin executes: `UPDATE profiles SET institution_id = 'inst_b' WHERE id = 'user_a';`
- **Expected Outcome:** Trigger `sync_profile_membership_state` deactivates Institution A membership and creates/activates Institution B membership. Exactly 1 active membership row exists.
- **Evidence Required:** Query confirms `SELECT COUNT(*) FROM institution_memberships WHERE profile_id = 'user_a' AND is_active = true` equals 1 with `institution_id = 'inst_b'`.

### SEC-09: Concurrent Duplicate Candidate APAAR Submissions
- **Status:** `PROPOSED`
- **Preconditions:** No student exists with candidate APAAR `888888888888`.
- **Operation:** Workers 1 & 2 simultaneously call `enrol_student_atomic` with candidate APAAR `888888888888` and identical demographics ("Rahul Kumar", 2004-01-01).
- **Expected Outcome:** Advisory transaction lock serializes execution. Worker 1 creates student; Worker 2 matches existing student. Exactly 1 student record created.
- **Evidence Required:** `SELECT COUNT(*) FROM students WHERE apaar_id = '888888888888'` equals 1. Both enrolments link to the same student ID.

### SEC-10: Intake Capacity Overbooking Prevention Under Concurrency
- **Status:** `PROPOSED`
- **Preconditions:** Programme approved intake = 1. Active enrolments = 0.
- **Operation:** Workers 1 & 2 simultaneously call `enrol_student_atomic` for the same programme.
- **Expected Outcome:** Worker 1 row-locks intake, verifies capacity, commits enrolment. Worker 2 waits on lock, re-evaluates count = 1 >= 1, raises `54000 (Intake capacity exceeded)`.
- **Evidence Required:** Total active enrolments equals 1. Worker 2 receives error code `54000`.

### SEC-11: CSV Retriable Upload Deduplication
- **Status:** `PROPOSED`
- **Preconditions:** Batch contains 10 rows. Rows 1–5 process; row 6 simulates network drop.
- **Operation:** Client re-uploads all 10 rows with identical `institution_student_id` values.
- **Expected Outcome:** Rows 1–5 update cleanly via unique constraint conflict target without creating duplicate enrolments. Rows 6–10 process to completion.
- **Evidence Required:** Exactly 10 enrolments exist in batch; zero duplicate key exceptions.

### SEC-12: Illegal Enrolment State Transition Rejection
- **Status:** `PROPOSED`
- **Preconditions:** Enrolment in `submission_status = 'draft'`.
- **Operation:** Institutional Admin executes: `UPDATE enrolments SET submission_status = 'approved';`
- **Expected Outcome:** Trigger `trg_enrolment_status_transition` raises `55000 (Illegal status transition)`.
- **Evidence Required:** Query fails with code `55000`; enrolment status remains `draft`.

### SEC-13: Privileged Function EXECUTE Grants Inspection
- **Status:** `PROPOSED`
- **Preconditions:** Authenticated non-service-role user.
- **Operation:** `SELECT execute_official_apaar_verification('uuid', '123456789012', 'verified', 'uidai', NOW(), 'ref');`
- **Expected Outcome:** PostgreSQL error `42501 (permission denied for function execute_official_apaar_verification)`.
- **Evidence Required:** Error code `42501`; execution blocked.

### SEC-14: Direct Database Privilege Bypass Rejection
- **Status:** `PROPOSED`
- **Preconditions:** Authenticated institutional administrator.
- **Operation:** Direct REST POST `/rest/v1/enrolments` bypassing `enrol_student_atomic`.
- **Expected Outcome:** HTTP 403 / Error `42501 (permission denied for table enrolments)`.
- **Evidence Required:** Direct write rejected; enrolment creation only permitted via stored procedure.

### SEC-15: Duplicate Review Case Visibility Isolation
- **Status:** `PROPOSED`
- **Preconditions:** Duplicate review case exists between Institution A and Institution B. Institution C admin authenticated.
- **Operation:** Institution C admin executes `SELECT * FROM duplicate_review_cases;`
- **Expected Outcome:** Returns 0 rows.
- **Evidence Required:** Policy `duplicate_cases_select` restricts read strictly to participating institutions and AICTE admin.

### SEC-16: First-Admin Provisioning Bootstrap Verification
- **Status:** `PROPOSED`
- **Preconditions:** Fresh database deployment. No AICTE administrators exist.
- **Operation:** Execute audited CLI bootstrap script inserting first AICTE admin profile.
- **Expected Outcome:** First AICTE admin profile created with `role = 'aicte_admin'`, `is_active = true`. Subsequent public signups cannot claim this role.
- **Evidence Required:** `profiles` contains exactly 1 active AICTE admin; public signup trigger continues to enforce inactive defaults.

### SEC-17: Schema & Migration Consistency Audit
- **Status:** `PROPOSED`
- **Preconditions:** Baseline schema `001_initial_schema.sql` applied.
- **Operation:** Execute Preflight SQL diagnostic script.
- **Expected Outcome:** Preflight script confirms all 12 tables present, 11 enums aligned, zero duplicate active memberships.
- **Evidence Required:** Preflight diagnostic report matches baseline specifications.

### SEC-18: Audit Coverage & Redaction Verification
- **Status:** `PROPOSED`
- **Preconditions:** Authenticated session modifies `submission_batches` and `students`.
- **Operation:** Inspect `public.audit_logs` for generated entries.
- **Expected Outcome:** Audit entries record verified caller email, action, and table. Student diffs confirm `date_of_birth` and `apaar_id` are redacted from JSON diffs.
- **Evidence Required:** `SELECT old_values, new_values FROM audit_logs WHERE entity_type = 'students'` asserts no unmasked PII.
