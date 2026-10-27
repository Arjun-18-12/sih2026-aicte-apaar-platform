-- =============================================================================
-- AICTE–APAAR: security hardening and trusted draft-batch provisioning
-- STATUS: REVIEW REQUIRED. Do not apply this file to any Supabase project until
-- the preflight checks in docs/SUPABASE_MANUAL_DEPLOYMENT.md have been completed.
--
-- This is additive to 001_initial_schema.sql. It does not recreate tables,
-- seed records, or alter approved-intake data.
-- =============================================================================

BEGIN;

-- New sign-ups are never allowed to choose their own database role. An initial
-- AICTE administrator is provisioned manually by the database owner instead.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    'institution_admin'::public.user_role
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- RLS helpers must not inherit an attacker-controlled search_path.
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.current_user_institution_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog
AS $$
  SELECT institution_id FROM public.profiles WHERE id = auth.uid();
$$;

-- Establish memberships for existing active institution administrators without
-- changing an existing membership's active/inactive state.
INSERT INTO public.institution_memberships (profile_id, institution_id, is_active)
SELECT id, institution_id, true
FROM public.profiles
WHERE role = 'institution_admin'::public.user_role
  AND is_active = true
  AND institution_id IS NOT NULL
ON CONFLICT (profile_id, institution_id) DO NOTHING;

-- Remove browser write paths for central records. The server-side upload RPC
-- (reviewed separately) and the trusted draft function below perform writes.
DROP POLICY IF EXISTS "AICTE admins can manage profiles" ON public.profiles;
DROP POLICY IF EXISTS "Institution admins: insert students" ON public.students;
DROP POLICY IF EXISTS "Institution admins: update students (limited)" ON public.students;
DROP POLICY IF EXISTS "AICTE admins: full access to enrolments" ON public.enrolments;
DROP POLICY IF EXISTS "Institution admins: insert own institution enrolments" ON public.enrolments;
DROP POLICY IF EXISTS "Institution admins: update own draft/failed enrolments" ON public.enrolments;
DROP POLICY IF EXISTS "Institution admins: create own batches" ON public.submission_batches;
DROP POLICY IF EXISTS "Institution admins: update own draft batches" ON public.submission_batches;
DROP POLICY IF EXISTS "Institution admins: insert own batch errors" ON public.submission_errors;
DROP POLICY IF EXISTS "Authenticated users: insert verification events" ON public.verification_events;
DROP POLICY IF EXISTS "Authenticated: insert audit logs" ON public.audit_logs;

-- A logged-in user may see only their own profile. AICTE administrators retain
-- read access for user management; profile changes remain database-owner/admin
-- operations until an audited management RPC is introduced.
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "AICTE admins can view all profiles" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (id = auth.uid());
CREATE POLICY "AICTE admins can view all profiles" ON public.profiles
  FOR SELECT USING (public.current_user_role() = 'aicte_admin'::public.user_role);

-- Preserve authorised read access; direct browser writes are deliberately absent.
DROP POLICY IF EXISTS "AICTE admins: full access to enrolments" ON public.enrolments;
CREATE POLICY "AICTE admins: read all enrolments" ON public.enrolments
  FOR SELECT USING (public.current_user_role() = 'aicte_admin'::public.user_role);

DROP POLICY IF EXISTS "Institution admins: read own institution enrolments" ON public.enrolments;
CREATE POLICY "Institution admins: read own institution enrolments" ON public.enrolments
  FOR SELECT USING (institution_id = public.current_user_institution_id());

DROP POLICY IF EXISTS "AICTE admins: read all students" ON public.students;
CREATE POLICY "AICTE admins: read all students" ON public.students
  FOR SELECT USING (public.current_user_role() = 'aicte_admin'::public.user_role);

DROP POLICY IF EXISTS "Institution admins: read students in own enrolments" ON public.students;
CREATE POLICY "Institution admins: read students in own enrolments" ON public.students
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.enrolments e
      WHERE e.student_id = students.id
        AND e.institution_id = public.current_user_institution_id()
    )
  );

DROP POLICY IF EXISTS "Institution admins: access own batches" ON public.submission_batches;
CREATE POLICY "Institution admins: access own batches" ON public.submission_batches
  FOR SELECT USING (institution_id = public.current_user_institution_id());

DROP POLICY IF EXISTS "AICTE admins: full access to batches" ON public.submission_batches;
CREATE POLICY "AICTE admins: full access to batches" ON public.submission_batches
  FOR ALL
  USING (public.current_user_role() = 'aicte_admin'::public.user_role)
  WITH CHECK (public.current_user_role() = 'aicte_admin'::public.user_role);

-- Audit and verification entries can now be produced only by owner-controlled
-- functions or database triggers; no client can forge a record.
DROP POLICY IF EXISTS "AICTE admins: read all audit logs" ON public.audit_logs;
CREATE POLICY "AICTE admins: read all audit logs" ON public.audit_logs
  FOR SELECT USING (public.current_user_role() = 'aicte_admin'::public.user_role);

DROP POLICY IF EXISTS "AICTE admins: read all verification events" ON public.verification_events;
CREATE POLICY "AICTE admins: read all verification events" ON public.verification_events
  FOR SELECT USING (public.current_user_role() = 'aicte_admin'::public.user_role);

DROP POLICY IF EXISTS "Institution admins: read own verification events" ON public.verification_events;
CREATE POLICY "Institution admins: read own verification events" ON public.verification_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.enrolments e
      WHERE e.student_id = verification_events.student_id
        AND e.institution_id = public.current_user_institution_id()
    )
  );

-- The browser supplies only a year and file size. The server derives the
-- institution from the active user and does not accept client-supplied counters.
CREATE OR REPLACE FUNCTION public.create_submission_batch_draft(
  p_academic_year text,
  p_total_records integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_institution_id uuid;
  v_email text;
  v_batch_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_academic_year !~ '^\d{4}-\d{2}$' OR p_total_records < 1 OR p_total_records > 5000 THEN
    RAISE EXCEPTION 'Invalid academic year or record count' USING ERRCODE = '22023';
  END IF;

  SELECT institution_id, email INTO v_institution_id, v_email
  FROM public.profiles
  WHERE id = v_user_id
    AND is_active = true
    AND role = 'institution_admin'::public.user_role;

  IF NOT FOUND OR v_institution_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.institution_memberships
    WHERE profile_id = v_user_id
      AND institution_id = v_institution_id
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Active institution membership required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.submission_batches (
    institution_id, academic_year, status, total_records, valid_records, error_records
  ) VALUES (
    v_institution_id, p_academic_year, 'draft'::public.batch_status, p_total_records, 0, 0
  ) RETURNING id INTO v_batch_id;

  INSERT INTO public.audit_logs (
    actor_id, actor_email, actor_role, institution_id, action, entity_type, entity_id, new_values
  ) VALUES (
    v_user_id, v_email, 'institution_admin'::public.user_role, v_institution_id,
    'BATCH_DRAFT_CREATED', 'submission_batches', v_batch_id::text,
    jsonb_build_object('academic_year', p_academic_year, 'total_records', p_total_records)
  );

  RETURN v_batch_id;
END;
$$;

-- These ownership changes require the migration to be run by the database owner.
ALTER FUNCTION public.handle_new_user() OWNER TO postgres;
ALTER FUNCTION public.current_user_role() OWNER TO postgres;
ALTER FUNCTION public.current_user_institution_id() OWNER TO postgres;
ALTER FUNCTION public.create_submission_batch_draft(text, integer) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.create_submission_batch_draft(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_submission_batch_draft(text, integer) TO authenticated;

COMMIT;
