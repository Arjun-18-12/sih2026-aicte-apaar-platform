-- =============================================================================
-- Migration: 003_institution_communications_and_inbox.sql
-- Description: AICTE-to-Institution Communication & Response Workflow
-- Additive schema: Creates institution_inbox_items and intake_exceptions tables
-- with Row Level Security (RLS) enforcement.
-- =============================================================================

-- 1. Table: institution_inbox_items
CREATE TABLE IF NOT EXISTS public.institution_inbox_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('submission_decision', 'duplicate_adjudication', 'intake_inquiry', 'correction_request')),
  title TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  reference_type TEXT NOT NULL CHECK (reference_type IN ('batch', 'duplicate_case', 'intake_exception', 'correction_request', 'system')),
  status TEXT NOT NULL DEFAULT 'awaiting_action' CHECK (status IN ('awaiting_action', 'responded', 'under_review', 'completed')),
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  aicte_message TEXT NOT NULL,
  response_deadline TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  institution_response TEXT,
  responded_at TIMESTAMPTZ,
  responded_by UUID REFERENCES public.profiles(id),
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_inbox_inst_status ON public.institution_inbox_items(institution_id, status);
CREATE INDEX IF NOT EXISTS idx_inbox_created ON public.institution_inbox_items(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_ref ON public.institution_inbox_items(reference_type, reference_id);

-- 2. Table: intake_exceptions (persisting intake capacity exceptions & explanations)
CREATE TABLE IF NOT EXISTS public.intake_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  programme_id UUID REFERENCES public.programmes(id) ON DELETE SET NULL,
  academic_year TEXT NOT NULL,
  approved_intake INTEGER NOT NULL,
  enrolled INTEGER NOT NULL,
  excess INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('regular_overflow', 'supernumerary_overflow')),
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'explanation_requested', 'awaiting_institution', 'explanation_submitted', 'resolved', 'approved', 'rejected')),
  detection_note TEXT NOT NULL,
  inquiry_text TEXT,
  deadline TIMESTAMPTZ,
  inquiry_sent_at TIMESTAMPTZ,
  institution_explanation TEXT,
  explanation_submitted_at TIMESTAMPTZ,
  resolution TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_intake_exc_inst ON public.intake_exceptions(institution_id, status);

-- 3. Row Level Security (RLS)
ALTER TABLE public.institution_inbox_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intake_exceptions ENABLE ROW LEVEL SECURITY;

-- Inbox Policies:
-- AICTE administrators: Full read and management access
CREATE POLICY "AICTE admins: full access to inbox items"
  ON public.institution_inbox_items
  FOR ALL
  USING (public.current_user_role() = 'aicte_admin');

-- Institution administrators: Can ONLY view inbox items addressed to their institution
CREATE POLICY "Institution admins: read own institution inbox items"
  ON public.institution_inbox_items
  FOR SELECT
  USING (institution_id = public.current_user_institution_id());

-- Institution administrators: Can ONLY submit responses for their own items
CREATE POLICY "Institution admins: submit response for own institution items"
  ON public.institution_inbox_items
  FOR UPDATE
  USING (institution_id = public.current_user_institution_id())
  WITH CHECK (institution_id = public.current_user_institution_id());

-- Intake Exceptions Policies:
CREATE POLICY "AICTE admins: full access to intake exceptions"
  ON public.intake_exceptions
  FOR ALL
  USING (public.current_user_role() = 'aicte_admin');

CREATE POLICY "Institution admins: read own intake exceptions"
  ON public.intake_exceptions
  FOR SELECT
  USING (institution_id = public.current_user_institution_id());

CREATE POLICY "Institution admins: submit explanation for own intake exceptions"
  ON public.intake_exceptions
  FOR UPDATE
  USING (institution_id = public.current_user_institution_id())
  WITH CHECK (institution_id = public.current_user_institution_id());

-- 4. Triggers for updated_at
CREATE TRIGGER set_inbox_updated_at
  BEFORE UPDATE ON public.institution_inbox_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_intake_exc_updated_at
  BEFORE UPDATE ON public.intake_exceptions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();
