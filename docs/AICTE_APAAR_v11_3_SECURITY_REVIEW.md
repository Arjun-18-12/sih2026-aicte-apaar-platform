# AICTE–APAAR Student Data Management Platform
## Security Architecture & Privilege Specification (v11.3)
**Document Status:** OFFICIAL TECHNICAL SPECIFICATION  
**Repository:** `D:\aicte-apaar-platform`  
**Baseline Migration:** `supabase/migrations/001_initial_schema.sql`  
**Review Date:** 2026-10-24  

---

## 1. Executive Summary & Architecture Context

This document establishes the security architecture, forensic attribution model, tenant isolation boundaries, and comprehensive 12-table privilege matrix for the AICTE–APAAR Student Data Management Platform (v11.3).

The platform manages sensitive student records and national APAAR identifiers across hundreds of participating higher education institutions under AICTE regulatory oversight. In this multi-tenant architecture, the database engine enforces strict tenant boundaries, non-bypassable row-level security, tamper-resistant audit trails, and mathematically sound concurrency control.

---

## 2. Non-Spoofable Audit Attribution Model

### 2.1 The Vulnerability of `current_user` in `SECURITY DEFINER`
In PostgreSQL, stored procedures and triggers declared with `SECURITY DEFINER` execute with the privileges of the user that owns the procedure (in Supabase, the `postgres` superuser). 

When code inside a `SECURITY DEFINER` trigger evaluates the PostgreSQL system expression `current_user`, PostgreSQL returns the **function owner** (`postgres`), NOT the connected client or user session!

In v11.2, the audit trigger evaluated `current_user`. As a direct consequence:
- Every insert, update, or delete performed by an institution administrator or regular user was recorded in `public.audit_logs` with `actor_email = 'db_superuser_or_migration'` and `actor_role = 'aicte_admin'`.
- The real user ID (`auth.uid()`) and institutional actor were completely erased from audit records.
- Legally mandated non-repudiation and forensic accountability were completely compromised.

### 2.2 The Trustworthy v11.3 Attribution Model
To solve this defect without losing the privilege elevation necessary to write to the locked `public.audit_logs` table, v11.3 implements a multi-tier attribution resolution model combining PostgreSQL's immutable `session_user` system attribute with Supabase's cryptographic JWT context:

1. **`session_user` Invariant:** PostgreSQL guarantees that `session_user` represents the **initial connected database role** (e.g., `authenticated`, `anon`, `postgres`, or `service_role`) and is **never overwritten** by `SECURITY DEFINER` context switches.
2. **`auth.uid()` Context:** Supabase Auth populates `request.jwt.claim.sub` for authenticated HTTP requests, retrieved via `auth.uid()`.
3. **`auth.jwt()` Context:** Contains verified JWT claims, including the `role` claim (`authenticated`, `anon`, or `service_role`).

### 2.3 Attribution Decision Matrix

| Execution Context | `auth.uid()` | `auth.jwt() ->> 'role'` | `session_user` | Resolved `actor_email` | Resolved `actor_role` |
|---|---|---|---|---|---|
| **1. Authenticated User** | `UUID` | `'authenticated'` | `authenticated` | Looked up from `public.profiles.email` | Looked up from `public.profiles.role` |
| **2. Service Role Worker** | `NULL` | `'service_role'` | `service_role` | `'service_role_worker'` | `NULL` |
| **3. Anonymous REST Client** | `NULL` | `'anon'` | `anon` | `'anonymous_api_client'` | `NULL` |
| **4. Direct DB Admin / CLI** | `NULL` | `NULL` | `postgres` / `supabase_admin` | `'direct_db_admin_' || session_user` | `'aicte_admin'::public.user_role` |
| **5. Controlled Migration** | `NULL` | `NULL` | Any internal role | `'system_session_' || session_user` | `NULL` |

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
  -- 1. Trustworthy Attribution Resolution
  IF auth.uid() IS NOT NULL THEN
    v_actor_id := auth.uid();
    SELECT email, role INTO v_actor_email, v_actor_role
    FROM public.profiles WHERE id = auth.uid();
    IF v_actor_email IS NULL THEN
      v_actor_email := 'authenticated_uid_' || auth.uid()::text;
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
    v_actor_email := 'direct_db_admin_' || session_user;
    v_actor_role := 'aicte_admin'::public.user_role;

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

  -- 3. Emit Immutable Audit Log Entry
  INSERT INTO public.audit_logs (
    institution_id,
    actor_id,
    actor_email,
    actor_role,
    action,
    entity_type,
    entity_id,
    old_values,
    new_values,
    created_at
  ) VALUES (
    v_inst_id,
    v_actor_id,
    v_actor_email,
    v_actor_role,
    TG_OP,
    TG_TABLE_NAME,
    v_entity_id,
    v_old,
    v_new,
    NOW()
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;
```

---

## 3. Duplicate Review Visibility & Institutional Privacy Architecture

### 3.1 The Submitting Institution Blindspot in Earlier Proposals
In v11.2, duplicate review case visibility was defined by joining `duplicate_review_cases.student_id_1` to the `enrolments` table:
```sql
-- FLAWED v11.2 Policy
USING (
  public.is_aicte_admin() OR
  EXISTS (
    SELECT 1 FROM public.enrolments e
    WHERE e.student_id = duplicate_review_cases.student_id_1
      AND e.institution_id = public.current_user_institution_id()
  )
);
```

**The Vulnerability:**
When an institution uploads a student whose demographics conflict with an existing candidate or enrolled record, `enrol_student_atomic` intentionally creates a `duplicate_review_cases` row and **withholds creation of the enrolment record**.
Because the candidate student has NO enrolment row, the policy evaluated to **FALSE** for the submitting institution!
The submitting institution could not see the very case it had created. Meanwhile, if the other student belonged to another institution, that other institution could see the case. This caused severe operational failure.

### 3.2 The v11.3 Scoped Resolution
v11.3 resolves this paradox by tying case visibility directly to the submission batch from which the conflict originated:

```sql
-- HARDENED v11.3 Policy on duplicate_review_cases
CREATE POLICY duplicate_cases_select ON public.duplicate_review_cases FOR SELECT TO authenticated
  USING (
    public.is_aicte_admin() OR
    EXISTS (
      SELECT 1 FROM public.submission_batches b
      WHERE b.id = duplicate_review_cases.batch_id
        AND b.institution_id = public.current_user_institution_id()
    )
  );
```

### 3.3 Candidate Student Read Visibility
To render the duplicate review screen, the submitting institution administrator must also be allowed to read the demographics of the candidate student created during the upload. In v11.2, `students_select` strictly required an active enrolment, blocking the submitter from reading the candidate student record!

In v11.3, `students_select` is explicitly updated:
```sql
-- HARDENED v11.3 Policy on students
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
      WHERE (d.student_id_1 = students.id OR d.student_id_2 = students.id)
        AND b.institution_id = public.current_user_institution_id()
    )
  );
```

### 3.4 Cross-Tenant Isolation Proof
- **Submitting Institution:** Can inspect the case and student details for batches it owns.
- **Unrelated Institutions:** Can neither inspect the case nor read candidate student demographics (evaluates to 0 rows).
- **AICTE Admin:** Retains global oversight and adjudication rights across all cases.

---

## 4. Comprehensive 12-Table Privilege Matrix

PostgreSQL permissions in Supabase default to `GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, anon`. Leaving these default grants in place allows clients to bypass Row-Level Security via direct table updates if policies are loosely defined.

The table below catalogs the exact baseline privileges, revocations, column-level grants, RLS policies, RPC permissions, and protected fields for **all 12 tables** in the platform:

| Table Name | Baseline Grants in `001` | Proposed DDL Revocations | Effective Grants to `authenticated` | Effective Grants to `anon` | Active RLS Policies | Protected Fields & Enforcement Mechanism |
|---|---|---|---|---|---|---|
| **`profiles`** | `ALL` to anon, authenticated | `REVOKE ALL ON profiles FROM PUBLIC, anon, authenticated` | `GRANT SELECT`<br>`GRANT UPDATE (full_name)` | None | `profiles_select`<br>`profiles_update_own` | `role`, `is_active`, `institution_id` locked by trigger `protect_profile_security_fields` |
| **`institutions`** | `ALL` to anon, authenticated | `REVOKE ALL ON institutions FROM PUBLIC, anon, authenticated` | `GRANT SELECT`<br>(AICTE admin writes via RLS) | None | `institutions_select`<br>`institutions_write_aicte` | All fields write-locked to `is_aicte_admin()` |
| **`institution_memberships`** | `ALL` to anon, authenticated | `REVOKE ALL ON institution_memberships FROM PUBLIC, anon, authenticated` | `GRANT SELECT` | None | `memberships_select` | Direct writes revoked. Mutations strictly managed via `sync_profile_membership_state` trigger & AICTE admin |
| **`programmes`** | `ALL` to anon, authenticated | Retain CRUD under tenant RLS | `GRANT SELECT, INSERT, UPDATE, DELETE` | None | `programmes_select`<br>`programmes_insert`<br>`programmes_update`<br>`programmes_delete` | Scoped strictly to `institution_id = current_user_institution_id()` |
| **`approved_intakes`** | `ALL` to anon, authenticated | `REVOKE ALL ON approved_intakes FROM PUBLIC, anon, authenticated` | `GRANT SELECT` | None | `intakes_select`<br>`intakes_write_aicte` | Write-locked to AICTE admin; Row-locked `FOR UPDATE` inside `enrol_student_atomic` |
| **`students`** | `ALL` to anon, authenticated | `REVOKE ALL ON students FROM PUBLIC, anon, authenticated` | `GRANT SELECT` | None | `students_select` | Direct `INSERT, UPDATE, DELETE` completely blocked. Inserted via `enrol_student_atomic`; demographics corrected via `correct_student_demographics` |
| **`submission_batches`** | `ALL` to anon, authenticated | Retain CRUD under tenant RLS | `GRANT SELECT, INSERT, UPDATE` | None | `batches_select`<br>`batches_insert`<br>`batches_update` | `status` transitions validated by `enforce_batch_state_transitions`; `reviewed_by`, `reviewed_at` locked by `protect_batch_reviewer_fields` |
| **`enrolments`** | `ALL` to anon, authenticated | `REVOKE ALL ON enrolments FROM PUBLIC, anon, authenticated` | `GRANT SELECT`<br>`GRANT UPDATE (submission_status)` | None | `enrolments_select`<br>`enrolments_update_status` | Direct `INSERT, DELETE` blocked. Enrolment created by `enrol_student_atomic`; transitions validated by `enforce_enrolment_state_transitions` |
| **`submission_errors`** | `ALL` to anon, authenticated | Retain CRUD under batch tenant RLS | `GRANT SELECT, INSERT, DELETE` | None | `errors_select`<br>`errors_insert`<br>`errors_delete` | Bound by FK to caller's `submission_batches.id`. Inserts trigger auto-counter sync |
| **`verification_events`** | `ALL` to anon, authenticated | `REVOKE ALL ON verification_events FROM PUBLIC, anon, authenticated` | `GRANT SELECT` | None | `verification_events_select` | Direct client writes revoked. Only inserted via official backend verification workflows |
| **`duplicate_review_cases`** | `ALL` to anon, authenticated | `REVOKE ALL ON duplicate_review_cases FROM PUBLIC, anon, authenticated` | `GRANT SELECT`<br>`GRANT UPDATE (review_status, ...)` | None | `duplicate_cases_select`<br>`duplicate_cases_update_aicte` | Updates restricted to `is_aicte_admin()`; SELECT scoped to submitting batch owner |
| **`audit_logs`** | `ALL` to anon, authenticated | `REVOKE ALL ON audit_logs FROM PUBLIC, anon, authenticated` | `GRANT SELECT` | None | `audit_logs_select` | **Immutable**: All client writes revoked. Inserted strictly by `audit_table_mutation_trigger` under `SECURITY DEFINER` |

---

## 5. Controlled First AICTE Administrator Provisioning (Bootstrap)

Because the public signup trigger (`handle_new_user`) hardcodes all self-registered accounts with `role = 'institution_admin'` and `is_active = false`, an initial administrator cannot be provisioned through the browser application.

To bootstrap the platform safely without disabling profile security triggers, the following audited SQL bootstrap script must be executed via the Supabase CLI or direct administrative console:

```sql
-- =============================================================================
-- AICTE PLATFORM INITIAL ADMINISTRATOR BOOTSTRAP SCRIPT
-- Execute once in target environment (Staging / Production)
-- =============================================================================
DO $$
DECLARE
  v_admin_email text := 'admin.system@aicte.gov.in';
  v_admin_name  text := 'AICTE Primary Administrator';
  v_admin_uid   uuid;
BEGIN
  -- 1. Verify existence of user in auth.users
  SELECT id INTO v_admin_uid FROM auth.users WHERE email = v_admin_email;

  IF v_admin_uid IS NULL THEN
    RAISE EXCEPTION 'Bootstrap Aborted: User % must first be created in Supabase Auth before bootstrapping profile.', v_admin_email
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

  -- 3. Emit immutable audit log record for legal compliance
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

  RAISE NOTICE 'SUCCESS: Initial AICTE Administrator bootstrapped successfully (UID: %).', v_admin_uid;
END $$;
```

---

## 6. Official APAAR Verification Quarantined State

### 6.1 Rationale for Exclusion
In previous remediation drafts, a stored procedure named `execute_official_apaar_verification` was proposed. However, rigorous security analysis revealed that the procedure accepted verification outcomes, verification timestamps, and provider references directly from callers without validating an external cryptographic signature.

Restricting execute permissions to `service_role` is insufficient proof of authenticity when:
1. No external API contract with DigiLocker or UIDAI exists in the repository.
2. No mTLS client certificates, API keys, or webhook HMAC signature secrets exist.
3. No serverless Edge Function implementing the provider handshake exists.

### 6.2 Quarantined Status in v11.3
In v11.3, official APAAR verification is **strictly quarantined**:
- No official verification RPC is exposed to clients or migrations.
- Test `TEST-13` is designated `BLOCKED — OFFICIAL PROVIDER CONTRACT REQUIRED`.
- All candidate APAAR IDs remain stored exclusively in `students.candidate_apaar_id` with `apaar_verification_status = 'unverified'`.
- The database schema is ready to receive verified APAAR IDs only when an official provider integration module is formally authorized, audited, and deployed.
