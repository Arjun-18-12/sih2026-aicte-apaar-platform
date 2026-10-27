# AICTE–APAAR Student Data Management Platform
## Verifiable Test Plan & Reproducible Execution Harness (v11.2)
**Document Status:** OFFICIAL TEST PLAN — PROPOSED STAGING HARNESS  
**Target Environment:** Staging PostgreSQL 15+ / Supabase Auth  

---

## 1. Execution Protocol & Status Definitions
- **`NOT EXECUTED / PROPOSED`**: Fully specified test case ready for staging execution.
- **`EXECUTED AND PASSED`**: Executed on real database instance; verified logs captured.
- **`EXECUTED AND FAILED`**: Executed on real database instance; assertion failed.
- **`BLOCKED`**: Requires external credentials or missing staging infrastructure.

> [!CRITICAL]
> **Status Declaration:** In accordance with operating rules, **NO MUTATING TESTS HAVE BEEN EXECUTED ON LIVE OR STAGING DATABASES**. All tests below are accurately designated **`NOT EXECUTED / PROPOSED`** (or **`BLOCKED`**).

---

## 2. Test Specifications (18 Core Scenarios)

| Test ID | Status | Test Scenario | Preconditions | Exact Operation | Expected Outcome & Assertion |
|---|---|---|---|---|---|
| **TEST-01** | `NOT EXECUTED` | Anonymous Access Blocked | Unauthenticated client | `GET /rest/v1/students` | HTTP 401 Unauthorized or empty array. 0 rows scanned. |
| **TEST-02** | `NOT EXECUTED` | Cross-Institution Data Read | Admin A at Inst A | `SELECT * FROM students WHERE id = 'student_b'` | 0 rows returned. RLS policy `students_select` asserts false. |
| **TEST-03** | `NOT EXECUTED` | Public Signup Role Escalation | Visitor signup | `signUp({ options: { data: { role: 'aicte_admin' } } })` | Profile created with `role = 'institution_admin'`, `is_active = false`. |
| **TEST-04** | `NOT EXECUTED` | Protected Identity Direct Update | Admin A at Inst A | `UPDATE students SET full_name = 'X' WHERE id = 's1'` | Error `42501 (permission denied for table students)`. Field unmodified. |
| **TEST-05** | `NOT EXECUTED` | Forged Verification Event | Admin A at Inst A | `INSERT INTO verification_events (...) VALUES (...)` | Error `42501 (permission denied for table verification_events)`. |
| **TEST-06** | `NOT EXECUTED` | Forged Audit Record Insert | Admin A at Inst A | `INSERT INTO audit_logs (...) VALUES (...)` | Error `42501 (permission denied for table audit_logs)`. |
| **TEST-07** | `NOT EXECUTED` | Suspended Institution Access | Inst status = `suspended` | `SELECT * FROM programmes` | 0 rows returned. `current_user_institution_id()` returns NULL. |
| **TEST-08** | `NOT EXECUTED` | Membership Reassignment | Admin A at Inst A | AICTE Admin sets `institution_id = 'inst_b'` | Inst A membership deactivated; Inst B activated. Exactly 1 active row. |
| **TEST-09** | `NOT EXECUTED` | Candidate APAAR Advisory Race | No student with APAAR `8888` | Workers 1 & 2 call `enrol_student_atomic` concurrently | Advisory lock serializes; 1 student created, 2 enrolments linked. |
| **TEST-10** | `NOT EXECUTED` | Intake Quota Overbooking | Approved intake = 1 | Workers 1 & 2 call `enrol_student_atomic` simultaneously | Worker 1 commits; Worker 2 raises `54000 Intake capacity exceeded`. |
| **TEST-11** | `NOT EXECUTED` | CSV Upload Retry Idempotency | Batch has 5 enrolments | Retrying upload with same `institution_student_id` | Returns `already_enrolled`. Zero duplicate rows created. |
| **TEST-12** | `NOT EXECUTED` | Illegal Batch Status Skip | Batch in `draft` | Inst Admin attempts `UPDATE submission_batches SET status = 'approved'` | Trigger `enforce_batch_state_transitions` raises `55000`. |
| **TEST-13** | `NOT EXECUTED` | Privileged Function Execution | Authenticated client | Direct call `execute_official_apaar_verification()` | Error `42501 (execute_official_apaar_verification requires service_role)`. |
| **TEST-14** | `NOT EXECUTED` | Direct Enrolment REST Bypass | Authenticated client | Direct REST `POST /rest/v1/enrolments` | Error `42501 (permission denied for table enrolments)`. |
| **TEST-15** | `NOT EXECUTED` | Duplicate Review Visibility | Case between Inst A and B | Inst C Admin attempts `SELECT * FROM duplicate_review_cases` | 0 rows returned. Policy `duplicate_cases_select` restricts access. |
| **TEST-16** | `NOT EXECUTED` | First-Admin CLI Bootstrap | Fresh database | Run audited bootstrap SQL script | Exactly 1 active AICTE admin created; subsequent signups stay inactive. |
| **TEST-17** | `NOT EXECUTED` | Schema Integrity Diagnostic | Baseline applied | Run Preflight Diagnostic Script | All 12 tables present, 11 enums verified, 0 duplicate active memberships. |
| **TEST-18** | `NOT EXECUTED` | Audit Coverage & Redaction | Update batch and student | Inspect `public.audit_logs` | Batch change logged; student diff has `dob` and `apaar_id` redacted. |
