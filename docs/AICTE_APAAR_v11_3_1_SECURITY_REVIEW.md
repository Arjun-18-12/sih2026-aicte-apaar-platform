# AICTE–APAAR Student Data Management Platform
## Security Architecture & Privilege Specification (v11.3.1)
**Document Status:** OFFICIAL TECHNICAL SPECIFICATION — FOR STAGING REVIEW ONLY  
**Repository:** `D:\aicte-apaar-platform`  
**Baseline Inspection:** `supabase/migrations/001_initial_schema.sql`  
**Review Version:** v11.3.1 (Remediation of v11.3 Privacy, Attribution, and Privilege Deficiencies)  
**Review Date:** 2026-10-24  
**Operating Mode:** STRICTLY READ-ONLY (No SQL executed; no database altered; all tests marked `NOT EXECUTED` or `BLOCKED`)

---

## 1. Executive Summary & Architecture Context

This document defines the hardened security architecture, non-misleading forensic attribution model, cross-institution student privacy boundaries, and complete effective privilege matrix for the AICTE–APAAR Student Data Management Platform (v11.3.1).

The platform coordinates student enrolment and APAAR national identity management across hundreds of independent educational institutions under AICTE regulatory supervision. The core security principles of this specification are:
1. **Strict Multi-Tenant Isolation:** An institution must never access student demographics belonging to another institution, even when a duplicate review case references both students.
2. **Truthful Forensic Non-Repudiation:** Audit attribution must never invent application identities or assign application roles to database engine administrators.
3. **Defense-in-Depth Privilege Reconciliation:** Table-level write privileges must be revoked where column-level protection is required; default Supabase public grants must be stripped completely.
4. **Resilient Idempotent Concurrency:** Ingestion and verification operations must execute atomically with transaction-scoped advisory locks to eliminate race conditions.

---

## 2. Non-Misleading Forensic Audit Attribution Architecture

### 2.1 The Vulnerability of `current_user` in `SECURITY DEFINER`
In PostgreSQL, functions and triggers declared with `SECURITY DEFINER` execute with the privileges of the function owner (in Supabase, the `postgres` superuser). When code inside a `SECURITY DEFINER` trigger evaluates `current_user`, PostgreSQL returns the **function owner** (`postgres`), completely erasing the connected identity.

### 2.2 The v11.3 Attribution Flaw (Resolved in v11.3.1)
In v11.3, the trigger replaced `current_user` with `session_user`, but introduced a serious defect: when direct database operations were run by `postgres` or `supabase_admin` without a JWT, the trigger automatically assigned:
```sql
v_actor_email := 'direct_db_admin_' || session_user;
v_actor_role := 'aicte_admin'::public.user_role; -- FLAWED: FALSE APPLICATION IDENTITY
```
This fabricated an `aicte_admin` application identity for DBA sessions. In legal or forensic investigations, this created false claims that regulatory application personnel took actions that were actually executed by infrastructure database administrators.

### 2.3 The Hardened v11.3.1 Attribution Model
v11.3.1 enforces a non-spoofable, truthful attribution model combining `session_user` (the connected database role that cannot be altered by `SECURITY DEFINER`) with Supabase cryptographic JWT claims (`auth.uid()`, `auth.jwt()`):

| Execution Context | `auth.uid()` | `auth.jwt() ->> 'role'` | `session_user` | Resolved `actor_email` | Resolved `actor_role` |
|---|---|---|---|---|---|
| **1. Authenticated User** | `UUID` | `'authenticated'` | `authenticated` | Looked up from `public.profiles.email` | Looked up from `public.profiles.role` |
| **2. Authenticated JWT (No Profile)** | `UUID` | `'authenticated'` | `authenticated` | `COALESCE(auth.jwt()->>'email', 'authenticated_uid_' || auth.uid())` | `NULL` (No role invented) |
| **3. Service Role Worker** | `NULL` | `'service_role'` | `service_role` | `'service_role_worker'` | `NULL` |
| **4. Anonymous REST Client** | `NULL` | `'anon'` | `anon` | `'anonymous_api_client'` | `NULL` |
| **5. Direct DB Admin / CLI** | `NULL` | `NULL` | `postgres` / `supabase_admin` | `'direct_db_' || session_user` | `NULL` (No application role) |
| **6. Background Worker / System** | `NULL` | `NULL` | Any other role | `'system_session_' || session_user` | `NULL` |

### 2.4 Trigger Implementation (`audit_table_mutation_trigger`)

```sql
CREATE OR REPLACE FUNCTION public.audit_table_mutation_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_inst_id uuid;
  v_entity_id text;
  v_old jsonb := NULL;
  v_new jsonb := NULL;
  v_actor_id uuid := NULL;
  v_actor_email text := NULL;
  v_actor_role public.user_role := NULL;
BEGIN
  -- 1. Trustworthy Forensic Attribution Resolution
  IF auth.uid() IS NOT NULL THEN
    v_actor_id := auth.uid();
    SELECT email, role INTO v_actor_email, v_actor_role
    FROM public.profiles WHERE id = auth.uid();
    IF v_actor_email IS NULL THEN
      v_actor_email := COALESCE(auth.jwt() ->> 'email', 'authenticated_uid_' || auth.uid()::text);
      v_actor_role := NULL; -- Strict: Do not assume an application role if profile is missing
    END IF;

  ELSIF (auth.jwt() ->> 'role') = 'service_role' THEN
    v_actor_id := NULL;
    v_actor_email := 'service_role_worker';
    v_actor_role := NULL;

  ELSIF (auth.jwt() ->> 'role') = 'anon' OR session_user = 'anon' THEN
    v_actor_id := NULL;
    v_actor_email := 'anonymous_api_client';
    v_actor_role := NULL;

  ELSIF session_user IN ('postgres', 'supabase_admin') AND auth.jwt() IS NULL THEN
    v_actor_id := NULL;
    v_actor_email := 'direct_db_' || session_user;
    v_actor_role := NULL; -- TRUTHFUL FORENSIC ATTRIBUTION (NO FAKE aicte_admin ROLE)

  ELSE
    v_actor_id := NULL;
    v_actor_email := 'system_session_' || session_user;
    v_actor_role := NULL;
  END IF;

  -- 2. Extract Entity ID and Payload
  IF (TG_OP = 'DELETE') THEN
    v_entity_id := OLD.id::text;
    v_old := to_jsonb(OLD);
    IF TG_TABLE_NAME = 'institutions' THEN v_inst_id := OLD.id;
    ELSE
      BEGIN v_inst_id := OLD.institution_id; EXCEPTION WHEN undefined_column THEN v_inst_id := NULL; END;
    END IF;
  ELSE
    v_entity_id := NEW.id::text;
    v_new := to_jsonb(NEW);
    IF (TG_OP = 'UPDATE') THEN v_old := to_jsonb(OLD); END IF;
    IF TG_TABLE_NAME = 'institutions' THEN v_inst_id := NEW.id;
    ELSE
      BEGIN v_inst_id := NEW.institution_id; EXCEPTION WHEN undefined_column THEN v_inst_id := NULL; END;
    END IF;
  END IF;

  -- 3. Redact Sensitive Identity Fields from Student Audit Diffs
  IF TG_TABLE_NAME = 'students' THEN
    IF v_old IS NOT NULL THEN v_old := v_old - 'date_of_birth' - 'apaar_id' - 'candidate_apaar_id'; END IF;
    IF v_new IS NOT NULL THEN v_new := v_new - 'date_of_birth' - 'apaar_id' - 'candidate_apaar_id'; END IF;
  END IF;

  -- 4. Emit Immutable Audit Record
  INSERT INTO public.audit_logs (
    actor_id,
    actor_email,
    actor_role,
    institution_id,
    action,
    entity_type,
    entity_id,
    old_values,
    new_values,
    created_at
  ) VALUES (
    v_actor_id,
    v_actor_email,
    v_actor_role,
    v_inst_id,
    TG_OP,
    TG_TABLE_NAME,
    v_entity_id,
    v_old,
    v_new,
    NOW()
  );

  RETURN NULL;
END;
$$;
```

---

## 3. Cross-Institution Duplicate Case Privacy Architecture

### 3.1 The Critical Data Leakage Defect in v11.3
In v11.3, `students_select` was modified to allow institutions to read student records associated with duplicate review cases originating from their submission batches:
```sql
-- VULNERABLE v11.3 POLICY:
WHERE (d.student_id_1 = students.id OR d.student_id_2 = students.id)
  AND b.institution_id = public.current_user_institution_id()
```
**The Breach Scenario:**
When an institution (College A) uploaded a student (S2) whose candidate APAAR matched an existing student (S1) enrolled at College B, a duplicate review case was created with `student_id_1 = S1` and `student_id_2 = S2`.  
Because `d.student_id_1 = S1` satisfied the v11.3 policy, an administrator at College A could query `SELECT * FROM public.students WHERE id = S1` and retrieve the **full demographic record of Student S1 at College B** (full name, date of birth, gender, APAAR ID). This was a critical cross-institution privacy breach.

### 3.2 The Strict v11.3.1 Privacy Separation
v11.3.1 establishes a strict three-tier separation of case visibility, candidate student inspection, and full registered demographic access:

1. **Submitting Institution Full Access: Candidate Student Only (`student_id_2`)**  
   The submitting institution is permitted to query full demographics only for candidate students created in its own batch (`student_id_2`). It is strictly **BLOCKED** from querying `student_id_1` from the `students` table:
   ```sql
   -- HARDENED v11.3.1 STUDENTS POLICY:
   CREATE POLICY students_select ON public.students FOR SELECT TO authenticated
     USING (
       public.is_aicte_admin() OR
       EXISTS (
         SELECT 1 FROM public.enrolments e
         WHERE e.student_id = students.id
           AND e.institution_id = public.current_user_institution_id()
       ) OR
       EXISTS (
         SELECT 1 FROM public.duplicate_review_cases d
         JOIN public.submission_batches b ON b.id = d.batch_id
         WHERE d.student_id_2 = students.id -- ONLY CANDIDATE STUDENT CREATED BY THIS BATCH
           AND b.institution_id = public.current_user_institution_id()
       )
     );
   ```

2. **Minimal Duplicate-Resolution Information (Via Case Record)**  
   The submitting institution views the duplicate case via `duplicate_cases_select` (scoped to `b.institution_id = current_user_institution_id()`). The case record reveals:
   - `detection_reason` (e.g., `'ERR_DEMOGRAPHIC_MISMATCH: candidate APAAR matches existing record'`)
   - `review_status` (`'pending'`, `'under_review'`, `'resolved'`, `'rejected'`)
   - `batch_id` and `created_at`
   The submitting institution learns that an APAAR collision occurred, but **learns zero private demographics** of the other student.

3. **Global Adjudication Rights: AICTE Administrators Only**  
   Full demographic inspection of both `student_id_1` and `student_id_2`, as well as case resolution (`UPDATE duplicate_review_cases`), is restricted exclusively to authorized regulatory officials via `public.is_aicte_admin()`.

### 3.3 Tri-Party Visibility Matrix

| Actor Identity | Visibility into Case Record (`duplicate_review_cases`) | Read Access to Candidate Student (`student_id_2`) | Read Access to Existing Student (`student_id_1`) | Case Adjudication / Update Rights |
|---|---|---|---|---|
| **Submitting Institution** | Own batch cases only | **Full Demographics** | **BLOCKED (0 Rows)** | **BLOCKED** |
| **Enrolled Institution (Where S1 is enrolled)** | **BLOCKED** (Unless batch belongs to them) | **BLOCKED** | **Full Demographics** (via existing enrolment) | **BLOCKED** |
| **Unrelated Institution** | **BLOCKED (0 Rows)** | **BLOCKED (0 Rows)** | **BLOCKED (0 Rows)** | **BLOCKED** |
| **AICTE Administrator** | **Full Global Access** | **Full Demographics** | **Full Demographics** | **Full Adjudication Rights** |

---

## 4. Comprehensive Final Privilege Matrix (12 Tables, Sequences, Functions)

In baseline migration `001_initial_schema.sql`, Supabase granted `ALL` on all tables, sequences, and routines to `anon` and `authenticated`.  
v11.3.1 enforces a comprehensive privilege reconciliation, revoking all baseline grants and regranting only minimal required privileges:

| Table Name | Baseline Grants (`001`) | Proposed Revocations | Effective Grants to `authenticated` | Effective Grants to `anon` | Active RLS Policies | Protected Columns & Enforcement Mechanisms |
|---|---|---|---|---|---|---|
| **`profiles`** | `ALL` | `REVOKE ALL FROM PUBLIC, anon, authenticated` | `SELECT`<br>`UPDATE (full_name)` | None | `profiles_select`<br>`profiles_update` | `role`, `is_active`, `institution_id` protected by column grants & trigger `protect_profile_security_fields` |
| **`institutions`** | `ALL` | `REVOKE ALL FROM PUBLIC, anon, authenticated` | `SELECT` | None | `institutions_select`<br>`institutions_admin_write` | Table writes restricted to `is_aicte_admin()` |
| **`institution_memberships`** | `ALL` | `REVOKE ALL FROM PUBLIC, anon, authenticated` | `SELECT` | None | `memberships_select`<br>`memberships_aicte_write` | Direct writes revoked. Managed via `sync_profile_membership_state` trigger & AICTE admin |
| **`programmes`** | `ALL` | `REVOKE ALL FROM PUBLIC, anon, authenticated` | `SELECT, INSERT, UPDATE, DELETE` | None | `programmes_select`<br>`programmes_inst_write` | Scoped strictly to `institution_id = current_user_institution_id()` |
| **`approved_intakes`** | `ALL` | `REVOKE ALL FROM PUBLIC, anon, authenticated` | `SELECT` | None | `intakes_select`<br>`intakes_aicte_write` | Writes restricted to AICTE admin; Row-locked `FOR UPDATE` inside `enrol_student_atomic` |
| **`students`** | `ALL` | `REVOKE ALL FROM PUBLIC, anon, authenticated` | `SELECT` | None | `students_select` | Direct `INSERT, UPDATE, DELETE` completely blocked. Inserted via `enrol_student_atomic`; corrections via `correct_student_demographics` |
| **`submission_batches`** | `ALL` | `REVOKE ALL FROM PUBLIC, anon, authenticated` | `SELECT, INSERT`<br>`UPDATE (batch_name, status)` | None | `batches_select`<br>`batches_inst_insert`<br>`batches_update` | Column updates to `valid_records`, `error_records`, `total_records`, `reviewed_by`, `reviewed_at` completely revoked |
| **`enrolments`** | `ALL` | `REVOKE ALL FROM PUBLIC, anon, authenticated` | `SELECT`<br>`UPDATE (submission_status)` | None | `enrolments_select`<br>`enrolments_update` | Direct `INSERT, DELETE` blocked. `enrolment_status` protected by column grants & transition trigger |
| **`submission_errors`** | `ALL` | `REVOKE ALL FROM PUBLIC, anon, authenticated` | `SELECT, INSERT, DELETE` | None | `errors_select`<br>`errors_inst_insert` | Bound by FK to caller's `submission_batches.id` |
| **`verification_events`** | `ALL` | `REVOKE ALL FROM PUBLIC, anon, authenticated` | `SELECT` | None | `verif_events_select` | Direct client writes revoked. Only inserted via official backend verification workflows |
| **`duplicate_review_cases`** | `ALL` | `REVOKE ALL FROM PUBLIC, anon, authenticated` | `SELECT`<br>`UPDATE (review_status, reviewer_notes, resolved_at)` | None | `duplicate_cases_select`<br>`duplicate_cases_update` | Updates restricted to `is_aicte_admin()` via RLS |
| **`audit_logs`** | `ALL` | `REVOKE ALL FROM PUBLIC, anon, authenticated` | `SELECT` | None | `audit_logs_select` | **Immutable**: All client writes revoked. Inserted strictly by `audit_table_mutation_trigger` under `SECURITY DEFINER` |

### 4.1 Sequence and Routine Privileges
- **Sequences:** `REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;`
- **Routines / Stored Procedures:**  
  - `REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM PUBLIC, anon;`
  - `GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;`
  - `GRANT EXECUTE ON FUNCTION public.current_user_institution_id() TO authenticated;`
  - `GRANT EXECUTE ON FUNCTION public.is_aicte_admin() TO authenticated;`
  - `GRANT EXECUTE ON FUNCTION public.correct_student_demographics(uuid, text, date, text) TO authenticated;`
  - `GRANT EXECUTE ON FUNCTION public.enrol_student_atomic(uuid, uuid, text, uuid, text, text, date, text, text) TO authenticated;`

### 4.2 SQL Verification Queries for Staging Audits
To inspect effective privileges on any active database, execute:
```sql
-- QUERY 1: Table-level privileges for authenticated and anon
SELECT grantee, table_name, privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public' AND grantee IN ('authenticated', 'anon')
ORDER BY table_name, grantee, privilege_type;

-- QUERY 2: Column-level UPDATE privileges
SELECT grantee, table_name, column_name, privilege_type
FROM information_schema.column_privileges
WHERE table_schema = 'public' AND privilege_type = 'UPDATE' AND grantee = 'authenticated'
ORDER BY table_name, column_name;

-- QUERY 3: Routine execute privileges
SELECT routine_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE specific_schema = 'public' AND grantee IN ('PUBLIC', 'anon', 'authenticated')
ORDER BY routine_name, grantee;
```

---

## 5. Controlled First AICTE Administrator Provisioning (Bootstrap)

Because public signups are locked to inactive `institution_admin` profiles, the primary administrative identity must be provisioned via an audited SQL bootstrap script:

```sql
-- AICTE PLATFORM INITIAL ADMINISTRATOR BOOTSTRAP SCRIPT (v11.3.1)
DO $$
DECLARE
  v_admin_email text := 'admin.system@aicte.gov.in';
  v_admin_name  text := 'AICTE Primary Regulatory Administrator';
  v_admin_uid   uuid;
BEGIN
  -- 1. Verify existence in auth.users
  SELECT id INTO v_admin_uid FROM auth.users WHERE email = v_admin_email;

  IF v_admin_uid IS NULL THEN
    RAISE EXCEPTION 'Bootstrap Aborted: User % must exist in auth.users before bootstrapping profile.', v_admin_email
      USING ERRCODE = '22023';
  END IF;

  -- 2. Upsert profile with aicte_admin role and active status
  INSERT INTO public.profiles (id, email, full_name, role, institution_id, is_active, created_at, updated_at)
  VALUES (v_admin_uid, v_admin_email, v_admin_name, 'aicte_admin', NULL, true, NOW(), NOW())
  ON CONFLICT (id) DO UPDATE
  SET role = 'aicte_admin',
      is_active = true,
      institution_id = NULL,
      updated_at = NOW();

  -- 3. Emit immutable audit record
  INSERT INTO public.audit_logs (
    actor_id,
    actor_email,
    actor_role,
    action,
    entity_type,
    entity_id,
    new_values,
    created_at
  ) VALUES (
    v_admin_uid,
    v_admin_email,
    'aicte_admin',
    'INITIAL_AICTE_ADMIN_BOOTSTRAP',
    'profiles',
    v_admin_uid::text,
    jsonb_build_object(
      'email', v_admin_email,
      'role', 'aicte_admin',
      'is_active', true,
      'bootstrap_timestamp', NOW()
    ),
    NOW()
  );

  RAISE NOTICE 'SUCCESS: AICTE Administrator bootstrapped (UID: %).', v_admin_uid;
END $$;
```

---

## 6. Official APAAR Verification Quarantined State

Official APAAR verification remains **STRICTLY QUARANTINED**:
- No external provider contract (DigiLocker / UIDAI) exists.
- No mTLS certificates, client credentials, or webhook signing keys exist in the repository.
- Stored procedure `execute_official_apaar_verification` is excluded from client migrations.
- Test `TEST-13` remains designated `BLOCKED — OFFICIAL PROVIDER CONTRACT REQUIRED`.
