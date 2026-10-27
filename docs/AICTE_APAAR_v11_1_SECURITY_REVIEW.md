# AICTE–APAAR Student Data Management Platform
## Security Architecture & Technical Specification (v11.1)
**Document Status:** OFFICIAL REVIEW ARTIFACT  
**Repository:** `D:\aicte-apaar-platform`  
**Baseline Inspection:** `supabase/migrations/001_initial_schema.sql`  

---

## 1. Executive Security Architecture

The AICTE–APAAR Student Data Management Platform provides centralized oversight, verification tracking, and intake capacity enforcement across independently participating educational institutions.

### Core Architecture Principles
1. **Zero-Trust Multi-Tenancy:** Institutional users are strictly scoped to records linked to their authenticated institution via active memberships in `institution_memberships`.
2. **Authoritative Demographics & APAAR Distinction:**
   - Candidate APAAR numbers entered by institutions are stored as **unverified candidate identifiers** (`apaar_verification_status = 'unverified'`).
   - Official verification requires cryptographic confirmation via an authorized server-side integration.
3. **Privilege Boundary Enforcement:** Direct table-level mutations on sensitive tables (`students`, `enrolments`, `verification_events`, `audit_logs`) are revoked from client roles. Mutations are conducted via hardened `SECURITY DEFINER` stored procedures with fixed `search_path = public, pg_catalog`.

---

## 2. Institutional Membership Architecture: Option A vs. Option B

### Option A: Strictly One Active Institution Membership per Profile (RECOMMENDED)
- **Invariant:** Enforced by partial unique index:
  ```sql
  CREATE UNIQUE INDEX uq_profile_single_active_membership 
  ON public.institution_memberships (profile_id) 
  WHERE is_active = true;
  ```
- **Behavior:** When an administrator is assigned or reassigned to Institution B, any prior active membership for Institution A is deactivated within the same transaction.
- **Security Advantages:**
  - Prevents session confusion and cross-tenant leakage.
  - Zero requirement for client-supplied tenant context headers or complex session switching logic.
  - Guarantees strict single-tenant blast radius: a compromised administrator credential cannot expose data from multiple colleges.
- **Operational Trade-Offs:**
  - If a registrar legitimately oversees two affiliated colleges under a single university umbrella, they must use distinct institutional email identities (e.g., `registrar@college-a.edu.in` vs. `registrar@college-b.edu.in`).

### Option B: Multi-Institution Memberships with Session Tenant Context
- **Invariant:** Allows multiple active rows in `institution_memberships` per profile.
- **Behavior:** The user passes an active tenant header or selects an active institution in the UI, which sets a session variable (e.g., `app.current_institution_id`).
- **Security Disadvantages & Risks:**
  - Risk of tenant injection or session manipulation if the client context is tampered with.
  - Requires extensive frontend refactoring (tenant switchers, contextual state stores) which the current React application does not support.
  - RLS policies become significantly more complex, increasing the risk of permissive policy bypass.

### Architectural Recommendation
**Option A is explicitly recommended and implemented for v11.1.** It perfectly aligns with existing frontend behavior, enforces the smallest possible attack surface, and maintains absolute audit clarity.

---

## 3. Sensitive Field Access & Correction Matrix

| Entity | Protected Field | Allowed Reader | Allowed Creator | Allowed Updater | Enforcement Mechanism |
|---|---|---|---|---|---|
| `students` | `apaar_id` (Candidate) | Enrolled Inst Admin, AICTE Admin | `enrol_student_atomic` only | None directly (Locked upon entry) | Revoked `UPDATE`; Insert trigger sets `unverified` |
| `students` | `apaar_id` (Official) | Enrolled Inst Admin, AICTE Admin | `execute_official_apaar_verification` | AICTE Admin Override only | RPC restricted to `service_role` |
| `students` | `full_name`, `date_of_birth`, `gender` | Enrolled Inst Admin, AICTE Admin | `enrol_student_atomic` only | `correct_student_demographics()` (pre-verif); AICTE review (post-verif) | Revoked direct `UPDATE`; procedure checks verification status |
| `students` | `apaar_verification_status` | Enrolled Inst Admin, AICTE Admin | Insert trigger forces `unverified` | `execute_official_apaar_verification` | Table-level revoke; RPC restricted to `service_role` |
| `profiles` | `role`, `is_active`, `institution_id` | Self, AICTE Admin | `handle_new_user` trigger | AICTE Admin only | `protect_profile_security_fields()` trigger |
| `enrolments` | `student_id`, `institution_id`, `programme_id` | Enrolled Inst Admin, AICTE Admin | `enrol_student_atomic` only | None (Immutable foreign keys) | Revoked table-level `UPDATE` |
| `enrolments` | `submission_status` | Enrolled Inst Admin, AICTE Admin | `enrol_student_atomic` (sets `draft`) | Inst Admin (draft->submitted); AICTE (review) | `trg_enrolment_status_transition` |
| `enrolments` | `enrolment_status` | Enrolled Inst Admin, AICTE Admin | `enrol_student_atomic` (sets `active`) | AICTE Admin / Authorized Registrar procedure | Revoked column grant for client roles |
| `submission_batches` | `reviewed_by`, `reviewed_at`, `reviewer_notes` | Own Inst Admin, AICTE Admin | Batch creation | AICTE Admin only | `protect_batch_reviewer_fields()` trigger |
| `audit_logs` | All columns | Own Inst Admin, AICTE Admin | System Triggers only | **NONE (Immutable)** | Complete revocation of `INSERT, UPDATE, DELETE` |

### Controlled Student Demographics Correction Procedure
To allow legitimate typographical corrections without exposing direct `UPDATE` permissions on `public.students`, v11.1 defines the following controlled procedure:

```sql
CREATE OR REPLACE FUNCTION public.correct_student_demographics(
  p_student_id uuid,
  p_full_name text,
  p_date_of_birth date,
  p_gender text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_caller_inst_id uuid;
  v_current_status public.apaar_verification_status;
BEGIN
  -- 1. Resolve caller institution
  v_caller_inst_id := public.current_user_institution_id();
  IF v_caller_inst_id IS NULL AND NOT public.is_aicte_admin() THEN
    RAISE EXCEPTION 'Authorization failure: caller has no active institution' USING ERRCODE = '42501';
  END IF;

  -- 2. Verify student is enrolled in caller institution
  IF NOT public.is_aicte_admin() THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.enrolments 
      WHERE student_id = p_student_id AND institution_id = v_caller_inst_id
    ) THEN
      RAISE EXCEPTION 'Permission denied: student not enrolled in caller institution' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 3. Lock student row and check verification status
  SELECT apaar_verification_status INTO v_current_status
  FROM public.students WHERE id = p_student_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student % not found', p_student_id USING ERRCODE = '22023';
  END IF;

  -- 4. If officially verified, ordinary institutions CANNOT correct demographics
  IF v_current_status = 'verified'::public.apaar_verification_status AND NOT public.is_aicte_admin() THEN
    RAISE EXCEPTION 'Direct correction rejected: verified student records require AICTE administrative review' USING ERRCODE = '55000';
  END IF;

  -- 5. Perform audited correction
  UPDATE public.students
  SET full_name = trim(p_full_name),
      date_of_birth = p_date_of_birth,
      gender = p_gender,
      updated_at = NOW()
  WHERE id = p_student_id;

  RETURN true;
END;
$$;
```

---

## 4. Privileged Function Inventory

| Function Signature | Owner | Security Definer | Search Path | Execute Grant | Purpose & Access Boundary |
|---|---|---|---|---|---|
| `current_user_role()` | `postgres` | Yes | `public, pg_catalog` | `authenticated` | Resolves role from active profile. Returns NULL if inactive. |
| `current_user_institution_id()` | `postgres` | Yes | `public, pg_catalog` | `authenticated` | Resolves institution from active membership in an active institution. |
| `is_aicte_admin()` | `postgres` | Yes | `public, pg_catalog` | `authenticated` | Returns true only if profile role is `aicte_admin` and `is_active = true`. |
| `handle_new_user()` | `postgres` | Yes | `public, pg_catalog` | Trigger on `auth.users` | Creates inactive profile with role `institution_admin`. Ignores client metadata. |
| `protect_profile_security_fields()` | `postgres` | Yes | `public, pg_catalog` | Trigger on `profiles` | Blocks non-AICTE updates to `role`, `is_active`, and `institution_id`. |
| `sync_profile_membership_state()` | `postgres` | Yes | `public, pg_catalog` | Trigger on `profiles` | Deactivates prior memberships upon reassignment. Prevents trigger recursion. |
| `guard_student_initial_verification_state()` | `postgres` | Yes | `public, pg_catalog` | Trigger on `students` | Forces `unverified` status and `mock` source on all new student rows. |
| `enrol_student_atomic(...)` | `postgres` | Yes | `public, pg_catalog` | `authenticated` | Row-locks batch and intake; advisory-locks candidate APAAR; handles conflicts. |
| `correct_student_demographics(...)` | `postgres` | Yes | `public, pg_catalog` | `authenticated` | Validates institution enrollment; blocks corrections on verified students. |
| `execute_official_apaar_verification(...)` | `postgres` | Yes | `public, pg_catalog` | `service_role` ONLY | Validates timestamp freshness; prevents overwriting verified records. |
| `enforce_enrolment_state_transitions()` | `postgres` | Yes | `public, pg_catalog` | Trigger on `enrolments` | Enforces role-based submission status transition matrix. |
| `protect_batch_reviewer_fields()` | `postgres` | Yes | `public, pg_catalog` | Trigger on `submission_batches` | Restricts `reviewed_by`, `reviewed_at`, `reviewer_notes` to AICTE admins. |
| `audit_table_mutation_trigger()` | `postgres` | Yes | `public, pg_catalog` | Trigger on audited tables | Derives verified caller identity; redacts PII from student diffs. |

---

## 5. Audit & Privacy Architecture

### Trust Boundary Analysis
- **Application Level:** Database triggers guarantee that ordinary browser sessions cannot forge, modify, or delete audit records.
- **Database Level:** Privileged database administrators (PostgreSQL superuser, cloud account owners) possess the technical capability to alter database tables directly.
- **Production Requirement:** An external, append-only WORM (Write Once, Read Many) streaming audit sink is mandatory for production compliance:
  - Streaming logical replication to AWS S3 Object Lock (Compliance Mode) or Google Cloud Storage Bucket Lock.
  - If the external audit sink becomes temporarily unavailable: PostgreSQL must buffer audit logs in a local queue table; if the buffer reaches threshold, write operations must fail closed.
