# AICTE–APAAR Student Data Management Platform
## Verifiable Test Plan & Execution Harness (v11.3)
**Document Status:** OFFICIAL TEST PLAN — PROPOSED STAGING HARNESS  
**Target Environment:** Isolated Disposable Local Database or Approved Staging Database  
**Database Engine:** PostgreSQL 14+ / Supabase PostgreSQL 15  
**Review Date:** 2026-10-24  

---

## 1. Operating Protocol & Execution Status Definitions

To guarantee documentation integrity and absolute safety:
- **No SQL has been executed against live or staging databases.**
- **No migrations have been applied to production environments.**
- **No student data has been accessed, modified, or simulated with real identities.**

### Status Designations
- **`NOT EXECUTED`**: Fully specified test case containing exact preconditions, operational SQL/curl commands, and deterministic assertions. Ready for execution in an approved disposable sandbox or staging environment.
- **`EXECUTED AND PASSED`**: Executed against an active test database with full verification evidence recorded in audit artifacts. *(No tests currently have this status)*.
- **`EXECUTED AND FAILED`**: Executed against an active test database where an assertion failed.
- **`BLOCKED`**: Cannot be executed due to missing external dependencies, credentials, or provider contracts (specifically official APAAR verification).

---

## 2. Comprehensive Test Catalog (18 Reconciled Scenarios)

| Test ID | Category | Scenario / Invariant Tested | Execution Status |
|---|---|---|---|
| **TEST-01** | Privacy & Perimeter | Anonymous REST Access Blocked | `NOT EXECUTED` |
| **TEST-02** | Tenant Isolation | Cross-Institution Tenant Data Read Blocked | `NOT EXECUTED` |
| **TEST-03** | Privilege Escalation | Public Signup Role Escalation Prevention | `NOT EXECUTED` |
| **TEST-04** | Data Integrity | Protected Student Demographics Direct Mutation Prevention | `NOT EXECUTED` |
| **TEST-05** | Audit & Integrity | Forged Verification Event Injection Prevention | `NOT EXECUTED` |
| **TEST-06** | Forensic Defense | Forged Audit Record Tampering Prevention | `NOT EXECUTED` |
| **TEST-07** | Tenant Lifecycle | Suspended Institution Access Revocation | `NOT EXECUTED` |
| **TEST-08** | Account Lifecycle | Membership Reassignment & Single Active Constraint | `NOT EXECUTED` |
| **TEST-09** | Input Sanitization | Strict Candidate APAAR Format Validation & Sanitization | `NOT EXECUTED` |
| **TEST-10** | Concurrency | Intake Quota Overbooking Prevention Under Race Load | `NOT EXECUTED` |
| **TEST-11** | Idempotency | Enrolment Idempotency Under 100% Intake Capacity | `NOT EXECUTED` |
| **TEST-12** | State Machine | Batch State Machine Illegal Transition Prevention | `NOT EXECUTED` |
| **TEST-13** | External Provider | Official APAAR Verification Workflow | `BLOCKED — OFFICIAL CONTRACT REQUIRED` |
| **TEST-14** | Perimeter Bypass | Direct Enrolment REST Insertion Blocked | `NOT EXECUTED` |
| **TEST-15** | Tenant Isolation | Duplicate Review Case Institutional Visibility & Scoping | `NOT EXECUTED` |
| **TEST-16** | System Provisioning | Initial AICTE Administrator CLI Bootstrap | `NOT EXECUTED` |
| **TEST-17** | Data Tampering | Batch Counter Tampering Prevention & Auto-Sync | `NOT EXECUTED` |
| **TEST-18** | Forensic Defense | Non-Spoofable Audit Attribution in `SECURITY DEFINER` | `NOT EXECUTED` |

---

## 3. Detailed Test Specifications

### TEST-01: Anonymous REST Access Blocked
- **Status:** `NOT EXECUTED`
- **Category:** Privacy & Perimeter Security
- **Objective:** Verify that unauthenticated requests to read student data receive zero rows and no data exposure.
- **Preconditions:** Disposable database running with v11.3 schema applied.
- **Execution:**
  ```bash
  curl -i -X GET "https://<PROJECT_REF>.supabase.co/rest/v1/students" \
    -H "apikey: <ANON_KEY>"
  ```
- **Expected Outcome & Assertion:**
  - HTTP 200 with empty JSON array `[]` or HTTP 401 Unauthorized.
  - Zero rows scanned or exposed. RLS policy evaluates to false.

---

### TEST-02: Cross-Institution Tenant Data Read Blocked
- **Status:** `NOT EXECUTED`
- **Category:** Multi-Tenant Isolation
- **Objective:** Verify that an administrator from Institution A cannot query, view, or export student records belonging exclusively to Institution B.
- **Preconditions:**
  - Institution A (`id = 'inst_a'`) has active student S1.
  - Institution B (`id = 'inst_b'`) has active student S2.
  - Caller authenticated as Admin A (`institution_id = 'inst_a'`).
- **Execution:**
  ```sql
  SET ROLE authenticated;
  SET request.jwt.claim.sub = '<ADMIN_A_UID>';
  SELECT * FROM public.students WHERE id = '<STUDENT_B_UUID>';
  ```
- **Expected Outcome & Assertion:**
  - Query returns **0 rows**.
  - RLS policy `students_select` asserts false.

---

### TEST-03: Public Signup Role Escalation Prevention
- **Status:** `NOT EXECUTED`
- **Category:** Privilege Escalation Prevention
- **Objective:** Verify that a public user attempting to self-assign the `aicte_admin` role or an active status during signup is forced to inactive `institution_admin`.
- **Preconditions:** Public visitor attempts signup via Supabase Auth API.
- **Execution:**
  ```javascript
  const { data, error } = await supabase.auth.signUp({
    email: 'attacker@example.com',
    password: 'SecurePassword123!',
    options: {
      data: {
        role: 'aicte_admin',
        is_active: true,
        full_name: 'Attacker'
      }
    }
  });
  ```
- **Expected Outcome & Assertion:**
  - Profile record created with:
    - `role = 'institution_admin'`
    - `is_active = false`
    - `institution_id = NULL`
  - Trigger `protect_profile_security_fields` overrides unauthorized payload fields.

---

### TEST-04: Protected Student Demographics Direct Mutation Prevention
- **Status:** `NOT EXECUTED`
- **Category:** Student Record Integrity
- **Objective:** Verify that an institutional administrator cannot bypass the controlled `correct_student_demographics` RPC and issue direct SQL updates to the `students` table.
- **Preconditions:** Caller authenticated as Admin A. Student S1 enrolled in Institution A.
- **Execution:**
  ```sql
  SET ROLE authenticated;
  SET request.jwt.claim.sub = '<ADMIN_A_UID>';
  UPDATE public.students SET full_name = 'Forged Name' WHERE id = '<STUDENT_A_UUID>';
  ```
- **Expected Outcome & Assertion:**
  - Operation aborted with PostgreSQL error `42501 (permission denied for table students)`.
  - Record remains unmodified.

---

### TEST-05: Forged Verification Event Injection Prevention
- **Status:** `NOT EXECUTED`
- **Category:** Identity Verification Integrity
- **Objective:** Verify that authenticated users cannot insert fake verification events into `verification_events`.
- **Preconditions:** Caller authenticated as Admin A.
- **Execution:**
  ```sql
  SET ROLE authenticated;
  SET request.jwt.claim.sub = '<ADMIN_A_UID>';
  INSERT INTO public.verification_events (
    student_id, verification_type, verification_status, verified_at
  ) VALUES (
    '<STUDENT_A_UUID>', 'apaar_api', 'success', NOW()
  );
  ```
- **Expected Outcome & Assertion:**
  - Operation aborted with PostgreSQL error `42501 (permission denied for table verification_events)`.

---

### TEST-06: Forged Audit Record Tampering Prevention
- **Status:** `NOT EXECUTED`
- **Category:** Forensic Non-Repudiation
- **Objective:** Verify that clients cannot directly insert, alter, or delete records in `public.audit_logs`.
- **Preconditions:** Caller authenticated as Admin A or AICTE Admin.
- **Execution:**
  ```sql
  SET ROLE authenticated;
  SET request.jwt.claim.sub = '<ADMIN_A_UID>';
  INSERT INTO public.audit_logs (action, entity_type, entity_id) VALUES ('FAKE_ACTION', 'students', '123');
  DELETE FROM public.audit_logs WHERE id = '<LOG_ID>';
  ```
- **Expected Outcome & Assertion:**
  - Both operations aborted with PostgreSQL error `42501 (permission denied for table audit_logs)`.

---

### TEST-07: Suspended Institution Access Revocation
- **Status:** `NOT EXECUTED`
- **Category:** Tenant Lifecycle & Revocation
- **Objective:** Verify that suspending an institution immediately revokes data access for all its members without modifying individual profile records.
- **Preconditions:** Institution A has `approval_status = 'suspended'`. Admin A belongs to Institution A.
- **Execution:**
  ```sql
  SET ROLE authenticated;
  SET request.jwt.claim.sub = '<ADMIN_A_UID>';
  SELECT * FROM public.programmes;
  ```
- **Expected Outcome & Assertion:**
  - Query returns **0 rows**.
  - Function `current_user_institution_id()` returns `NULL` because the institution is not in `'active'` status.

---

### TEST-08: Membership Reassignment & Single Active Constraint
- **Status:** `NOT EXECUTED`
- **Category:** Account Lifecycle & Role Invariant
- **Objective:** Verify that assigning an administrator to a new institution automatically deactivates their previous active membership, maintaining the `uq_profile_single_active_membership` invariant.
- **Preconditions:** Profile P1 has active membership at Institution A. AICTE Admin executes reassignment.
- **Execution:**
  ```sql
  SET ROLE authenticated;
  SET request.jwt.claim.sub = '<AICTE_ADMIN_UID>';
  UPDATE public.profiles SET institution_id = '<INSTITUTION_B_UUID>' WHERE id = '<PROFILE_P1_UID>';
  ```
- **Expected Outcome & Assertion:**
  - Membership row for Institution A has `is_active = false`.
  - Membership row for Institution B has `is_active = true`.
  - `SELECT COUNT(*) FROM institution_memberships WHERE profile_id = '<PROFILE_P1_UID>' AND is_active = true` returns **exactly 1**.

---

### TEST-09: Strict Candidate APAAR Format Validation & Sanitization
- **Status:** `NOT EXECUTED`
- **Category:** Input Sanitization & Validation
- **Objective:** Verify that candidate APAAR inputs with non-numeric letters (e.g., `"1234ABCD5678"`) are rejected rather than silently sanitized.
- **Preconditions:** Caller authenticated as Admin A.
- **Execution:**
  ```sql
  SELECT public.enrol_student_atomic(
    '<INST_A_UUID>', '<PROG_UUID>', '2026-2027', '<BATCH_UUID>',
    'STU-ERR-01', 'Test Student', '2004-01-01', 'male', '1234ABCD5678'
  );
  ```
- **Expected Outcome & Assertion:**
  - Transaction aborted with error code `22023 (Invalid APAAR format: identifier contains forbidden characters)`.

---

### TEST-10: Intake Quota Overbooking Prevention Under Race Load
- **Status:** `NOT EXECUTED`
- **Category:** Transactional Concurrency Control
- **Objective:** Verify that two concurrent enrolment transactions cannot overbook an approved intake quota limit of 1.
- **Preconditions:**
  - Approved intake quota for Programme P = 1.
  - Current enrolled students = 0.
- **Execution:**
  - Worker 1 executes `enrol_student_atomic` for Student A.
  - Worker 2 executes `enrol_student_atomic` for Student B concurrently.
- **Expected Outcome & Assertion:**
  - Worker 1 successfully commits enrolment.
  - Worker 2 is serialized by `FOR UPDATE` on `approved_intakes` and aborts with error `54000 (Intake capacity exceeded)`.
  - Final count of enrolled students in programme equals **exactly 1**.

---

### TEST-11: Enrolment Idempotency Under 100% Intake Capacity
- **Status:** `NOT EXECUTED`
- **Category:** Idempotency & Quota Invariant (Defect F-11.3-01)
- **Objective:** Verify that when a programme is at 100% capacity, retrying an existing enrolment succeeds cleanly without raising quota exhaustion.
- **Preconditions:**
  - Programme has capacity 10 / 10 (100% full).
  - Student S10 is enrolled with `institution_student_id = 'STU-10'`, name `'Student Ten'`, DOB `'2004-10-10'`.
- **Execution:**
  ```sql
  SELECT public.enrol_student_atomic(
    '<INST_A_UUID>', '<PROG_UUID>', '2026-2027', '<BATCH_UUID>',
    'STU-10', 'Student Ten', '2004-10-10', 'male', NULL
  );
  ```
- **Expected Outcome & Assertion:**
  - Procedure returns record with:
    - `status_code = 'already_enrolled'`
    - `enrolment_id = '<EXISTING_ENROLMENT_ID>'`
  - Zero quota burn; no exception raised.

---

### TEST-12: Batch State Machine Illegal Transition Prevention
- **Status:** `NOT EXECUTED`
- **Category:** Workflow State Integrity
- **Objective:** Verify that an institutional administrator cannot jump a batch directly from `draft` to `approved`.
- **Preconditions:** Batch B1 in `draft` status. Caller authenticated as Admin A.
- **Execution:**
  ```sql
  SET ROLE authenticated;
  SET request.jwt.claim.sub = '<ADMIN_A_UID>';
  UPDATE public.submission_batches SET status = 'approved' WHERE id = '<BATCH_B1_UUID>';
  ```
- **Expected Outcome & Assertion:**
  - Operation aborted with error `55000 (Illegal batch transition from draft to approved for institution_admin)`.

---

### TEST-13: Official APAAR Verification Workflow
- **Status:** **`BLOCKED — OFFICIAL PROVIDER CONTRACT REQUIRED; PROCEDURE INTENTIONALLY UNAVAILABLE`**
- **Category:** External Provider Integration
- **Objective:** Formally verify the official DigiLocker/UIDAI APAAR verification webhook and RPC.
- **Blocker Declaration:**
  This test cannot be executed. No external API specifications, mTLS certificates, or signing keys exist in the repository. The proposed `execute_official_apaar_verification` RPC is deliberately omitted from the schema until provider specifications are available.

---

### TEST-14: Direct Enrolment REST Insertion Blocked
- **Status:** `NOT EXECUTED`
- **Category:** Perimeter Security
- **Objective:** Verify that clients cannot bypass `enrol_student_atomic` by issuing direct `POST /rest/v1/enrolments` calls.
- **Preconditions:** Caller authenticated as Admin A.
- **Execution:**
  ```bash
  curl -i -X POST "https://<PROJECT_REF>.supabase.co/rest/v1/enrolments" \
    -H "apikey: <ANON_KEY>" \
    -H "Authorization: Bearer <ADMIN_A_JWT>" \
    -H "Content-Type: application/json" \
    -d '{"student_id": "<UUID>", "institution_id": "<INST_A_UUID>", "programme_id": "<PROG_UUID>"}'
  ```
- **Expected Outcome & Assertion:**
  - HTTP 403 Forbidden or PostgreSQL error `42501 (permission denied for table enrolments)`.

---

### TEST-15: Duplicate Review Case Institutional Visibility & Scoping
- **Status:** `NOT EXECUTED`
- **Category:** Multi-Tenant Isolation & Duplicate Routing (Defect F-11.3-03)
- **Objective:** Verify that an institution can view duplicate review cases originating from its own batches, while unrelated institutions receive 0 rows.
- **Preconditions:**
  - Duplicate case C1 created from a batch belonging to Institution A.
  - Caller 1: Admin A (Institution A).
  - Caller 2: Admin B (Institution B).
- **Execution:**
  ```sql
  -- As Admin A
  SET ROLE authenticated;
  SET request.jwt.claim.sub = '<ADMIN_A_UID>';
  SELECT id FROM public.duplicate_review_cases WHERE id = '<CASE_C1_UUID>';

  -- As Admin B
  SET ROLE authenticated;
  SET request.jwt.claim.sub = '<ADMIN_B_UID>';
  SELECT id FROM public.duplicate_review_cases WHERE id = '<CASE_C1_UUID>';
  ```
- **Expected Outcome & Assertion:**
  - Admin A query returns **1 row** (case C1).
  - Admin B query returns **0 rows**.

---

### TEST-16: Initial AICTE Administrator CLI Bootstrap
- **Status:** `NOT EXECUTED`
- **Category:** System Bootstrap & Provisioning
- **Objective:** Verify that executing the audited CLI bootstrap script provisions the initial AICTE admin profile and emits an immutable audit log record.
- **Preconditions:** Fresh database with user `admin.system@aicte.gov.in` in `auth.users`.
- **Execution:**
  - Run audited bootstrap script from Section 5 of Security Review.
- **Expected Outcome & Assertion:**
  - `public.profiles` has `role = 'aicte_admin'`, `is_active = true`.
  - `public.audit_logs` contains record with `action = 'INITIAL_AICTE_ADMIN_BOOTSTRAP'`.

---

### TEST-17: Batch Counter Tampering Prevention & Auto-Sync
- **Status:** `NOT EXECUTED`
- **Category:** Data Integrity & Tamper Prevention (Defect F-11.3-05)
- **Objective:** Verify that record counters in `submission_batches` cannot be directly modified and are auto-computed from database rows.
- **Preconditions:** Batch B1 exists.
- **Execution:**
  ```sql
  -- 1. Attempt manual counter forgery
  SET ROLE authenticated;
  SET request.jwt.claim.sub = '<ADMIN_A_UID>';
  UPDATE public.submission_batches SET valid_records = 999 WHERE id = '<BATCH_B1_UUID>';

  -- 2. Insert an enrolment row via RPC and inspect counters
  -- (Trigger automatically synchronizes counters)
  ```
- **Expected Outcome & Assertion:**
  - Attempt 1: Aborted with `42501 (permission denied for column valid_records)`.
  - Attempt 2: `valid_records` in `submission_batches` matches `COUNT(*) FROM enrolments WHERE batch_id = B1`.

---

### TEST-18: Non-Spoofable Audit Attribution in `SECURITY DEFINER`
- **Status:** `NOT EXECUTED`
- **Category:** Forensic Attribution (Defect F-11.3-02)
- **Objective:** Verify that mutations executed inside `SECURITY DEFINER` functions correctly record the actor's real email and role rather than `'postgres'`.
- **Preconditions:** Caller authenticated as Admin A (`email = 'admin@college-a.edu'`).
- **Execution:**
  ```sql
  SET ROLE authenticated;
  SET request.jwt.claim.sub = '<ADMIN_A_UID>';
  UPDATE public.profiles SET full_name = 'Updated Admin Name' WHERE id = '<ADMIN_A_UID>';

  SELECT actor_email, actor_role, action, entity_type 
  FROM public.audit_logs 
  WHERE entity_id = '<ADMIN_A_UID>' 
  ORDER BY created_at DESC LIMIT 1;
  ```
- **Expected Outcome & Assertion:**
  - Query returns:
    - `actor_email = 'admin@college-a.edu'`
    - `actor_role = 'institution_admin'`
  - `actor_email` is NOT `'db_superuser_or_migration'` or `'postgres'`.
