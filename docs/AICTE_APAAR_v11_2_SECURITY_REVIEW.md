# AICTE–APAAR Student Data Management Platform
## Security Architecture & Technical Specification (v11.2)
**Document Status:** OFFICIAL TECHNICAL SPECIFICATION  
**Repository:** `D:\aicte-apaar-platform`  
**Baseline Inspection:** `supabase/migrations/001_initial_schema.sql`  

---

## 1. Architectural Model & Invariants

### A. Separation of Candidate APAAR from Authoritative Verified APAAR
In the baseline schema (`001_initial_schema.sql`), table `students` defines `apaar_id TEXT`. In v11.2, this field is strictly reserved for **officially verified identity data**:

1. **New Column:** `ALTER TABLE public.students ADD COLUMN IF NOT EXISTS candidate_apaar_id TEXT;`
2. **Candidate Identifier Storage:** When an institution submits an enrolment with an APAAR number, it is stored in `students.candidate_apaar_id`. The authoritative column `students.apaar_id` remains **`NULL`**, and `apaar_verification_status` is set to **`'unverified'`**.
3. **Authoritative Promotion:** Only a cryptographically validated result from an authorized official provider integration can populate `students.apaar_id` and transition status to `'verified'`.
4. **UI Invariant:** Dashboards and enrolment tables display candidate APAAR numbers with an explicit **Unverified Candidate** badge. Verified badges are only rendered when `apaar_verification_status = 'verified'` and `apaar_id IS NOT NULL`.

---

## 2. Hardened Tenant Selection & Membership Model

### A. The Option A Recommendation
v11.2 adopts **Option A** (strictly one active institution membership per administrator profile):
```sql
CREATE UNIQUE INDEX uq_profile_single_active_membership
ON public.institution_memberships (profile_id)
WHERE is_active = true;
```

### B. Eliminating Ambiguity in `current_user_institution_id()`
To eliminate the non-deterministic `LIMIT 1` hazard, v11.2 implements strict single-row selection that **fails closed** if data anomalies occur:

```sql
CREATE OR REPLACE FUNCTION public.current_user_institution_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_inst_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  BEGIN
    SELECT m.institution_id INTO STRICT v_inst_id
    FROM public.institution_memberships m
    JOIN public.profiles p ON p.id = m.profile_id
    JOIN public.institutions i ON i.id = m.institution_id
    WHERE m.profile_id = auth.uid()
      AND m.is_active = true
      AND p.is_active = true
      AND i.approval_status = 'active';

    RETURN v_inst_id;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      RETURN NULL;
    WHEN TOO_MANY_ROWS THEN
      -- Fail closed immediately; do not silently select an arbitrary tenant
      RAISE EXCEPTION 'Security invariant violation: multiple active memberships detected for profile %', auth.uid()
        USING ERRCODE = '55000';
  END;
END;
$$;
```

---

## 3. Hardened Search Path Ordering across all Privileged Functions

In PostgreSQL, setting `search_path = public, pg_catalog` allows an unprivileged user who can create objects in `public` to shadow standard functions, casts, or operators in `pg_catalog` inside `SECURITY DEFINER` execution.

v11.2 enforces **`SET search_path = pg_catalog, public;`** across all 13 security definer functions and schema-qualifies all table references (`public.profiles`, `public.students`, etc.).

---

## 4. Batch Workflow State Transition Guard

To prevent institution administrators from updating batch status to `'approved'` or skipping draft validation, v11.2 defines a database trigger on `submission_batches`:

```sql
CREATE OR REPLACE FUNCTION public.enforce_batch_state_transitions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role public.user_role;
BEGIN
  v_role := public.current_user_role();

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Authorization failure: unauthenticated or inactive session' USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- Institution Admin Allowed Transitions
    IF v_role = 'institution_admin'::public.user_role THEN
      IF NOT (
        (OLD.status IN ('draft', 'returned_for_correction', 'validation_failed') AND NEW.status = 'submitted') OR
        (OLD.status = 'submitted' AND NEW.status = 'draft') -- Recall submission
      ) THEN
        RAISE EXCEPTION 'Illegal batch transition from % to % for institution_admin',
          OLD.status, NEW.status USING ERRCODE = '55000';
      END IF;

    -- AICTE Admin Allowed Transitions
    ELSIF v_role = 'aicte_admin'::public.user_role THEN
      IF NOT (
        (OLD.status = 'submitted' AND NEW.status IN ('under_review', 'returned_for_correction', 'rejected', 'approved')) OR
        (OLD.status = 'under_review' AND NEW.status IN ('approved', 'rejected', 'returned_for_correction')) OR
        (OLD.status = 'returned_for_correction' AND NEW.status IN ('under_review', 'rejected'))
      ) THEN
        RAISE EXCEPTION 'Illegal batch transition from % to % for aicte_admin',
          OLD.status, NEW.status USING ERRCODE = '55000';
      END IF;
    ELSE
      RAISE EXCEPTION 'Role % not permitted to modify batch status', v_role USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
```

---

## 5. Comprehensive 10-Table Audit System

Audit triggers are attached across all 10 sensitive application tables:
1. `public.submission_batches`
2. `public.profiles`
3. `public.institution_memberships`
4. `public.students` (with `date_of_birth`, `candidate_apaar_id`, `apaar_id` redacted from JSON diffs)
5. `public.enrolments`
6. `public.verification_events`
7. `public.duplicate_review_cases`
8. `public.approved_intakes`
9. `public.institutions`
10. `public.programmes`

### Non-Spoofable Actor Attribution
When `auth.uid()` is null, the trigger evaluates `current_user`:
- `service_role` $ightarrow$ `actor_email = 'service_role_internal'`, `actor_role = NULL`
- `authenticator` / `anon` $ightarrow$ `actor_email = 'anon_client'`, `actor_role = NULL`
- `postgres` $ightarrow$ `actor_email = 'db_superuser_or_migration'`, `actor_role = 'aicte_admin'`
