-- ============================================================
-- AICTE-APAAR Platform: Complete Database Schema
-- Migration: 001_initial_schema.sql
-- Apply this in: Supabase Dashboard > SQL Editor > New Query > Run
-- ============================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For fuzzy name matching

-- ============================================================
-- CUSTOM TYPES
-- ============================================================
CREATE TYPE user_role AS ENUM ('aicte_admin', 'institution_admin');
CREATE TYPE institution_type AS ENUM ('university', 'autonomous_college', 'affiliated_college', 'deemed_university', 'institute_of_national_importance', 'polytechnic');
CREATE TYPE approval_status AS ENUM ('active', 'suspended', 'pending_approval');
CREATE TYPE programme_status AS ENUM ('approved', 'under_review', 'discontinued');
CREATE TYPE apaar_verification_status AS ENUM ('verified', 'unverified', 'pending', 'invalid', 'unavailable');
CREATE TYPE enrolment_status AS ENUM ('active', 'transferred', 'withdrawn', 'graduated', 'suspended');
CREATE TYPE submission_status AS ENUM ('draft', 'validation_failed', 'submitted', 'under_review', 'approved', 'rejected', 'returned_for_correction');
CREATE TYPE batch_status AS ENUM ('draft', 'processing', 'validation_failed', 'validation_complete', 'submitted', 'under_review', 'approved', 'rejected', 'returned_for_correction');
CREATE TYPE admission_category AS ENUM ('general', 'sc', 'st', 'obc', 'ews', 'pwd', 'nri', 'oci', 'foreign_national', 'management_quota', 'other');
CREATE TYPE supernumerary_classification AS ENUM ('nri', 'oci', 'fn', 'pwd_extra', 'tuition_fee_waiver', 'kashmiri_migrants', 'none');
CREATE TYPE duplicate_review_status AS ENUM ('pending', 'reviewed', 'confirmed_duplicate', 'legitimate', 'dismissed');

-- ============================================================
-- TABLE: profiles (extends Supabase auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'institution_admin',
  institution_id UUID, -- NULL for AICTE admins; set for institution admins
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: institutions
-- ============================================================
CREATE TABLE IF NOT EXISTS institutions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  aicte_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type institution_type NOT NULL,
  approval_status approval_status NOT NULL DEFAULT 'pending_approval',
  address TEXT,
  state TEXT,
  district TEXT,
  city TEXT,
  pincode TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add FK from profiles to institutions
ALTER TABLE profiles
  ADD CONSTRAINT profiles_institution_fk
  FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE SET NULL;

-- ============================================================
-- TABLE: institution_memberships (tracks user<->institution access)
-- ============================================================
CREATE TABLE IF NOT EXISTS institution_memberships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES profiles(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (profile_id, institution_id)
);

-- ============================================================
-- TABLE: programmes
-- ============================================================
CREATE TABLE IF NOT EXISTS programmes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'UG', -- UG, PG, Diploma, PhD
  duration_years INTEGER NOT NULL DEFAULT 4 CHECK (duration_years > 0 AND duration_years <= 10),
  programme_status programme_status NOT NULL DEFAULT 'approved',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (institution_id, code)
);

-- ============================================================
-- TABLE: approved_intakes
-- AICTE-set intake limits per programme per academic year
-- Institutions CANNOT modify these records
-- ============================================================
CREATE TABLE IF NOT EXISTS approved_intakes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  programme_id UUID NOT NULL REFERENCES programmes(id) ON DELETE CASCADE,
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  academic_year TEXT NOT NULL CHECK (academic_year ~ '^\d{4}-\d{2}$'),
  approved_intake INTEGER NOT NULL CHECK (approved_intake >= 0),
  supernumerary_nri INTEGER NOT NULL DEFAULT 0 CHECK (supernumerary_nri >= 0),
  supernumerary_oci INTEGER NOT NULL DEFAULT 0 CHECK (supernumerary_oci >= 0),
  supernumerary_fn INTEGER NOT NULL DEFAULT 0 CHECK (supernumerary_fn >= 0),
  supernumerary_pwd INTEGER NOT NULL DEFAULT 0 CHECK (supernumerary_pwd >= 0),
  supernumerary_tfws INTEGER NOT NULL DEFAULT 0 CHECK (supernumerary_tfws >= 0), -- Tuition Fee Waiver
  supernumerary_km INTEGER NOT NULL DEFAULT 0 CHECK (supernumerary_km >= 0), -- Kashmiri Migrants
  total_supernumerary INTEGER GENERATED ALWAYS AS (
    supernumerary_nri + supernumerary_oci + supernumerary_fn + supernumerary_pwd + supernumerary_tfws + supernumerary_km
  ) STORED,
  approval_reference TEXT NOT NULL,
  approval_date DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revised', 'withdrawn')),
  set_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (programme_id, academic_year)
);

-- ============================================================
-- TABLE: students (identity records, separate from enrolments)
-- APAAR ID is treated as sensitive personal data
-- ============================================================
CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  apaar_id TEXT, -- 12-digit APAAR number; optional
  full_name TEXT NOT NULL,
  date_of_birth DATE,
  gender TEXT CHECK (gender IN ('male', 'female', 'other', 'prefer_not_to_say')),
  apaar_verification_status apaar_verification_status NOT NULL DEFAULT 'unverified',
  apaar_verified_at TIMESTAMPTZ,
  apaar_verification_source TEXT DEFAULT 'mock', -- 'mock' or 'apaar_official'
  apaar_verification_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial unique index: enforce uniqueness of APAAR IDs only where they exist
CREATE UNIQUE INDEX IF NOT EXISTS students_apaar_id_unique ON students(apaar_id) WHERE apaar_id IS NOT NULL AND apaar_id != '';

-- ============================================================
-- TABLE: submission_batches
-- ============================================================
CREATE TABLE IF NOT EXISTS submission_batches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  academic_year TEXT NOT NULL CHECK (academic_year ~ '^\d{4}-\d{2}$'),
  status batch_status NOT NULL DEFAULT 'draft',
  total_records INTEGER NOT NULL DEFAULT 0,
  valid_records INTEGER NOT NULL DEFAULT 0,
  error_records INTEGER NOT NULL DEFAULT 0,
  submitted_by UUID REFERENCES profiles(id),
  submitted_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  reviewer_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: enrolments
-- ============================================================
CREATE TABLE IF NOT EXISTS enrolments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  programme_id UUID NOT NULL REFERENCES programmes(id) ON DELETE RESTRICT,
  approved_intake_id UUID REFERENCES approved_intakes(id),
  batch_id UUID REFERENCES submission_batches(id),
  academic_year TEXT NOT NULL CHECK (academic_year ~ '^\d{4}-\d{2}$'),
  admission_date DATE NOT NULL,
  enrolment_status enrolment_status NOT NULL DEFAULT 'active',
  submission_status submission_status NOT NULL DEFAULT 'draft',
  admission_category admission_category NOT NULL DEFAULT 'general',
  is_nri BOOLEAN NOT NULL DEFAULT FALSE,
  is_oci BOOLEAN NOT NULL DEFAULT FALSE,
  is_foreign_national BOOLEAN NOT NULL DEFAULT FALSE,
  supernumerary_classification supernumerary_classification NOT NULL DEFAULT 'none',
  institution_student_id TEXT NOT NULL,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Idempotency: same student cannot be enrolled in same programme+year at same institution twice
  UNIQUE (institution_id, institution_student_id, academic_year),
  CONSTRAINT no_duplicate_enrolment UNIQUE (student_id, institution_id, programme_id, academic_year)
);

-- ============================================================
-- TABLE: submission_errors (row-level validation results)
-- ============================================================
CREATE TABLE IF NOT EXISTS submission_errors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id UUID NOT NULL REFERENCES submission_batches(id) ON DELETE CASCADE,
  row_number INTEGER,
  institution_student_id TEXT,
  error_type TEXT NOT NULL CHECK (error_type IN ('missing_field','invalid_format','duplicate','intake_exceeded','supernumerary_exceeded','invalid_status','consistency','apaar_invalid','other')),
  field_name TEXT,
  error_message TEXT NOT NULL,
  raw_data JSONB,
  is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: verification_events
-- Records every APAAR verification attempt (mock or official)
-- ============================================================
CREATE TABLE IF NOT EXISTS verification_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  apaar_id TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('format_check','mock_verification','api_verification')),
  outcome apaar_verification_status NOT NULL,
  provider TEXT NOT NULL DEFAULT 'mock' CHECK (provider IN ('mock','apaar_official')),
  is_simulated BOOLEAN NOT NULL DEFAULT TRUE,
  request_reference TEXT,
  response_data JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: duplicate_review_cases
-- ============================================================
CREATE TABLE IF NOT EXISTS duplicate_review_cases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id UUID REFERENCES submission_batches(id),
  student_id_1 UUID NOT NULL REFERENCES students(id),
  student_id_2 UUID NOT NULL REFERENCES students(id),
  enrolment_id_1 UUID REFERENCES enrolments(id),
  enrolment_id_2 UUID REFERENCES enrolments(id),
  detection_reason TEXT NOT NULL,
  review_status duplicate_review_status NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  reviewer_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (student_id_1 != student_id_2)
);

-- ============================================================
-- TABLE: audit_logs (append-only; no UPDATE/DELETE by users)
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id UUID,
  actor_email TEXT,
  actor_role user_role,
  institution_id UUID,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_enrolments_institution ON enrolments(institution_id);
CREATE INDEX IF NOT EXISTS idx_enrolments_student ON enrolments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrolments_programme ON enrolments(programme_id);
CREATE INDEX IF NOT EXISTS idx_enrolments_batch ON enrolments(batch_id);
CREATE INDEX IF NOT EXISTS idx_enrolments_academic_year ON enrolments(academic_year);
CREATE INDEX IF NOT EXISTS idx_programmes_institution ON programmes(institution_id);
CREATE INDEX IF NOT EXISTS idx_batches_institution ON submission_batches(institution_id);
CREATE INDEX IF NOT EXISTS idx_batches_status ON submission_batches(status);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_students_name_trgm ON students USING gin(full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_dup_review_status ON duplicate_review_cases(review_status);

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','institutions','programmes','approved_intakes','students','enrolments','submission_batches']
  LOOP
    EXECUTE format('CREATE OR REPLACE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at()', t);
  END LOOP;
END; $$;

-- ============================================================
-- AUTO-CREATE PROFILE ON SIGNUP (Supabase Auth trigger)
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'institution_admin')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS on all sensitive tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE programmes ENABLE ROW LEVEL SECURITY;
ALTER TABLE approved_intakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrolments ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE duplicate_review_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper function: get current user's role
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS user_role LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

-- Helper function: get current user's institution_id
CREATE OR REPLACE FUNCTION current_user_institution_id()
RETURNS UUID LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT institution_id FROM profiles WHERE id = auth.uid();
$$;

-- PROFILES policies
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "AICTE admins can view all profiles" ON profiles FOR SELECT USING (current_user_role() = 'aicte_admin');
CREATE POLICY "AICTE admins can manage profiles" ON profiles FOR ALL USING (current_user_role() = 'aicte_admin');

-- INSTITUTIONS policies
CREATE POLICY "AICTE admins: full access to institutions" ON institutions FOR ALL USING (current_user_role() = 'aicte_admin');
CREATE POLICY "Institution admins: read own institution" ON institutions FOR SELECT USING (id = current_user_institution_id());

-- PROGRAMMES policies
CREATE POLICY "AICTE admins: full access to programmes" ON programmes FOR ALL USING (current_user_role() = 'aicte_admin');
CREATE POLICY "Institution admins: read own programmes" ON programmes FOR SELECT USING (institution_id = current_user_institution_id());

-- APPROVED INTAKES policies (institutions cannot write!)
CREATE POLICY "AICTE admins: full access to approved_intakes" ON approved_intakes FOR ALL USING (current_user_role() = 'aicte_admin');
CREATE POLICY "Institution admins: read own approved_intakes" ON approved_intakes FOR SELECT USING (institution_id = current_user_institution_id());

-- STUDENTS policies
CREATE POLICY "AICTE admins: read all students" ON students FOR SELECT USING (current_user_role() = 'aicte_admin');
CREATE POLICY "Institution admins: read students in own enrolments" ON students FOR SELECT USING (
  EXISTS (SELECT 1 FROM enrolments e WHERE e.student_id = students.id AND e.institution_id = current_user_institution_id())
);
CREATE POLICY "Institution admins: insert students" ON students FOR INSERT WITH CHECK (current_user_role() = 'institution_admin');
CREATE POLICY "Institution admins: update students (limited)" ON students FOR UPDATE USING (
  EXISTS (SELECT 1 FROM enrolments e WHERE e.student_id = students.id AND e.institution_id = current_user_institution_id())
) WITH CHECK (current_user_role() = 'institution_admin');

-- ENROLMENTS policies
CREATE POLICY "AICTE admins: full access to enrolments" ON enrolments FOR ALL USING (current_user_role() = 'aicte_admin');
CREATE POLICY "Institution admins: read own institution enrolments" ON enrolments FOR SELECT USING (institution_id = current_user_institution_id());
CREATE POLICY "Institution admins: insert own institution enrolments" ON enrolments FOR INSERT WITH CHECK (institution_id = current_user_institution_id());
CREATE POLICY "Institution admins: update own draft/failed enrolments" ON enrolments FOR UPDATE
  USING (institution_id = current_user_institution_id() AND submission_status IN ('draft', 'validation_failed', 'returned_for_correction'))
  WITH CHECK (
    institution_id = current_user_institution_id() AND
    -- Institutions cannot approve their own submissions
    submission_status NOT IN ('approved')
  );

-- SUBMISSION BATCHES policies
CREATE POLICY "AICTE admins: full access to batches" ON submission_batches FOR ALL USING (current_user_role() = 'aicte_admin');
CREATE POLICY "Institution admins: access own batches" ON submission_batches FOR SELECT USING (institution_id = current_user_institution_id());
CREATE POLICY "Institution admins: create own batches" ON submission_batches FOR INSERT WITH CHECK (institution_id = current_user_institution_id());
CREATE POLICY "Institution admins: update own draft batches" ON submission_batches FOR UPDATE
  USING (institution_id = current_user_institution_id() AND status IN ('draft', 'validation_failed', 'returned_for_correction'))
  WITH CHECK (institution_id = current_user_institution_id() AND status NOT IN ('approved', 'rejected'));

-- SUBMISSION ERRORS policies
CREATE POLICY "AICTE admins: read all errors" ON submission_errors FOR SELECT USING (current_user_role() = 'aicte_admin');
CREATE POLICY "Institution admins: read own batch errors" ON submission_errors FOR SELECT USING (
  EXISTS (SELECT 1 FROM submission_batches b WHERE b.id = submission_errors.batch_id AND b.institution_id = current_user_institution_id())
);
CREATE POLICY "Institution admins: insert own batch errors" ON submission_errors FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM submission_batches b WHERE b.id = submission_errors.batch_id AND b.institution_id = current_user_institution_id())
);

-- VERIFICATION EVENTS policies
CREATE POLICY "AICTE admins: read all verification events" ON verification_events FOR SELECT USING (current_user_role() = 'aicte_admin');
CREATE POLICY "Institution admins: read own verification events" ON verification_events FOR SELECT USING (
  EXISTS (SELECT 1 FROM enrolments e WHERE e.student_id = verification_events.student_id AND e.institution_id = current_user_institution_id())
);
CREATE POLICY "Authenticated users: insert verification events" ON verification_events FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- DUPLICATE REVIEW CASES policies
CREATE POLICY "AICTE admins: full access to duplicates" ON duplicate_review_cases FOR ALL USING (current_user_role() = 'aicte_admin');

-- AUDIT LOGS policies (READ-ONLY for all; insert via server/trigger only)
CREATE POLICY "AICTE admins: read all audit logs" ON audit_logs FOR SELECT USING (current_user_role() = 'aicte_admin');
CREATE POLICY "Authenticated: insert audit logs" ON audit_logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
-- No UPDATE or DELETE policies for audit_logs (append-only enforcement)

-- INSTITUTION MEMBERSHIPS
CREATE POLICY "AICTE admins: full access to memberships" ON institution_memberships FOR ALL USING (current_user_role() = 'aicte_admin');
CREATE POLICY "Users: read own memberships" ON institution_memberships FOR SELECT USING (profile_id = auth.uid());

-- ============================================================
-- SYNTHETIC DEMO SEED DATA
-- This is clearly identified demonstration data only.
-- All APAAR IDs, institution names, and persons are fictional.
-- ============================================================

-- Demo institutions
INSERT INTO institutions (id, aicte_id, name, type, approval_status, state, city)
VALUES
  ('11111111-1111-1111-1111-111111111111', '1-SRIT2024', 'Shri Ram Institute of Technology (DEMO)', 'autonomous_college', 'active', 'Maharashtra', 'Mumbai'),
  ('22222222-2222-2222-2222-222222222222', '1-NTU2024', 'National Technical University (DEMO)', 'university', 'active', 'Delhi', 'New Delhi'),
  ('33333333-3333-3333-3333-333333333333', '1-REC2024', 'Regional Engineering College (DEMO)', 'affiliated_college', 'pending_approval', 'Tamil Nadu', 'Chennai')
ON CONFLICT (aicte_id) DO NOTHING;

-- Demo programmes
INSERT INTO programmes (id, institution_id, name, code, level, duration_years, programme_status)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'B.Tech Computer Science (DEMO)', 'BTECH-CS', 'UG', 4, 'approved'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'Master of Business Administration (DEMO)', 'MBA', 'PG', 2, 'approved'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '22222222-2222-2222-2222-222222222222', 'B.Tech Computer Science (DEMO)', 'BTECH-CS', 'UG', 4, 'approved'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', '33333333-3333-3333-3333-333333333333', 'B.Tech Electronics (DEMO)', 'BTECH-EC', 'UG', 4, 'approved')
ON CONFLICT (institution_id, code) DO NOTHING;

-- Demo approved intakes
INSERT INTO approved_intakes (programme_id, institution_id, academic_year, approved_intake, supernumerary_nri, supernumerary_oci, supernumerary_fn, supernumerary_pwd, supernumerary_tfws, supernumerary_km, approval_reference, status)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', '2024-25', 120, 3, 2, 1, 2, 2, 2, 'AICTE/DEMO/2024/001', 'active'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', '2024-25', 60, 2, 1, 0, 1, 1, 1, 'AICTE/DEMO/2024/002', 'active'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '22222222-2222-2222-2222-222222222222', '2024-25', 240, 6, 3, 2, 3, 3, 3, 'AICTE/DEMO/2024/003', 'active'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', '33333333-3333-3333-3333-333333333333', '2024-25', 60, 2, 1, 0, 1, 1, 1, 'AICTE/DEMO/2024/004', 'active')
ON CONFLICT (programme_id, academic_year) DO NOTHING;
