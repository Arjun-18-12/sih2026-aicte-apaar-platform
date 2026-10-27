# AICTE–APAAR Student Data Management Platform
## Security Verification & Test Plan (v11)
**Document Status:** PROPOSAL / REVIEW ONLY — NO TESTS EXECUTED ON PRODUCTION  
**Target Repository:** `D:\aicte-apaar-platform`  
**Test Harness Baseline:** Staging PostgreSQL 15+ / Supabase Auth

---

## 1. Test Status Legend
In strict accordance with the mandatory operating rules:
- **`PROPOSED`**: Fully defined test case ready for execution in an approved, isolated staging environment.
- **`EXECUTED`**: Test has been run against a real database instance with captured execution logs.
- **`PASSED`**: Executed test met all assertion criteria.
- **`FAILED`**: Executed test failed one or more assertions.
- **`BLOCKED`**: Test cannot be executed due to missing dependencies, unconfirmed provider contracts, or missing staging infrastructure.

> [!CRITICAL]
> **Current Execution Status:** All tests in this document are currently **`PROPOSED`** (or **`BLOCKED`** where provider contracts are required). In strict compliance with read-only rules, **NO MUTATING TESTS HAVE BEEN EXECUTED AGAINST LIVE OR STAGING DATABASES**.

---

## 2. Comprehensive Security Test Matrix

### Test Case 1: Anonymous Access Blocked
- **Test ID:** `SEC-TEST-01`
- **Status:** **`PROPOSED`**
- **Security Invariant:** Anonymous clients cannot view, insert, update, or delete student records.
- **Setup:** Unauthenticated REST client (no Authorization Bearer header).
- **Action:** Execute HTTP GET `/rest/v1/students?select=*`.
- **Expected Outcome:** HTTP 401 Unauthorized or empty JSON array `[]` (RLS evaluate false).
- **Required Evidence:** Response status code 401/200 with zero data rows; PostgreSQL log confirms zero row scans.

### Test Case 2: Tenant Isolation Across Institutions
- **Test ID:** `SEC-TEST-02`
- **Status:** **`PROPOSED`**
- **Security Invariant:** Institutional administrators cannot read student or enrolment data of another institution.
- **Setup:** User A is authenticated and bound to Institution A (`inst_uuid_01`). Student B is enrolled exclusively in Institution B (`inst_uuid_02`).
- **Action:** User A executes `SELECT * FROM students WHERE id = 'student_uuid_b'`.
- **Expected Outcome:** Zero rows returned.
- **Required Evidence:** Query result set contains 0 rows; RLS policy `students_select` restricts access.

### Test Case 3: Public Signup Metadata Privilege Escalation
- **Test ID:** `SEC-TEST-03`
- **Status:** **`PROPOSED`**
- **Security Invariant:** User registration metadata cannot grant administrative roles or active status.
- **Setup:** Public visitor invokes `supabase.auth.signUp({ email, password, options: { data: { role: 'aicte_admin', is_active: true, institution_id: 'inst_uuid_01' } } })`.
- **Action:** Query the created profile in `public.profiles`.
- **Expected Outcome:** Profile is created with `role = 'institution_admin'`, `is_active = false`, and `institution_id = NULL`.
- **Required Evidence:** SQL query `SELECT role, is_active, institution_id FROM profiles WHERE id = ...` asserts inactive defaults.

### Test Case 4: Direct Student Field Tampering
- **Test ID:** `SEC-TEST-04`
- **Status:** **`PROPOSED`**
- **Security Invariant:** Institutional administrators cannot alter authoritative demographic fields or verified status.
- **Setup:** User A is active admin of Institution A. Student X is enrolled in Institution A.
- **Action:** User A executes `UPDATE students SET apaar_verification_status = 'verified', full_name = 'Compromised Name' WHERE id = 'student_x'`.
- **Expected Outcome:** Database aborts query with PostgreSQL error `42501 (permission denied for table students)`.
- **Required Evidence:** Error payload contains code `42501`; `SELECT full_name FROM students WHERE id = 'student_x'` confirms original data unchanged.

### Test Case 5: Client Audit Log & Verification Event Forgery
- **Test ID:** `SEC-TEST-05`
- **Status:** **`PROPOSED`**
- **Security Invariant:** Direct insertion or manipulation of audit logs and verification events is completely blocked.
- **Setup:** User A authenticated.
- **Action:** 
  1. `INSERT INTO audit_logs (actor_email, action) VALUES ('admin@aicte.gov.in', 'BATCH_APPROVED')`.
  2. `INSERT INTO verification_events (student_id, outcome, provider) VALUES ('student_x', 'verified', 'mock')`.
- **Expected Outcome:** Both statements fail with PostgreSQL error `42501 (permission denied for table audit_logs / verification_events)`.
- **Required Evidence:** Error code `42501` captured for both tables; audit count remains constant.

### Test Case 6: Parameter-Tampering Membership Bypass
- **Test ID:** `SEC-TEST-06`
- **Status:** **`PROPOSED`**
- **Security Invariant:** User cannot bypass tenant boundary by injecting `institution_id` in request payloads.
- **Setup:** User A belongs to Institution A.
- **Action:** User A calls `enrol_student_atomic(p_institution_id => 'inst_uuid_02', ...)` attempting to enroll into Institution B.
- **Expected Outcome:** Transaction aborts with error `42501 (Tenant authorization failure: caller cannot enrol for institution...)`.
- **Required Evidence:** SQL exception message matches authorization failure; zero enrolments created.

### Test Case 7: Inactive Profile and Suspended Institution Access
- **Test ID:** `SEC-TEST-07`
- **Status:** **`PROPOSED`**
- **Security Invariant:** Inactive users or users belonging to suspended institutions fail closed.
- **Setup:** Profile has `is_active = false` OR institution approval status is `suspended`.
- **Action:** User executes `SELECT * FROM programmes`.
- **Expected Outcome:** Returns 0 rows.
- **Required Evidence:** Function `current_user_institution_id()` evaluates to `NULL`; RLS blocks all rows.

### Test Case 8: Foreign Key & Cross-Institution Parameter Mismatch
- **Test ID:** `SEC-TEST-08`
- **Status:** **`PROPOSED`**
- **Security Invariant:** Enrolment creation rejects programmes or batches belonging to other institutions.
- **Setup:** User A belongs to Institution A. Programme P belongs to Institution B.
- **Action:** User A calls `enrol_student_atomic(p_institution_id => 'inst_a', p_programme_id => 'prog_b', ...)`.
- **Expected Outcome:** Aborts with error `22023 (Programme prog_b does not belong to institution inst_a)`.
- **Required Evidence:** Complete transaction rollback; error code `22023`.

### Test Case 9: Intake Quota Concurrency (Advisory & Row Locking)
- **Test ID:** `SEC-TEST-09`
- **Status:** **`PROPOSED`**
- **Security Invariant:** Concurrent enrolment submissions cannot exceed approved intake capacity.
- **Setup:** Programme Computer Science has approved intake limit of 1. Current enrolments = 0.
- **Action:** Two simultaneous worker sessions (Session 1 and Session 2) execute `enrol_student_atomic()` for the same programme and academic year.
- **Expected Outcome:** 
  - Session 1 acquires row lock on `approved_intakes`, verifies count 0 < 1, inserts enrolment, commits successfully.
  - Session 2 waits on row lock. Once Session 1 commits, Session 2 evaluates count 1 >= 1, and raises `54000 (Intake capacity exceeded)`.
- **Required Evidence:** Total active enrolments in database exactly equals 1. Session 2 captures error `54000`.

### Test Case 10: Concurrent Candidate APAAR Submissions
- **Test ID:** `SEC-TEST-10`
- **Status:** **`PROPOSED`**
- **Security Invariant:** Concurrent submissions for the same candidate APAAR identifier serialize cleanly without duplicate student creation.
- **Setup:** No student exists with candidate APAAR `999999999999`.
- **Action:** Two workers simultaneously submit enrolment for candidate APAAR `999999999999` with matching demographic data ("Aarav Patel", 2004-05-15).
- **Expected Outcome:** 
  - Worker 1 acquires advisory lock `hashtext('candidate_apaar_999999999999')`, inserts student, inserts enrolment 1, commits.
  - Worker 2 waits on advisory lock. Upon release, Worker 2 finds student created by Worker 1, verifies matching demographics, reuses existing student ID, inserts enrolment 2, commits.
- **Required Evidence:** Query `SELECT COUNT(*) FROM students WHERE apaar_id = '999999999999'` equals exactly 1. Both enrolments link to the same `student_id`.

### Test Case 11: Demographic Conflict Handling (Non-Rollback Case Survival)
- **Test ID:** `SEC-TEST-11`
- **Status:** **`PROPOSED`**
- **Security Invariant:** An unverified candidate APAAR matching an existing student with conflicting demographics produces a persistent duplicate review case without creating an active enrolment or rolling back the review case.
- **Setup:** Student 1 exists with APAAR `888888888888`, Name "Vikram Sharma", DOB `2003-10-10`.
- **Action:** Worker calls `enrol_student_atomic` with candidate APAAR `888888888888`, Name "Rohit Verma", DOB `2004-01-01`.
- **Expected Outcome:**
  - Procedure detects demographic discrepancy.
  - Inserts candidate student record with `apaar_id = NULL`.
  - Inserts duplicate review case linking Student 1 and Candidate Student with reason code `ERR_DEMOGRAPHIC_MISMATCH`.
  - Returns `{ status_code: 'duplicate_review_required', duplicate_case_id: 'uuid_case' }`. Transaction commits cleanly.
- **Required Evidence:** Query `SELECT * FROM duplicate_review_cases WHERE id = 'uuid_case'` confirms case persists in database. Student 1 remains untouched.

### Test Case 12: Illegal Enrolment State Machine Skip
- **Test ID:** `SEC-TEST-12`
- **Status:** **`PROPOSED`**
- **Security Invariant:** Role-based transition matrix prevents illegal status skipping.
- **Setup:** Enrolment is in `submission_status = 'draft'`.
- **Action:** Institutional Admin attempts `UPDATE enrolments SET submission_status = 'approved'`.
- **Expected Outcome:** Database trigger `trg_enrolment_status_transition` raises exception `55000 (Illegal status transition from draft to approved for institution_admin)`.
- **Required Evidence:** Update fails with code `55000`; enrolment status remains `draft`.

### Test Case 13: Legitimate Batch State Transition Functional
- **Test ID:** `SEC-TEST-13`
- **Status:** **`PROPOSED`**
- **Security Invariant:** Authorized transitions operate cleanly under appropriate roles.
- **Setup:** Submission batch is in `'draft'` with 5 valid enrolments.
- **Action:** Institutional Admin updates batch status to `'submitted'`.
- **Expected Outcome:** Batch status becomes `'submitted'`. Associated enrolments transition to `'submitted'`.
- **Required Evidence:** Query confirms `status = 'submitted'` on batch and all 5 enrolments.

### Test Case 14: Ordinary Signup Least-Privilege Verification
- **Test ID:** `SEC-TEST-14`
- **Status:** **`PROPOSED`**
- **Security Invariant:** Standard user registration grants zero ambient operational privileges.
- **Setup:** New user signs up with valid credentials.
- **Action:** Authenticate as newly registered user and attempt `SELECT * FROM students`, `SELECT * FROM submission_batches`.
- **Expected Outcome:** Both queries return 0 rows.
- **Required Evidence:** User is inactive (`is_active = false`), has no institution memberships, and cannot read operational records.

### Test Case 15: Authorized AICTE Administrator Provisioning
- **Test ID:** `SEC-TEST-15`
- **Status:** **`PROPOSED`**
- **Security Invariant:** AICTE Admin can activate and assign institution administrators via trusted administrative path.
- **Setup:** Inactive user profile exists. Active AICTE Admin authenticated.
- **Action:** AICTE Admin executes `UPDATE profiles SET is_active = true, institution_id = 'inst_01' WHERE id = 'user_id'`.
- **Expected Outcome:** Profile updates successfully. Trigger `sync_profile_membership_state` creates active record in `institution_memberships`.
- **Required Evidence:** `institution_memberships` contains active row for `user_id` and `inst_01`.

### Test Case 16: Combined RLS and Table-Level Grant Enforcement
- **Test ID:** `SEC-TEST-16`
- **Status:** **`PROPOSED`**
- **Security Invariant:** Both SQL privileges and RLS are enforced in depth; revoking table grants blocks REST bypasses.
- **Setup:** Institutional Admin authenticated.
- **Action:** Client sends direct PostgREST HTTP POST `/rest/v1/enrolments` with valid payload.
- **Expected Outcome:** HTTP 403 / PostgreSQL error `42501 (permission denied for table enrolments)`.
- **Required Evidence:** Direct write rejected; enrolment creation only permitted via RPC `enrol_student_atomic`.

### Test Case 17: Comprehensive Audit Coverage
- **Test ID:** `SEC-TEST-17`
- **Status:** **`PROPOSED`**
- **Security Invariant:** Mutations on batches, profiles, memberships, and students produce immutable audit records with redacted PII.
- **Setup:** Authenticated session updates `submission_batches.status`.
- **Action:** Inspect `audit_logs` table for generated event.
- **Expected Outcome:** Audit log entry present with authentic `actor_id`, `actor_email`, `action = 'UPDATE'`, `entity_type = 'submission_batches'`.
- **Required Evidence:** Audit log row verified; student audit logs confirm `date_of_birth` and `apaar_id` are redacted from JSON diffs.

### Test Case 18: Verification Fabrication Prevention
- **Test ID:** `SEC-TEST-18`
- **Status:** **`PROPOSED`**
- **Security Invariant:** Supplying arbitrary reference strings or timestamps cannot set verified status.
- **Setup:** Institutional Admin attempts to invoke `execute_official_apaar_verification()`.
- **Action:** Direct RPC invocation from client session.
- **Expected Outcome:** PostgreSQL error `42501 (execute_official_apaar_verification requires service_role)`.
- **Required Evidence:** Error `42501`; student status remains `unverified`.

### Test Case 19: Retriable CSV Batch Processing Idempotency
- **Test ID:** `SEC-TEST-19`
- **Status:** **`PROPOSED`**
- **Security Invariant:** Network drop during bulk upload allows safe retry without creating duplicate enrolments.
- **Setup:** Batch contains 10 rows. Rows 1–5 process successfully; row 6 simulates network timeout.
- **Action:** Client retries upload of all 10 rows with identical `institution_student_id` values.
- **Expected Outcome:** Rows 1–5 are recognized via existing unique index, returning existing IDs without errors. Rows 6–10 process to completion.
- **Required Evidence:** Exactly 10 enrolments exist in batch; record count matches expected total.

### Test Case 20: Preflight and Post-Migration Schema Verification
- **Test ID:** `SEC-TEST-20`
- **Status:** **`PROPOSED`**
- **Security Invariant:** Preflight script detects schema discrepancies, duplicate memberships, and grant regressions.
- **Setup:** Run preflight diagnostic SQL before and after applying migration.
- **Action:** Compare diagnostic output tables.
- **Expected Outcome:** Zero duplicate active memberships; RLS enabled on all 12 tables; table grants on sensitive tables revoked.
- **Required Evidence:** Preflight SQL report matches approved baseline specification.
