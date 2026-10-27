# AICTE–APAAR Student Data Management Platform
## Corrected Migration Specification & Deployment Guide (v11.3)
**Document Status:** OFFICIAL PROPOSAL — STRICTLY FOR STAGING REVIEW  
**Target Migration File:** `supabase/migrations/002_rls_security_hardening.sql` (To be authored upon approval)  
**Baseline Inspection:** `supabase/migrations/001_initial_schema.sql`  

---

## 1. Schema Delta Catalog (All Changes from Baseline `001`)

The table below catalogs every schema modification proposed against the baseline `001_initial_schema.sql`:

| Schema Object | Change Type | Specification | Reversibility / Rollback Strategy |
|---|---|---|---|
| `public.students.candidate_apaar_id` | `ADD COLUMN` | `TEXT` (Stores unverified candidate identifiers) | Reversible: `ALTER TABLE public.students DROP COLUMN IF EXISTS candidate_apaar_id;` |
| `public.enrolment_result` | `CREATE TYPE` | Composite type: `(enrolment_id, student_id, duplicate_case_id, status_code, message)` | Reversible: `DROP TYPE IF EXISTS public.enrolment_result;` |
| `public.uq_profile_single_active_membership` | `CREATE UNIQUE INDEX` | Partial unique index on `institution_memberships (profile_id) WHERE is_active = true` | Reversible: `DROP INDEX IF EXISTS public.uq_profile_single_active_membership;` |
| Authorization Helpers | `CREATE OR REPLACE` | `current_user_role`, `current_user_institution_id` (STRICT), `is_aicte_admin` | Reversible: Restore definitions from `001_initial_schema.sql` |
| Stored Procedures | `CREATE OR REPLACE` | `enrol_student_atomic`, `correct_student_demographics` | Reversible: `DROP FUNCTION ...` |
| Audit Triggers | `CREATE TRIGGER` | 10 triggers on operational tables | Reversible: `DROP TRIGGER ...` |
| State Machine Triggers | `CREATE TRIGGER` | Triggers on `submission_batches` and `enrolments` | Reversible: `DROP TRIGGER ...` |
| RLS Policies | `CREATE POLICY` | Scoped replacement policies across 12 tables | Reversible: Restore legacy policies from `001_initial_schema.sql` |
| Privileges | `REVOKE / GRANT` | Revoke table-level writes; grant column updates | Reversible: Re-grant default Supabase table permissions |

---

## 2. Complete Proposed SQL Migration (`002_rls_security_hardening.sql`)

```sql
-- =============================================================================
-- PROPOSED MIGRATION DRAFT (v11.3) — DO NOT EXECUTE DIRECTLY
-- File: supabase/migrations/002_rls_security_hardening.sql
-- Description: AICTE–APAAR Database Security Remediation Specification v11.3
-- Minimum Database Version: PostgreSQL 14+ / Supabase PG 15
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- SECTION 1: HARDENED SEARCH PATH AND ENVIRONMENT
-- -----------------------------------------------------------------------------
SET search_path = pg_catalog, public;

-- -----------------------------------------------------------------------------
-- SECTION 2: CLEANUP OF OBSOLETE GENERIC FUNCTIONS
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.emit_internal_audit_log(text, text, uuid, uuid, jsonb, jsonb);
DROP FUNCTION IF EXISTS public.record_audit_event(text, text, uuid, uuid, jsonb, jsonb);

-- -----------------------------------------------------------------------------
-- SECTION 3: IDEMPOTENT TYPE DEFINITION
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t 
    JOIN pg_namespace n ON n.oid = t.typnamespace 
    WHERE t.typname = 'enrolment_result' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.enrolment_result AS (
      enrolment_id uuid,
      student_id uuid,
      duplicate_case_id uuid,
      status_code text,
      message text
    );
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- SECTION 4: HARDENED SYSTEM AUTHORIZATION HELPERS
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT role
  FROM public.profiles
  WHERE id = auth.uid()
    AND is_active = true;
$$;

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
      RAISE EXCEPTION 'Security invariant violation: multiple active memberships detected for profile %', auth.uid()
        USING ERRCODE = '55000';
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_aicte_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'aicte_admin'::public.user_role
      AND is_active = true
  );
$$;

REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_institution_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_aicte_admin() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_institution_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_aicte_admin() TO authenticated;

-- -----------------------------------------------------------------------------
-- SECTION 5: CANDIDATE APAAR SEPARATION & PREFLIGHT MEMBERSHIP ASSERTION
-- -----------------------------------------------------------------------------
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS candidate_apaar_id TEXT;

-- Assert zero unreviewed active membership duplicates exist before applying index
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.institution_memberships
    WHERE is_active = true
    GROUP BY profile_id HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Migration Gate Failure: Multiple active memberships detected. Reconcile data before creating uq_profile_single_active_membership.'
      USING ERRCODE = '55000';
  END IF;
END $$;

-- Enforce exactly one active membership per profile
DROP INDEX IF EXISTS public.uq_profile_single_active_membership;
CREATE UNIQUE INDEX uq_profile_single_active_membership
ON public.institution_memberships (profile_id)
WHERE is_active = true;

-- Profile to membership synchronization trigger
CREATE OR REPLACE FUNCTION public.sync_profile_membership_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF (TG_OP = 'INSERT') THEN
    IF NEW.institution_id IS NOT NULL AND NEW.is_active = true THEN
      UPDATE public.institution_memberships
      SET is_active = false
      WHERE profile_id = NEW.id AND is_active = true;

      INSERT INTO public.institution_memberships (profile_id, institution_id, granted_at, is_active)
      VALUES (NEW.id, NEW.institution_id, NOW(), true)
      ON CONFLICT (profile_id, institution_id)
      DO UPDATE SET is_active = true;
    END IF;

  ELSIF (TG_OP = 'UPDATE') THEN
    IF NEW.is_active = false AND OLD.is_active = true THEN
      UPDATE public.institution_memberships
      SET is_active = false
      WHERE profile_id = NEW.id AND is_active = true;

    ELSIF NEW.institution_id IS DISTINCT FROM OLD.institution_id THEN
      UPDATE public.institution_memberships
      SET is_active = false
      WHERE profile_id = NEW.id AND is_active = true;

      IF NEW.institution_id IS NOT NULL AND NEW.is_active = true THEN
        INSERT INTO public.institution_memberships (profile_id, institution_id, granted_at, is_active)
        VALUES (NEW.id, NEW.institution_id, NOW(), true)
        ON CONFLICT (profile_id, institution_id)
        DO UPDATE SET is_active = true;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profile_membership ON public.profiles;
CREATE TRIGGER trg_sync_profile_membership
AFTER INSERT OR UPDATE OF institution_id, is_active ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_membership_state();

-- -----------------------------------------------------------------------------
-- SECTION 6: PROFILE PROVISIONING & ESCALATION GUARDS
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, institution_id, is_active, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User'),
    'institution_admin'::public.user_role,
    NULL,
    false,
    NOW(),
    NOW()
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_profile_security_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    IF NOT public.is_aicte_admin() THEN
      NEW.role := 'institution_admin'::public.user_role;
      NEW.is_active := false;
      NEW.institution_id := NULL;
    END IF;

  ELSIF (TG_OP = 'UPDATE') THEN
    IF (NEW.role IS DISTINCT FROM OLD.role OR
        NEW.is_active IS DISTINCT FROM OLD.is_active OR
        NEW.institution_id IS DISTINCT FROM OLD.institution_id) THEN
      
      IF NOT public.is_aicte_admin() THEN
        RAISE EXCEPTION 'Privilege escalation rejected: only active AICTE administrators may alter role, is_active, or institution_id'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_fields ON public.profiles;
CREATE TRIGGER trg_protect_profile_fields
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_security_fields();

-- -----------------------------------------------------------------------------
-- SECTION 7: STUDENT INSERT GUARDS & CONTROLLED CORRECTIONS
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_student_initial_verification_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    NEW.apaar_id := NULL;
    NEW.apaar_verification_status := 'unverified'::public.apaar_verification_status;
    NEW.apaar_verified_at := NULL;
    NEW.apaar_verification_source := 'mock';
    NEW.apaar_verification_note := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_student_insert ON public.students;
CREATE TRIGGER trg_guard_student_insert
BEFORE INSERT ON public.students
FOR EACH ROW EXECUTE FUNCTION public.guard_student_initial_verification_state();

CREATE OR REPLACE FUNCTION public.correct_student_demographics(
  p_student_id uuid,
  p_full_name text,
  p_date_of_birth date,
  p_gender text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_caller_inst_id uuid;
  v_current_status public.apaar_verification_status;
BEGIN
  v_caller_inst_id := public.current_user_institution_id();
  IF v_caller_inst_id IS NULL AND NOT public.is_aicte_admin() THEN
    RAISE EXCEPTION 'Authorization failure: caller has no active institution' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_aicte_admin() THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.enrolments 
      WHERE student_id = p_student_id AND institution_id = v_caller_inst_id
    ) THEN
      RAISE EXCEPTION 'Permission denied: student not enrolled in caller institution' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT apaar_verification_status INTO v_current_status
  FROM public.students WHERE id = p_student_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student % not found', p_student_id USING ERRCODE = '22023';
  END IF;

  IF v_current_status = 'verified'::public.apaar_verification_status AND NOT public.is_aicte_admin() THEN
    RAISE EXCEPTION 'Direct correction rejected: verified student records require AICTE administrative review' USING ERRCODE = '55000';
  END IF;

  UPDATE public.students
  SET full_name = trim(p_full_name),
      date_of_birth = p_date_of_birth,
      gender = p_gender,
      updated_at = NOW()
  WHERE id = p_student_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.correct_student_demographics(uuid, text, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.correct_student_demographics(uuid, text, date, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- SECTION 8: ATOMIC ENROLMENT PROCEDURE WITH PRE-CAPACITY IDEMPOTENCY
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enrol_student_atomic(
  p_institution_id uuid,
  p_programme_id uuid,
  p_academic_year text,
  p_batch_id uuid,
  p_institution_student_id text,
  p_full_name text,
  p_date_of_birth date,
  p_gender text,
  p_candidate_apaar_id text DEFAULT NULL
)
RETURNS public.enrolment_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_res public.enrolment_result;
  v_existing_enrolment_id uuid;
  v_existing_student_id uuid;
  v_existing_prog_id uuid;
  v_existing_enrol_status public.enrolment_status;
  v_student_id uuid;
  v_candidate_student_id uuid;
  v_existing_name text;
  v_existing_dob date;
  v_intake_limit integer;
  v_current_count integer;
  v_batch_status public.batch_status;
  v_caller_inst_id uuid;
  v_enrolment_id uuid;
  v_case_id uuid;
  v_norm_apaar text := NULL;
BEGIN
  -- 0. TRANSACTION ADVISORY LOCK FOR CONCURRENT RETRIES
  PERFORM pg_advisory_xact_lock(hashtext('enrol_' || p_institution_id::text || '_' || p_institution_student_id || '_' || p_academic_year));

  -- 1. Tenant Authorization
  IF NOT public.is_aicte_admin() THEN
    v_caller_inst_id := public.current_user_institution_id();
    IF v_caller_inst_id IS NULL OR v_caller_inst_id != p_institution_id THEN
      RAISE EXCEPTION 'Tenant authorization failure: caller cannot enrol for institution %', p_institution_id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 2. Verify Programme Ownership
  IF NOT EXISTS (
    SELECT 1 FROM public.programmes
    WHERE id = p_programme_id AND institution_id = p_institution_id
  ) THEN
    RAISE EXCEPTION 'Programme % does not belong to institution %', p_programme_id, p_institution_id
      USING ERRCODE = '22023';
  END IF;

  -- 3. IMMEDIATE IDEMPOTENCY CHECK (BEFORE LOCKING INTAKE OR CREATING STUDENTS)
  SELECT id, student_id, programme_id, enrolment_status
  INTO v_existing_enrolment_id, v_existing_student_id, v_existing_prog_id, v_existing_enrol_status
  FROM public.enrolments
  WHERE institution_id = p_institution_id
    AND institution_student_id = p_institution_student_id
    AND academic_year = p_academic_year;

  IF FOUND THEN
    IF v_existing_prog_id = p_programme_id THEN
      SELECT full_name, date_of_birth INTO v_existing_name, v_existing_dob
      FROM public.students WHERE id = v_existing_student_id;

      IF lower(trim(v_existing_name)) = lower(trim(p_full_name)) AND 
         (v_existing_dob IS NULL OR v_existing_dob = p_date_of_birth) THEN
        v_res.enrolment_id := v_existing_enrolment_id;
        v_res.student_id := v_existing_student_id;
        v_res.duplicate_case_id := NULL;
        v_res.status_code := 'already_enrolled';
        v_res.message := 'Idempotent retry: student already enrolled in programme.';
        RETURN v_res;
      ELSE
        RAISE EXCEPTION 'Conflicting identity: institution_student_id % belongs to a student with different demographics', p_institution_student_id
          USING ERRCODE = '23505';
      END IF;
    ELSE
      RAISE EXCEPTION 'Conflicting enrolment: institution_student_id % already enrolled in a different programme', p_institution_student_id
        USING ERRCODE = '23505';
    END IF;
  END IF;

  -- 4. NEW ENROLMENT: ROW LOCK SUBMISSION BATCH
  IF p_batch_id IS NOT NULL THEN
    SELECT status INTO v_batch_status
    FROM public.submission_batches
    WHERE id = p_batch_id
      AND institution_id = p_institution_id
      AND academic_year = p_academic_year
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Batch % not found or does not belong to institution % in academic year %',
        p_batch_id, p_institution_id, p_academic_year
        USING ERRCODE = '22023';
    END IF;

    IF v_batch_status != 'draft'::public.batch_status THEN
      RAISE EXCEPTION 'Batch % is not in draft status (current: %)', p_batch_id, v_batch_status
        USING ERRCODE = '55000';
    END IF;
  END IF;

  -- 5. ROW LOCK INTAKE AND EVALUATE QUOTA
  SELECT approved_intake INTO v_intake_limit
  FROM public.approved_intakes
  WHERE institution_id = p_institution_id
    AND programme_id = p_programme_id
    AND academic_year = p_academic_year
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No approved intake configured for programme % in academic year %',
      p_programme_id, p_academic_year
      USING ERRCODE = '22023';
  END IF;

  SELECT COUNT(*) INTO v_current_count
  FROM public.enrolments
  WHERE institution_id = p_institution_id
    AND programme_id = p_programme_id
    AND academic_year = p_academic_year
    AND enrolment_status = 'active'::public.enrolment_status
    AND submission_status != 'rejected'::public.submission_status;

  IF v_current_count >= v_intake_limit THEN
    RAISE EXCEPTION 'Intake capacity exceeded: current count % meets approved limit %',
      v_current_count, v_intake_limit
      USING ERRCODE = '54000';
  END IF;

  -- 6. CANDIDATE APAAR VALIDATION & ADVISORY LOCK
  IF p_candidate_apaar_id IS NOT NULL AND trim(p_candidate_apaar_id) != '' THEN
    IF trim(p_candidate_apaar_id) !~ '^[0-9\s\-]+$' THEN
      RAISE EXCEPTION 'Invalid APAAR format: identifier contains forbidden characters'
        USING ERRCODE = '22023';
    END IF;

    v_norm_apaar := regexp_replace(trim(p_candidate_apaar_id), '[^0-9]', '', 'g');
    IF length(v_norm_apaar) != 12 THEN
      RAISE EXCEPTION 'Invalid APAAR format: identifier must be exactly 12 numeric digits'
        USING ERRCODE = '22023';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('candidate_apaar_' || v_norm_apaar));

    SELECT id, full_name, date_of_birth
    INTO v_student_id, v_existing_name, v_existing_dob
    FROM public.students
    WHERE apaar_id = v_norm_apaar OR candidate_apaar_id = v_norm_apaar
    LIMIT 1;

    IF FOUND THEN
      IF lower(trim(v_existing_name)) != lower(trim(p_full_name)) OR 
         (v_existing_dob IS NOT NULL AND v_existing_dob != p_date_of_birth) THEN
        
        -- Create candidate record without APAAR
        INSERT INTO public.students (full_name, date_of_birth, gender, candidate_apaar_id, apaar_id, apaar_verification_status, created_at, updated_at)
        VALUES (p_full_name, p_date_of_birth, p_gender, NULL, NULL, 'unverified'::public.apaar_verification_status, NOW(), NOW())
        RETURNING id INTO v_candidate_student_id;

        -- Commit duplicate review case cleanly
        INSERT INTO public.duplicate_review_cases (
          batch_id,
          student_id_1,
          student_id_2,
          detection_reason,
          review_status,
          created_at
        ) VALUES (
          p_batch_id,
          v_student_id,
          v_candidate_student_id,
          'ERR_DEMOGRAPHIC_MISMATCH: submitted name/DOB differs from registered record',
          'pending'::public.duplicate_review_status,
          NOW()
        )
        RETURNING id INTO v_case_id;

        v_res.enrolment_id := NULL;
        v_res.student_id := v_candidate_student_id;
        v_res.duplicate_case_id := v_case_id;
        v_res.status_code := 'duplicate_review_required';
        v_res.message := 'Identity conflict detected: submitted demographics do not match registered record. Routed to duplicate review.';
        RETURN v_res;
      END IF;
    ELSE
      INSERT INTO public.students (full_name, date_of_birth, gender, candidate_apaar_id, apaar_id, apaar_verification_status, created_at, updated_at)
      VALUES (p_full_name, p_date_of_birth, p_gender, v_norm_apaar, NULL, 'unverified'::public.apaar_verification_status, NOW(), NOW())
      RETURNING id INTO v_student_id;
    END IF;
  ELSE
    INSERT INTO public.students (full_name, date_of_birth, gender, candidate_apaar_id, apaar_id, apaar_verification_status, created_at, updated_at)
    VALUES (p_full_name, p_date_of_birth, p_gender, NULL, NULL, 'unverified'::public.apaar_verification_status, NOW(), NOW())
    RETURNING id INTO v_student_id;
  END IF;

  -- 7. CHECK CONSTRAINT 2: no_duplicate_enrolment
  IF EXISTS (
    SELECT 1 FROM public.enrolments
    WHERE student_id = v_student_id
      AND institution_id = p_institution_id
      AND programme_id = p_programme_id
      AND academic_year = p_academic_year
  ) THEN
    RAISE EXCEPTION 'Duplicate enrolment rejected: student is already enrolled in this programme and academic year'
      USING ERRCODE = '23505';
  END IF;

  -- 8. CREATE ENROLMENT RECORD
  INSERT INTO public.enrolments (
    student_id,
    institution_id,
    programme_id,
    academic_year,
    admission_date,
    batch_id,
    institution_student_id,
    enrolment_status,
    submission_status,
    created_at,
    updated_at
  ) VALUES (
    v_student_id,
    p_institution_id,
    p_programme_id,
    p_academic_year,
    CURRENT_DATE,
    p_batch_id,
    p_institution_student_id,
    'active'::public.enrolment_status,
    'draft'::public.submission_status,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_enrolment_id;

  v_res.enrolment_id := v_enrolment_id;
  v_res.student_id := v_student_id;
  v_res.duplicate_case_id := NULL;
  v_res.status_code := 'enrolled';
  v_res.message := 'Student successfully enrolled.';
  RETURN v_res;
END;
$$;

REVOKE ALL ON FUNCTION public.enrol_student_atomic(uuid, uuid, text, uuid, text, text, date, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enrol_student_atomic(uuid, uuid, text, uuid, text, text, date, text, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- SECTION 9: BATCH COUNTERS, TRANSITION GUARDS & STATE MACHINE
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_batch_record_counters()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_batch_id uuid;
BEGIN
  v_batch_id := COALESCE(NEW.batch_id, OLD.batch_id);
  IF v_batch_id IS NULL THEN RETURN NEW; END IF;

  UPDATE public.submission_batches
  SET valid_records = (
        SELECT COUNT(*) FROM public.enrolments 
        WHERE batch_id = v_batch_id
      ),
      error_records = (
        SELECT COUNT(*) FROM public.submission_errors 
        WHERE batch_id = v_batch_id
      ),
      total_records = (
        (SELECT COUNT(*) FROM public.enrolments WHERE batch_id = v_batch_id) +
        (SELECT COUNT(*) FROM public.submission_errors WHERE batch_id = v_batch_id)
      ),
      updated_at = NOW()
  WHERE id = v_batch_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_enrolment_counters ON public.enrolments;
CREATE TRIGGER trg_sync_enrolment_counters
AFTER INSERT OR DELETE ON public.enrolments
FOR EACH ROW EXECUTE FUNCTION public.sync_batch_record_counters();

DROP TRIGGER IF EXISTS trg_sync_error_counters ON public.submission_errors;
CREATE TRIGGER trg_sync_error_counters
AFTER INSERT OR DELETE ON public.submission_errors
FOR EACH ROW EXECUTE FUNCTION public.sync_batch_record_counters();

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
    IF v_role = 'institution_admin'::public.user_role THEN
      IF NOT (
        (OLD.status IN ('draft', 'returned_for_correction', 'validation_failed') AND NEW.status = 'submitted') OR
        (OLD.status = 'submitted' AND NEW.status = 'draft')
      ) THEN
        RAISE EXCEPTION 'Illegal batch transition from % to % for institution_admin',
          OLD.status, NEW.status USING ERRCODE = '55000';
      END IF;

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

DROP TRIGGER IF EXISTS trg_batch_status_transition ON public.submission_batches;
CREATE TRIGGER trg_batch_status_transition
BEFORE UPDATE OF status ON public.submission_batches
FOR EACH ROW EXECUTE FUNCTION public.enforce_batch_state_transitions();

CREATE OR REPLACE FUNCTION public.protect_batch_reviewer_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF (NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by OR
      NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at OR
      NEW.reviewer_notes IS DISTINCT FROM OLD.reviewer_notes) THEN
    
    IF NOT public.is_aicte_admin() THEN
      RAISE EXCEPTION 'Permission denied: only AICTE reviewers may modify batch review metadata'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_batch_reviewer_fields ON public.submission_batches;
CREATE TRIGGER trg_protect_batch_reviewer_fields
BEFORE UPDATE ON public.submission_batches
FOR EACH ROW EXECUTE FUNCTION public.protect_batch_reviewer_fields();

CREATE OR REPLACE FUNCTION public.enforce_enrolment_state_transitions()
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
    RAISE EXCEPTION 'Authorization failure: anonymous or inactive users cannot modify enrolment status'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.submission_status IS DISTINCT FROM OLD.submission_status THEN
    IF v_role = 'institution_admin'::public.user_role THEN
      IF NOT (
        (OLD.submission_status IN ('draft', 'returned_for_correction', 'validation_failed') AND NEW.submission_status = 'submitted') OR
        (OLD.submission_status = 'submitted' AND NEW.submission_status = 'draft')
      ) THEN
        RAISE EXCEPTION 'Illegal status transition from % to % for institution_admin',
          OLD.submission_status, NEW.submission_status
          USING ERRCODE = '55000';
      END IF;

    ELSIF v_role = 'aicte_admin'::public.user_role THEN
      IF NOT (
        (OLD.submission_status = 'submitted' AND NEW.submission_status IN ('under_review', 'returned_for_correction', 'rejected', 'approved')) OR
        (OLD.submission_status = 'under_review' AND NEW.submission_status IN ('approved', 'rejected', 'returned_for_correction')) OR
        (OLD.submission_status = 'returned_for_correction' AND NEW.submission_status IN ('under_review', 'rejected'))
      ) THEN
        RAISE EXCEPTION 'Illegal status transition from % to % for aicte_admin',
          OLD.submission_status, NEW.submission_status
          USING ERRCODE = '55000';
      END IF;
    ELSE
      RAISE EXCEPTION 'Role % not permitted to modify submission status', v_role
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enrolment_status_transition ON public.enrolments;
CREATE TRIGGER trg_enrolment_status_transition
BEFORE UPDATE OF submission_status ON public.enrolments
FOR EACH ROW EXECUTE FUNCTION public.enforce_enrolment_state_transitions();

-- -----------------------------------------------------------------------------
-- SECTION 10: TRUSTED AUDIT SYSTEM (NON-SPOOFABLE ATTRIBUTION)
-- -----------------------------------------------------------------------------
REVOKE ALL ON public.audit_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;

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
  -- Non-spoofable forensic attribution in SECURITY DEFINER context
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

  -- Redact sensitive identity fields from students audit diff
  IF TG_TABLE_NAME = 'students' THEN
    IF v_old IS NOT NULL THEN v_old := v_old - 'date_of_birth' - 'apaar_id' - 'candidate_apaar_id'; END IF;
    IF v_new IS NOT NULL THEN v_new := v_new - 'date_of_birth' - 'apaar_id' - 'candidate_apaar_id'; END IF;
  END IF;

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

DROP TRIGGER IF EXISTS trg_audit_batches ON public.submission_batches;
CREATE TRIGGER trg_audit_batches AFTER INSERT OR UPDATE OR DELETE ON public.submission_batches
FOR EACH ROW EXECUTE FUNCTION public.audit_table_mutation_trigger();

DROP TRIGGER IF EXISTS trg_audit_profiles ON public.profiles;
CREATE TRIGGER trg_audit_profiles AFTER INSERT OR UPDATE OR DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.audit_table_mutation_trigger();

DROP TRIGGER IF EXISTS trg_audit_memberships ON public.institution_memberships;
CREATE TRIGGER trg_audit_memberships AFTER INSERT OR UPDATE OR DELETE ON public.institution_memberships
FOR EACH ROW EXECUTE FUNCTION public.audit_table_mutation_trigger();

DROP TRIGGER IF EXISTS trg_audit_students ON public.students;
CREATE TRIGGER trg_audit_students AFTER INSERT OR UPDATE OR DELETE ON public.students
FOR EACH ROW EXECUTE FUNCTION public.audit_table_mutation_trigger();

DROP TRIGGER IF EXISTS trg_audit_enrolments ON public.enrolments;
CREATE TRIGGER trg_audit_enrolments AFTER INSERT OR UPDATE OR DELETE ON public.enrolments
FOR EACH ROW EXECUTE FUNCTION public.audit_table_mutation_trigger();

DROP TRIGGER IF EXISTS trg_audit_verification_events ON public.verification_events;
CREATE TRIGGER trg_audit_verification_events AFTER INSERT OR UPDATE OR DELETE ON public.verification_events
FOR EACH ROW EXECUTE FUNCTION public.audit_table_mutation_trigger();

DROP TRIGGER IF EXISTS trg_audit_duplicate_cases ON public.duplicate_review_cases;
CREATE TRIGGER trg_audit_duplicate_cases AFTER INSERT OR UPDATE OR DELETE ON public.duplicate_review_cases
FOR EACH ROW EXECUTE FUNCTION public.audit_table_mutation_trigger();

DROP TRIGGER IF EXISTS trg_audit_approved_intakes ON public.approved_intakes;
CREATE TRIGGER trg_audit_approved_intakes AFTER INSERT OR UPDATE OR DELETE ON public.approved_intakes
FOR EACH ROW EXECUTE FUNCTION public.audit_table_mutation_trigger();

DROP TRIGGER IF EXISTS trg_audit_institutions ON public.institutions;
CREATE TRIGGER trg_audit_institutions AFTER INSERT OR UPDATE OR DELETE ON public.institutions
FOR EACH ROW EXECUTE FUNCTION public.audit_table_mutation_trigger();

DROP TRIGGER IF EXISTS trg_audit_programmes ON public.programmes;
CREATE TRIGGER trg_audit_programmes AFTER INSERT OR UPDATE OR DELETE ON public.programmes
FOR EACH ROW EXECUTE FUNCTION public.audit_table_mutation_trigger();

-- -----------------------------------------------------------------------------
-- SECTION 11: SCOPED ROW LEVEL SECURITY POLICIES (12 TABLES)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  tbl text;
  pol text;
  scoped_tables text[] := ARRAY[
    'profiles', 'institutions', 'institution_memberships', 'programmes',
    'approved_intakes', 'students', 'submission_batches', 'enrolments',
    'submission_errors', 'verification_events', 'duplicate_review_cases', 'audit_logs'
  ];
BEGIN
  FOREACH tbl IN ARRAY scoped_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
  END LOOP;

  FOR tbl, pol IN (
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = ANY(scoped_tables)
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', pol, tbl);
  END LOOP;
END $$;

-- 1. PROFILES
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_aicte_admin());

CREATE POLICY profiles_update ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_aicte_admin())
  WITH CHECK (id = auth.uid() OR public.is_aicte_admin());

-- 2. INSTITUTIONS
CREATE POLICY institutions_select ON public.institutions FOR SELECT TO authenticated
  USING (true);

CREATE POLICY institutions_admin_write ON public.institutions FOR ALL TO authenticated
  USING (public.is_aicte_admin())
  WITH CHECK (public.is_aicte_admin());

-- 3. INSTITUTION MEMBERSHIPS
CREATE POLICY memberships_select ON public.institution_memberships FOR SELECT TO authenticated
  USING (profile_id = auth.uid() OR institution_id = public.current_user_institution_id() OR public.is_aicte_admin());

CREATE POLICY memberships_aicte_write ON public.institution_memberships FOR ALL TO authenticated
  USING (public.is_aicte_admin())
  WITH CHECK (public.is_aicte_admin());

-- 4. PROGRAMMES
CREATE POLICY programmes_select ON public.programmes FOR SELECT TO authenticated
  USING (institution_id = public.current_user_institution_id() OR public.is_aicte_admin());

CREATE POLICY programmes_inst_write ON public.programmes FOR ALL TO authenticated
  USING (institution_id = public.current_user_institution_id() OR public.is_aicte_admin())
  WITH CHECK (institution_id = public.current_user_institution_id() OR public.is_aicte_admin());

-- 5. APPROVED INTAKES
CREATE POLICY intakes_select ON public.approved_intakes FOR SELECT TO authenticated
  USING (institution_id = public.current_user_institution_id() OR public.is_aicte_admin());

CREATE POLICY intakes_aicte_write ON public.approved_intakes FOR ALL TO authenticated
  USING (public.is_aicte_admin())
  WITH CHECK (public.is_aicte_admin());

-- 6. STUDENTS (Includes candidate visibility for review cases)
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

-- 7. SUBMISSION BATCHES
CREATE POLICY batches_select ON public.submission_batches FOR SELECT TO authenticated
  USING (institution_id = public.current_user_institution_id() OR public.is_aicte_admin());

CREATE POLICY batches_inst_insert ON public.submission_batches FOR INSERT TO authenticated
  WITH CHECK (institution_id = public.current_user_institution_id() OR public.is_aicte_admin());

CREATE POLICY batches_update ON public.submission_batches FOR UPDATE TO authenticated
  USING (institution_id = public.current_user_institution_id() OR public.is_aicte_admin())
  WITH CHECK (institution_id = public.current_user_institution_id() OR public.is_aicte_admin());

-- 8. ENROLMENTS
CREATE POLICY enrolments_select ON public.enrolments FOR SELECT TO authenticated
  USING (institution_id = public.current_user_institution_id() OR public.is_aicte_admin());

CREATE POLICY enrolments_update ON public.enrolments FOR UPDATE TO authenticated
  USING (institution_id = public.current_user_institution_id() OR public.is_aicte_admin())
  WITH CHECK (institution_id = public.current_user_institution_id() OR public.is_aicte_admin());

-- 9. SUBMISSION ERRORS
CREATE POLICY errors_select ON public.submission_errors FOR SELECT TO authenticated
  USING (
    public.is_aicte_admin() OR
    EXISTS (
      SELECT 1 FROM public.submission_batches b
      WHERE b.id = submission_errors.batch_id
        AND b.institution_id = public.current_user_institution_id()
    )
  );

CREATE POLICY errors_inst_insert ON public.submission_errors FOR INSERT TO authenticated
  WITH CHECK (
    public.is_aicte_admin() OR
    EXISTS (
      SELECT 1 FROM public.submission_batches b
      WHERE b.id = submission_errors.batch_id
        AND b.institution_id = public.current_user_institution_id()
    )
  );

-- 10. VERIFICATION EVENTS
CREATE POLICY verif_events_select ON public.verification_events FOR SELECT TO authenticated
  USING (
    public.is_aicte_admin() OR
    EXISTS (
      SELECT 1 FROM public.enrolments e
      WHERE e.student_id = verification_events.student_id
        AND e.institution_id = public.current_user_institution_id()
    )
  );

-- 11. DUPLICATE REVIEW CASES (Batch-scoped to submitting institution)
CREATE POLICY duplicate_cases_select ON public.duplicate_review_cases FOR SELECT TO authenticated
  USING (
    public.is_aicte_admin() OR
    EXISTS (
      SELECT 1 FROM public.submission_batches b
      WHERE b.id = duplicate_review_cases.batch_id
        AND b.institution_id = public.current_user_institution_id()
    )
  );

CREATE POLICY duplicate_cases_update ON public.duplicate_review_cases FOR UPDATE TO authenticated
  USING (public.is_aicte_admin())
  WITH CHECK (public.is_aicte_admin());

-- 12. AUDIT LOGS
CREATE POLICY audit_logs_select ON public.audit_logs FOR SELECT TO authenticated
  USING (
    public.is_aicte_admin() OR
    (institution_id IS NOT NULL AND institution_id = public.current_user_institution_id())
  );

-- -----------------------------------------------------------------------------
-- SECTION 12: STRICT RECONCILIATION OF TABLE & COLUMN PRIVILEGES
-- -----------------------------------------------------------------------------
REVOKE ALL ON public.profiles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.students FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.enrolments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.verification_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.audit_logs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.duplicate_review_cases FROM PUBLIC, anon, authenticated;

-- Allow SELECT under RLS
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.students TO authenticated;
GRANT SELECT ON public.enrolments TO authenticated;
GRANT SELECT ON public.verification_events TO authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT SELECT ON public.duplicate_review_cases TO authenticated;

-- Granular column updates
GRANT UPDATE (full_name) ON public.profiles TO authenticated;
GRANT UPDATE (submission_status) ON public.enrolments TO authenticated;
GRANT UPDATE (review_status, reviewer_notes, reviewed_at) ON public.duplicate_review_cases TO authenticated;

COMMIT;
```


---

## 3. Preflight Diagnostic & Administrative Reconciliation Playbook

### 3.1 Preflight Diagnostic Query (Execute Before Migration)
Run the following read-only diagnostic query on the target database to detect any active membership violations:

```sql
-- DIAGNOSTIC QUERY 1: Active Membership Duplicates
SELECT profile_id, COUNT(*) AS active_count, array_agg(institution_id) AS institutions
FROM public.institution_memberships
WHERE is_active = true
GROUP BY profile_id
HAVING COUNT(*) > 1;

-- DIAGNOSTIC QUERY 2: Inactive Profiles with Active Memberships
SELECT m.profile_id, p.email, m.institution_id
FROM public.institution_memberships m
JOIN public.profiles p ON p.id = m.profile_id
WHERE m.is_active = true AND p.is_active = false;
```

If Query 1 returns ANY rows, the migration will fail closed at Gate 1 (`ERRCODE = '55000'`).

### 3.2 Controlled Administrative Reconciliation Script
If duplicate active memberships are discovered, AICTE administrators must review the accounts and execute the following audited reconciliation script prior to running the migration:

```sql
-- AUDITED MEMBERSHIP RECONCILIATION SCRIPT
-- Execute only after formal review of duplicate accounts
BEGIN;

-- 1. Record pre-reconciliation snapshot in audit_logs
INSERT INTO public.audit_logs (actor_email, actor_role, action, entity_type, entity_id, old_values, created_at)
SELECT 
  'direct_db_admin_reconciliation',
  'aicte_admin',
  'PRE_MIGRATION_MEMBERSHIP_DEACTIVATION',
  'institution_memberships',
  m.id::text,
  to_jsonb(m),
  NOW()
FROM public.institution_memberships m
WHERE m.is_active = true
  AND m.profile_id IN (
    SELECT profile_id FROM public.institution_memberships WHERE is_active = true GROUP BY profile_id HAVING COUNT(*) > 1
  )
  AND m.granted_at < (
    SELECT MAX(granted_at) FROM public.institution_memberships m2 WHERE m2.profile_id = m.profile_id AND m2.is_active = true
  );

-- 2. Deactivate older memberships, retaining only the most recently granted membership
UPDATE public.institution_memberships m
SET is_active = false
WHERE m.is_active = true
  AND m.profile_id IN (
    SELECT profile_id FROM public.institution_memberships WHERE is_active = true GROUP BY profile_id HAVING COUNT(*) > 1
  )
  AND m.granted_at < (
    SELECT MAX(granted_at) FROM public.institution_memberships m2 WHERE m2.profile_id = m.profile_id AND m2.is_active = true
  );

-- 3. Verify exactly 0 duplicates remain
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.institution_memberships WHERE is_active = true GROUP BY profile_id HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Reconciliation failed: duplicate active memberships still detected.' USING ERRCODE = '55000';
  END IF;
END $$;

COMMIT;
```

### 3.3 Tested Rollback Script for Membership Reconciliation
If an administrative deactivation must be reversed, execute:

```sql
-- ROLLBACK MEMBERSHIP RECONCILIATION
BEGIN;

UPDATE public.institution_memberships m
SET is_active = (a.old_values->>'is_active')::boolean
FROM public.audit_logs a
WHERE a.entity_type = 'institution_memberships'
  AND a.entity_id = m.id::text
  AND a.action = 'PRE_MIGRATION_MEMBERSHIP_DEACTIVATION'
  AND a.created_at >= NOW() - INTERVAL '24 hours';

COMMIT;
```

---

## 4. Standalone Migration Rollback Script (`002_rollback.sql`)

The following SQL script completely reverts all changes introduced by `002_rls_security_hardening.sql`, restoring the schema to the exact baseline of `001_initial_schema.sql`:

```sql
-- =============================================================================
-- ROLLBACK SCRIPT: Revert 002_rls_security_hardening.sql to 001_initial_schema.sql
-- =============================================================================
BEGIN;

SET search_path = pg_catalog, public;

-- 1. DROP AUDIT TRIGGERS
DROP TRIGGER IF EXISTS trg_audit_batches ON public.submission_batches;
DROP TRIGGER IF EXISTS trg_audit_profiles ON public.profiles;
DROP TRIGGER IF EXISTS trg_audit_memberships ON public.institution_memberships;
DROP TRIGGER IF EXISTS trg_audit_students ON public.students;
DROP TRIGGER IF EXISTS trg_audit_enrolments ON public.enrolments;
DROP TRIGGER IF EXISTS trg_audit_verification_events ON public.verification_events;
DROP TRIGGER IF EXISTS trg_audit_duplicate_cases ON public.duplicate_review_cases;
DROP TRIGGER IF EXISTS trg_audit_approved_intakes ON public.approved_intakes;
DROP TRIGGER IF EXISTS trg_audit_institutions ON public.institutions;
DROP TRIGGER IF EXISTS trg_audit_programmes ON public.programmes;
DROP FUNCTION IF EXISTS public.audit_table_mutation_trigger();

-- 2. DROP STATE MACHINE & COUNTER TRIGGERS
DROP TRIGGER IF EXISTS trg_sync_enrolment_counters ON public.enrolments;
DROP TRIGGER IF EXISTS trg_sync_error_counters ON public.submission_errors;
DROP FUNCTION IF EXISTS public.sync_batch_record_counters();

DROP TRIGGER IF EXISTS trg_batch_status_transition ON public.submission_batches;
DROP FUNCTION IF EXISTS public.enforce_batch_state_transitions();

DROP TRIGGER IF EXISTS trg_protect_batch_reviewer_fields ON public.submission_batches;
DROP FUNCTION IF EXISTS public.protect_batch_reviewer_fields();

DROP TRIGGER IF EXISTS trg_enrolment_status_transition ON public.enrolments;
DROP FUNCTION IF EXISTS public.enforce_enrolment_state_transitions();

-- 3. DROP PROCEDURES & GUARDS
DROP TRIGGER IF EXISTS trg_guard_student_insert ON public.students;
DROP FUNCTION IF EXISTS public.guard_student_initial_verification_state();
DROP FUNCTION IF EXISTS public.correct_student_demographics(uuid, text, date, text);
DROP FUNCTION IF EXISTS public.enrol_student_atomic(uuid, uuid, text, uuid, text, text, date, text, text);

-- 4. DROP PROFILE & MEMBERSHIP GUARDS
DROP TRIGGER IF EXISTS trg_protect_profile_fields ON public.profiles;
DROP FUNCTION IF EXISTS public.protect_profile_security_fields();
DROP TRIGGER IF EXISTS trg_sync_profile_membership ON public.profiles;
DROP FUNCTION IF EXISTS public.sync_profile_membership_state();

-- 5. DROP INDEX & COLUMN ADDITIONS
DROP INDEX IF EXISTS public.uq_profile_single_active_membership;
ALTER TABLE public.students DROP COLUMN IF EXISTS candidate_apaar_id;
DROP TYPE IF EXISTS public.enrolment_result;

-- 6. RESTORE BASELINE HELPER FUNCTIONS (FROM 001_initial_schema.sql)
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.current_user_institution_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT institution_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_aicte_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'aicte_admin'
  );
$$;

-- 7. RE-GRANT DEFAULT PERMISSIONS (FROM 001_initial_schema.sql)
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated, anon;

COMMIT;
```
