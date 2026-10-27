// ============================================================
// AICTE-APAAR Platform - Core Type Definitions
// ============================================================

export type UserRole = 'aicte_admin' | 'institution_admin';

export type ApprovalStatus = 'active' | 'suspended' | 'pending_approval';
export type InstitutionType = 'university' | 'autonomous_college' | 'affiliated_college' | 'deemed_university' | 'institute_of_national_importance' | 'polytechnic';

export type ProgrammeStatus = 'approved' | 'under_review' | 'discontinued';

export type APAARVerificationStatus = 'verified' | 'unverified' | 'pending' | 'invalid' | 'unavailable';

export type EnrolmentStatus = 'active' | 'transferred' | 'withdrawn' | 'graduated' | 'suspended';
export type SubmissionStatus = 'draft' | 'validation_failed' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'returned_for_correction';
export type BatchStatus = 'draft' | 'processing' | 'validation_complete' | 'validation_failed' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'returned_for_correction';

export type AdmissionCategory = 'general' | 'sc' | 'st' | 'obc' | 'ews' | 'pwd' | 'nri' | 'oci' | 'foreign_national' | 'management_quota' | 'other';
export type SupernumeraryClassification = 'nri' | 'oci' | 'fn' | 'pwd_extra' | 'tuition_fee_waiver' | 'kashmiri_migrants' | 'none';

export type DuplicateReviewStatus = 'pending' | 'reviewed' | 'confirmed_duplicate' | 'legitimate' | 'dismissed';

export type DuplicateCaseType =
  | 'cross_institution_duplicate'
  | 'demographic_divergence'
  | 'missing_apaar'
  | 'invalid_apaar'
  | 'dual_submission';

export type CaseSeverity = 'high' | 'medium' | 'low';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  institution_id?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Institution {
  id: string;
  aicte_id: string;
  name: string;
  type: InstitutionType;
  approval_status: ApprovalStatus;
  address?: string;
  state?: string;
  district?: string;
  city?: string;
  pincode?: string;
  phone?: string;
  email?: string;
  website?: string;
  created_at: string;
  updated_at: string;
}

export interface Programme {
  id: string;
  institution_id: string;
  name: string;
  code: string;
  level: string;
  duration_years: number;
  programme_status: ProgrammeStatus;
  created_at: string;
  updated_at: string;
  institution?: Institution;
}

export interface ApprovedIntake {
  id: string;
  programme_id: string;
  institution_id: string;
  academic_year: string;
  approved_intake: number;
  supernumerary_nri: number;
  supernumerary_oci: number;
  supernumerary_fn: number;
  supernumerary_pwd: number;
  supernumerary_tfws: number;
  supernumerary_km: number;
  total_supernumerary: number;
  approval_reference: string;
  approval_date?: string;
  status: 'active' | 'revised' | 'withdrawn';
  created_at: string;
  updated_at: string;
  programme?: Programme;
  institution?: Institution;
}

export interface Student {
  id: string;
  apaar_id?: string;
  full_name: string;
  date_of_birth?: string;
  gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  apaar_verification_status: APAARVerificationStatus;
  apaar_verified_at?: string;
  apaar_verification_source?: string;
  apaar_verification_note?: string;
  created_at: string;
  updated_at: string;
}

export interface Enrolment {
  id: string;
  student_id: string;
  institution_id: string;
  programme_id: string;
  approved_intake_id?: string;
  academic_year: string;
  admission_date: string;
  enrolment_status: EnrolmentStatus;
  submission_status: SubmissionStatus;
  admission_category: AdmissionCategory;
  is_nri: boolean;
  is_oci: boolean;
  is_foreign_national: boolean;
  supernumerary_classification: SupernumeraryClassification;
  institution_student_id: string;
  batch_id?: string;
  remarks?: string;
  created_at: string;
  updated_at: string;
  student?: Student;
  institution?: Institution;
  programme?: Programme;
  approved_intake?: ApprovedIntake;
}

export interface SubmissionBatch {
  id: string;
  institution_id: string;
  academic_year: string;
  status: BatchStatus;
  total_records: number;
  valid_records: number;
  error_records: number;
  submitted_at?: string;
  reviewed_at?: string;
  reviewed_by?: string;
  reviewer_notes?: string;
  created_at: string;
  updated_at: string;
  institution?: Institution;
}

export interface SubmissionError {
  id: string;
  batch_id: string;
  row_number?: number;
  institution_student_id?: string;
  error_type: 'missing_field' | 'invalid_format' | 'duplicate' | 'intake_exceeded' | 'supernumerary_exceeded' | 'invalid_status' | 'consistency' | 'apaar_invalid' | 'other';
  field_name?: string;
  error_message: string;
  raw_data?: Record<string, string>;
  is_resolved: boolean;
  created_at: string;
}

export interface VerificationEvent {
  id: string;
  student_id: string;
  apaar_id?: string;
  event_type: 'format_check' | 'mock_verification' | 'api_verification';
  outcome: 'valid' | 'invalid' | 'pending' | 'unavailable';
  provider: 'mock' | 'apaar_official';
  is_simulated: boolean;
  request_reference?: string;
  response_data?: Record<string, unknown>;
  notes?: string;
  created_at: string;
}

export interface DuplicateReviewCase {
  id: string;
  batch_id?: string;
  student_id_1: string;
  student_id_2?: string;
  enrolment_id_1?: string;
  enrolment_id_2?: string;
  case_type?: DuplicateCaseType;
  severity?: CaseSeverity;
  detection_reason: string;
  review_status: DuplicateReviewStatus;
  reviewed_by?: string;
  reviewed_at?: string;
  reviewer_notes?: string;
  created_at: string;
  student_1?: Student;
  student_2?: Student;
  enrolment_1?: Enrolment;
  enrolment_2?: Enrolment;
  verification_source?: string;
  verification_status?: string;
  verification_timestamp?: string;
  evidence_summary?: string;
}

export interface AuditLog {
  id: string;
  actor_id?: string;
  actor_email?: string;
  actor_role?: UserRole;
  institution_id?: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  old_values?: Record<string, unknown>;
  new_values?: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

// ============================================================
// CSV Upload Types
// ============================================================
export interface CSVRow {
  row_number: number;
  institution_student_id: string;
  full_name: string;
  apaar_id?: string;
  date_of_birth?: string;
  gender?: string;
  programme_code: string;
  academic_year: string;
  admission_date: string;
  admission_category: string;
  is_nri?: string;
  is_oci?: string;
  is_foreign_national?: string;
  supernumerary_classification?: string;
  remarks?: string;
  [key: string]: string | number | undefined;
}

export interface ValidationResult {
  row_number: number;
  institution_student_id: string;
  is_valid: boolean;
  errors: RowError[];
  warnings: RowWarning[];
  data: CSVRow;
}

export interface RowError {
  field: string;
  message: string;
  type: SubmissionError['error_type'];
}

export interface RowWarning {
  field: string;
  message: string;
}

// ============================================================
// Dashboard / Stats Types
// ============================================================
export interface DashboardStats {
  total_institutions: number;
  total_enrolments: number;
  approved_enrolments: number;
  pending_submissions: number;
  apaar_verified: number;
  apaar_missing: number;
  potential_duplicates: number;
  intake_exceptions: number;
}

export interface IntakeUtilization {
  programme_name: string;
  institution_name: string;
  approved_intake: number;
  actual_enrolments: number;
  supernumerary_used: number;
  utilization_pct: number;
}

// ============================================================
// Auth Context
// ============================================================
export interface AuthUser {
  id: string;
  email: string;
  profile: Profile;
}

// ============================================================
// P0-1 Batch Enrolment Persistence RPC Types
// ============================================================

export interface BatchEnrolmentRecordInput {
  row_number: number;
  institution_student_id: string;
  full_name: string;
  programme_code: string;
  academic_year: string;
  admission_date: string;
  admission_category: AdmissionCategory;
  is_nri?: boolean;
  is_oci?: boolean;
  is_foreign_national?: boolean;
  supernumerary_classification?: SupernumeraryClassification;
  apaar_id?: string;
  date_of_birth?: string;
  gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  remarks?: string;
}

export type RowPersistenceStatus = 'accepted' | 'rejected' | 'duplicate';

export interface BatchEnrolmentRowResult {
  row_number: number;
  institution_student_id: string;
  status: RowPersistenceStatus;
  student_id?: string;
  enrolment_id?: string;
  error_type?: SubmissionError['error_type'];
  error_message?: string;
}

export interface BatchEnrolmentResponse {
  success: boolean;
  batch_id: string;
  total_records: number;
  accepted_records: number;
  rejected_records: number;
  duplicate_records: number;
  batch_status: BatchStatus;
  row_results: BatchEnrolmentRowResult[];
  message: string;
}



// =============================================================================
// Institution Correction Request & Resolution Workflow Types
// =============================================================================

export type CorrectionCategory =
  | 'apaar_data_entry_error' | 'apaar_entry_error'
  | 'missing_apaar'
  | 'invalid_apaar_format'
  | 'demographic_review'
  | 'enrolment_data_correction'
  | 'supporting_info_required'
  | 'other';

export type CorrectionRequestPriority = 'high' | 'medium' | 'low';

export type CorrectionRequestStatus =
  | 'open'
  | 'awaiting_institution'
  | 'submitted_for_review'
  | 'resolved'
  | 'returned_for_correction'
  | 'closed';

export interface CorrectionResponseHistory {
  id: string;
  actor_email: string;
  actor_role: UserRole;
  action:
    | 'created'
    | 'responded'
    | 'submitted_for_review'
    | 'returned_for_correction'
    | 'resolved'
    | 'closed';
  comment: string;
  proposed_changes?: {
    apaar_id?: string;
    full_name?: string;
    admission_category?: AdmissionCategory;
    [key: string]: any;
  };
  created_at: string;
}

export interface CorrectionRequest {
  id: string;
  institution_id: string;
  enrolment_id: string;
  student_id: string;
  case_id?: string;
  batch_id?: string;
  category: CorrectionCategory;
  issue_description: string;
  requested_fields: string[];
  priority: CorrectionRequestPriority;
  status: CorrectionRequestStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
  resolved_at?: string;
  resolved_by?: string;
  resolution_notes?: string;
  institution_response?: string;
  proposed_changes?: {
    apaar_id?: string;
    full_name?: string;
    admission_category?: AdmissionCategory;
    [key: string]: any;
  };
  history: CorrectionResponseHistory[];

  // Populated relationships for display
  enrolment?: Enrolment;
  student?: Student;
  institution?: Institution;
}

export interface CreateCorrectionRequestInput {
  enrolment_id: string;
  category: CorrectionCategory;
  issue_description: string;
  requested_fields: string[];
  priority?: CorrectionRequestPriority;
  case_id?: string;
  batch_id?: string;
}

// =============================================================================
// AICTE-to-Institution Communication & Response Workflow Types
// =============================================================================

export type InboxItemType =
  | 'submission_decision'
  | 'duplicate_adjudication'
  | 'intake_inquiry'
  | 'correction_request';

export type InboxItemStatus =
  | 'awaiting_action'
  | 'responded'
  | 'under_review'
  | 'completed';

export interface InstitutionInboxItem {
  id: string;
  institution_id: string;
  type: InboxItemType;
  title: string;
  reference_id: string;
  reference_type: 'batch' | 'duplicate_case' | 'intake_exception' | 'correction_request' | 'system';
  status: InboxItemStatus;
  is_read: boolean;
  aicte_message: string;
  deadline?: string;
  date: string;
  metadata: {
    batch_id?: string;
    case_id?: string;
    exception_id?: string;
    correction_id?: string;
    enrolment_id?: string;
    category?: string;
    priority?: string;
    decision?: string;
    programme?: string;
    academic_year?: string;
    approved_intake?: number;
    actual_enrolled?: number;
    excess?: number;
    student_id?: string;
    student_name?: string;
    masked_student_name?: string;
    requested_fields?: string[];
    proposed_changes?: any;
    next_action?: string;
    [key: string]: any;
  };
  institution_response?: string;
  responded_at?: string;
  responded_by?: string;
  created_at: string;
  updated_at: string;
  institution?: Institution;
}

export interface IntakeException {
  id: string;
  institution_id: string;
  institution: string;
  programme: string;
  programme_code?: string;
  academic_year: string;
  approved_intake: number;
  enrolled?: number;
  supernumerary_capacity?: number;
  supernumerary_enrolled?: number;
  excess: number;
  type: 'regular_overflow' | 'supernumerary_overflow';
  status:
    | 'pending_review'
    | 'explanation_requested'
    | 'explanation_submitted'
    | 'resolved'
    | 'rejected'
    | 'approved'
    | 'awaiting_institution';
  detection_note: string;
  inquiry_text?: string;
  inquiry_deadline?: string;
  deadline?: string;
  inquiry_sent_at?: string;
  institution_response?: string;
  institution_explanation?: string;
  responded_at?: string;
  responded_by?: string;
  explanation_submitted_at?: string;
  resolution?: string;
  resolved_at?: string;
  resolved_by?: string;
  reviewed_at?: string;
  reviewed_by?: string;
  updated_at?: string;
}
