/**
 * AICTE-APAAR Platform - Centralized Local Synthetic Demo Store (v2)
 *
 * Provides a self-contained, in-memory + localStorage persistence layer for the
 * expanded local demo environment:
 * - 12 Fictional Institutions across 12 Indian states
 * - 42 Approved Programmes with 2024-25 intake allocations
 * - 1,500 Synthetic Students with simulated APAAR statuses
 * - 1,200 Distributed Enrolments
 * - 44 Submission Batches (approved, submitted, returned, draft)
 * - 42 Duplicate Review Cases with complete adjudication workflow
 * - 40 Submission Errors
 * - 55 Synthetic Audit Logs
 *
 * Safe migration: Preserves any user-created demo batches/enrolments from v1.
 * Guaranteed zero live Supabase RPC calls or database writes in demo mode.
 */

import type {
  Institution,
  Programme,
  ApprovedIntake,
  Student,
  Enrolment,
  SubmissionBatch,
  DuplicateReviewCase,
  SubmissionError,
  AuditLog,
  BatchStatus,
  DuplicateReviewStatus,
  BatchEnrolmentRecordInput,
  BatchEnrolmentResponse,
  BatchEnrolmentRowResult,
  CorrectionRequest,
  CorrectionCategory,
  CorrectionRequestStatus,
  CorrectionRequestPriority,
  CreateCorrectionRequestInput,
  InstitutionInboxItem,
  InboxItemType,
  InboxItemStatus,
  IntakeException,
} from '../types';

import { generateDeterministicDemoDataset } from './demoDatasetGenerator';

export const DEMO_INSTITUTION_ID = '11111111-1111-1111-1111-111111111111'; // Shri Ram Institute of Technology (DEMO)
export const DEMO_STORE_KEY = 'aicte_synthetic_demo_store_v2';
export const PREVIOUS_DEMO_STORE_KEY = 'aicte_synthetic_demo_store_v1';

export interface DemoStoreState {
  institutions: Institution[];
  programmes: Programme[];
  intakes: ApprovedIntake[];
  batches: SubmissionBatch[];
  enrolments: Enrolment[];
  students: Student[];
  duplicateCases: DuplicateReviewCase[];
  submissionErrors: SubmissionError[];
  auditLogs: AuditLog[];
  correctionRequests: CorrectionRequest[];
  inboxItems: InstitutionInboxItem[];
  intakeExceptions: IntakeException[];
}



function maskSensitiveApaar(val?: string): string {
  if (!val) return '';
  const clean = String(val).replace(/\s+/g, '');
  if (clean.length <= 4) return '****';
  return 'X'.repeat(clean.length - 4) + clean.slice(-4);
}

function getInitialCanonicalCorrectionRequests(institutions: Institution[], enrolments: Enrolment[], students: Student[]): CorrectionRequest[] {
  const sritId = '11111111-1111-1111-1111-111111111111';
  const ntuId = '11111111-1111-1111-1111-000000000002';

  const sritEnrs = enrolments.filter(e => e.institution_id === sritId);
  const ntuEnrs = enrolments.filter(e => e.institution_id === ntuId);

  const e1 = sritEnrs[2] || enrolments[2];
  const e2 = sritEnrs[4] || enrolments[4];
  const e3 = ntuEnrs.find(e => e.student_id === 'std-000144') || ntuEnrs[0] || enrolments[0];
  const e4 = sritEnrs[1] || enrolments[1];

  return [
    {
      id: 'cr-0001',
      institution_id: sritId,
      enrolment_id: e1.id,
      student_id: e1.student_id,
      category: 'missing_apaar',
      issue_description: 'APAAR ID is missing from admission record for MBA 2024-25. Please obtain candidate consent and supply verified 12-digit APAAR ID.',
      requested_fields: ['apaar_id'],
      priority: 'high',
      status: 'awaiting_institution',
      created_by: 'aicte.admin@demo.aicte.gov.in',
      created_at: '2024-09-05T10:00:00Z',
      updated_at: '2024-09-05T10:00:00Z',
      history: [
        {
          id: 'hist-001',
          actor_email: 'aicte.admin@demo.aicte.gov.in',
          actor_role: 'aicte_admin',
          action: 'created',
          comment: 'Correction request initiated by AICTE council review.',
          created_at: '2024-09-05T10:00:00Z',
        },
      ],
    },
    {
      id: 'cr-0002',
      institution_id: sritId,
      enrolment_id: e2.id,
      student_id: e2.student_id,
      category: 'invalid_apaar_format',
      issue_description: 'Provided APAAR ID failed 12-digit numeric validation check. Potential typographical transposition error.',
      requested_fields: ['apaar_id'],
      priority: 'medium',
      status: 'submitted_for_review',
      created_by: 'aicte.admin@demo.aicte.gov.in',
      created_at: '2024-09-08T11:00:00Z',
      updated_at: '2024-09-10T14:30:00Z',
      institution_response: 'Verified against original candidate Aadhaar/DigiLocker document. Corrected 12-digit APAAR ID supplied.',
      proposed_changes: {
        apaar_id: '999900000005',
      },
      history: [
        {
          id: 'hist-002a',
          actor_email: 'aicte.admin@demo.aicte.gov.in',
          actor_role: 'aicte_admin',
          action: 'created',
          comment: 'AICTE flagged invalid format.',
          created_at: '2024-09-08T11:00:00Z',
        },
        {
          id: 'hist-002b',
          actor_email: 'principal@srit.ac.in',
          actor_role: 'institution_admin',
          action: 'submitted_for_review',
          comment: 'Verified against original candidate document. Corrected 12-digit APAAR ID supplied.',
          proposed_changes: { apaar_id: '999900000005' },
          created_at: '2024-09-10T14:30:00Z',
        },
      ],
    },
    {
      id: 'cr-0003',
      institution_id: ntuId,
      enrolment_id: e3.id,
      student_id: e3.student_id,
      case_id: 'd3',
      category: 'missing_apaar',
      issue_description: 'Case d3: Admission enrolment record for Siddharth Bhattacharya has no APAAR identifier. AICTE review requires institution to collect and verify APAAR ID.',
      requested_fields: ['apaar_id'],
      priority: 'high',
      status: 'awaiting_institution',
      created_by: 'aicte.admin@demo.aicte.gov.in',
      created_at: '2024-09-06T15:00:00Z',
      updated_at: '2024-09-06T15:00:00Z',
      history: [
        {
          id: 'hist-003',
          actor_email: 'aicte.admin@demo.aicte.gov.in',
          actor_role: 'aicte_admin',
          action: 'created',
          comment: 'Generated from Case d3 investigation.',
          created_at: '2024-09-06T15:00:00Z',
        },
      ],
    },
    {
      id: 'cr-0004',
      institution_id: sritId,
      enrolment_id: e4.id,
      student_id: e4.student_id,
      case_id: 'd2',
      category: 'demographic_review',
      issue_description: 'Candidate middle initial differs between admission application and APAAR registry.',
      requested_fields: ['full_name'],
      priority: 'low',
      status: 'resolved',
      created_by: 'aicte.admin@demo.aicte.gov.in',
      created_at: '2024-09-01T09:00:00Z',
      updated_at: '2024-09-04T12:00:00Z',
      institution_response: 'Institution examined 10th standard certificate and verified full legal name.',
      resolved_by: 'aicte.admin@demo.aicte.gov.in',
      resolved_at: '2024-09-04T12:00:00Z',
      resolution_notes: 'Reviewed certificate; demographic variance accepted under AICTE guidelines.',
      history: [
        {
          id: 'hist-004a',
          actor_email: 'aicte.admin@demo.aicte.gov.in',
          actor_role: 'aicte_admin',
          action: 'created',
          comment: 'AICTE initiated demographic verification.',
          created_at: '2024-09-01T09:00:00Z',
        },
        {
          id: 'hist-004b',
          actor_email: 'principal@srit.ac.in',
          actor_role: 'institution_admin',
          action: 'submitted_for_review',
          comment: 'Examined secondary school certificate.',
          created_at: '2024-09-03T10:00:00Z',
        },
        {
          id: 'hist-004c',
          actor_email: 'aicte.admin@demo.aicte.gov.in',
          actor_role: 'aicte_admin',
          action: 'resolved',
          comment: 'Accepted after review of institutional response.',
          created_at: '2024-09-04T12:00:00Z',
        },
      ],
    },
  ];
}


function getInitialCanonicalIntakeExceptions(institutions: Institution[], programmes: Programme[]): IntakeException[] {
  const srit = institutions.find(i => i.id === DEMO_INSTITUTION_ID) || institutions[0];
  const ntu = institutions.find(i => i.id === '11111111-1111-1111-1111-000000000002') || institutions[1];
  const rec = institutions.find(i => i.id === '11111111-1111-1111-1111-000000000003') || institutions[2];

  return [
    {
      id: 'ex-reg-1',
      institution_id: ntu.id,
      institution: ntu.name,
      programme: 'B.Tech Computer Science and Engineering',
      programme_code: 'BTECH-CS',
      academic_year: '2024-25',
      approved_intake: 240,
      enrolled: 243,
      excess: 3,
      type: 'regular_overflow',
      status: 'pending_review',
      detection_note: '3 students enrolled beyond approved regular intake quota of 240 for B.Tech CS. Flagged for AICTE council review.',
    },
    {
      id: 'ex-sup-1',
      institution_id: srit.id,
      institution: srit.name,
      programme: 'Master of Business Administration',
      programme_code: 'MBA',
      academic_year: '2024-25',
      approved_intake: 60,
      supernumerary_capacity: 6,
      supernumerary_enrolled: 8,
      excess: 2,
      type: 'supernumerary_overflow',
      status: 'pending_review',
      detection_note: '2 students exceed the approved supernumerary capacity of 6 for MBA 2024-25. Flagged for AICTE council review.',
    },
    {
      id: 'ex-reg-2',
      institution_id: rec.id,
      institution: rec.name,
      programme: 'B.Tech Electronics & Communication',
      programme_code: 'BTECH-EC',
      academic_year: '2023-24',
      approved_intake: 60,
      enrolled: 61,
      excess: 1,
      type: 'regular_overflow',
      status: 'resolved',
      detection_note: '1 student enrolled beyond approved intake of 60.',
      resolution: 'AICTE approved 1 additional seat under special dispensation (Reference: AICTE/SP/2023/1234).',
    },
  ];
}

function getInitialCanonicalInboxItems(
  institutions: Institution[],
  intakeExceptions: IntakeException[]
): InstitutionInboxItem[] {
  const srit = institutions.find(i => i.id === DEMO_INSTITUTION_ID) || institutions[0];
  const ntu = institutions.find(i => i.id === '11111111-1111-1111-1111-000000000002') || institutions[1];

  return [
    {
      id: 'inbox-001',
      institution_id: srit.id,
      type: 'submission_decision',
      title: 'Submission Batch b3 Returned for Correction',
      reference_id: 'b3',
      reference_type: 'batch',
      status: 'awaiting_action',
      is_read: false,
      aicte_message: '15 records have missing APAAR IDs. Please obtain student consent forms and resubmit.',
      deadline: '2024-09-25T17:00:00Z',
      date: '2024-09-05T15:00:00Z',
      metadata: {
        batch_id: 'b3',
        decision: 'returned_for_correction',
        academic_year: '2024-25',
        next_action: 'Upload corrected batch via CSV Upload',
      },
      created_at: '2024-09-05T15:00:00Z',
      updated_at: '2024-09-05T15:00:00Z',
    },
    {
      id: 'inbox-002',
      institution_id: srit.id,
      type: 'intake_inquiry',
      title: 'Intake Exception Inquiry: MBA (2024-25)',
      reference_id: 'ex-sup-1',
      reference_type: 'intake_exception',
      status: 'awaiting_action',
      is_read: false,
      aicte_message: 'AICTE council inquiry: Approved supernumerary quota is 6, but 8 candidates were admitted. Please provide explanation and governing board sanction.',
      deadline: '2024-09-22T17:00:00Z',
      date: '2024-09-08T10:00:00Z',
      metadata: {
        exception_id: 'ex-sup-1',
        programme: 'Master of Business Administration',
        academic_year: '2024-25',
        approved_intake: 60,
        actual_enrolled: 8,
        excess: 2,
        next_action: 'Submit formal institutional explanation to AICTE council',
      },
      created_at: '2024-09-08T10:00:00Z',
      updated_at: '2024-09-08T10:00:00Z',
    },
    {
      id: 'inbox-003',
      institution_id: srit.id,
      type: 'duplicate_adjudication',
      title: 'Duplicate Review Decision: Case d2 Demographic Divergence',
      reference_id: 'd2',
      reference_type: 'duplicate_case',
      status: 'awaiting_action',
      is_read: false,
      aicte_message: 'AICTE council review confirmed name divergence between admission record and APAAR registry. Please verify candidate identity certificate.',
      deadline: '2024-09-18T17:00:00Z',
      date: '2024-09-02T11:00:00Z',
      metadata: {
        case_id: 'd2',
        decision: 'confirmed_duplicate',
        student_id: 'std-000004',
        student_name: 'Anjali Singh',
        masked_student_name: '[Confidential Candidate - Verified Institution]',
        next_action: 'Review duplicate finding and regularize enrolment',
      },
      created_at: '2024-09-02T11:00:00Z',
      updated_at: '2024-09-02T11:00:00Z',
    },
    {
      id: 'inbox-004',
      institution_id: srit.id,
      type: 'correction_request',
      title: 'Record Correction: Missing APAAR ID (MBA 2024-25)',
      reference_id: 'cr-0001',
      reference_type: 'correction_request',
      status: 'awaiting_action',
      is_read: true,
      aicte_message: 'APAAR ID is missing from admission record for MBA 2024-25. Please obtain candidate consent and supply verified 12-digit APAAR ID.',
      deadline: '2024-09-20T17:00:00Z',
      date: '2024-09-05T10:00:00Z',
      metadata: {
        correction_id: 'cr-0001',
        requested_fields: ['apaar_id'],
        next_action: 'Submit corrected APAAR ID or candidate consent',
      },
      created_at: '2024-09-05T10:00:00Z',
      updated_at: '2024-09-05T10:00:00Z',
    },
    {
      id: 'inbox-005',
      institution_id: srit.id,
      type: 'submission_decision',
      title: 'Submission Batch b1 Approved by AICTE',
      reference_id: 'b1',
      reference_type: 'batch',
      status: 'completed',
      is_read: true,
      aicte_message: 'All 29 records verified against approved intake matrix and committed to AICTE central register.',
      date: '2024-08-15T10:30:00Z',
      metadata: {
        batch_id: 'b1',
        decision: 'approved',
        academic_year: '2024-25',
        next_action: 'No action required. Records active in central register.',
      },
      created_at: '2024-08-15T10:30:00Z',
      updated_at: '2024-08-15T10:30:00Z',
    },
    {
      id: 'inbox-006',
      institution_id: ntu.id,
      type: 'submission_decision',
      title: 'Submission Batch b2 Approved by AICTE',
      reference_id: 'b2',
      reference_type: 'batch',
      status: 'completed',
      is_read: true,
      aicte_message: 'Approved after review of minor discrepancies.',
      date: '2024-08-20T11:00:00Z',
      metadata: {
        batch_id: 'b2',
        decision: 'approved',
        academic_year: '2024-25',
      },
      created_at: '2024-08-20T11:00:00Z',
      updated_at: '2024-08-20T11:00:00Z',
    },
  ];
}

function getCanonicalInitialState(): DemoStoreState {
  const generated = generateDeterministicDemoDataset();
  const correctionRequests = getInitialCanonicalCorrectionRequests(generated.institutions, generated.enrolments, generated.students);
  const intakeExceptions = getInitialCanonicalIntakeExceptions(generated.institutions, generated.programmes);
  const inboxItems = getInitialCanonicalInboxItems(generated.institutions, intakeExceptions);

  return {
    institutions: generated.institutions,
    programmes: generated.programmes,
    intakes: generated.intakes,
    batches: generated.batches,
    enrolments: generated.enrolments,
    students: generated.students,
    duplicateCases: generated.duplicateCases,
    submissionErrors: generated.submissionErrors,
    auditLogs: generated.auditLogs,
    correctionRequests,
    intakeExceptions,
    inboxItems,
  };
}

export class DemoStore {
  private state: DemoStoreState;

  constructor() {
    this.state = this.loadFromStorage();
  }

  private loadFromStorage(): DemoStoreState {
    if (typeof window === 'undefined' || !window.localStorage) {
      return getCanonicalInitialState();
    }

    try {
      // 1. Try loading v2 store
      const serializedV2 = localStorage.getItem(DEMO_STORE_KEY);
      if (serializedV2) {
        const parsed = JSON.parse(serializedV2);
        if (
          parsed &&
          Array.isArray(parsed.institutions) &&
          parsed.institutions.length >= 12 &&
          Array.isArray(parsed.students) &&
          Array.isArray(parsed.enrolments) &&
          Array.isArray(parsed.duplicateCases) &&
          parsed.duplicateCases.length > 0 &&
          parsed.duplicateCases[0].case_type
        ) {
          if (!Array.isArray(parsed.correctionRequests) || parsed.correctionRequests.length === 0) {
            parsed.correctionRequests = getInitialCanonicalCorrectionRequests(parsed.institutions, parsed.enrolments, parsed.students);
          }
          if (!Array.isArray(parsed.intakeExceptions) || parsed.intakeExceptions.length === 0) {
            parsed.intakeExceptions = getInitialCanonicalIntakeExceptions(parsed.institutions, parsed.programmes);
          }
          if (!Array.isArray(parsed.inboxItems) || parsed.inboxItems.length === 0) {
            parsed.inboxItems = getInitialCanonicalInboxItems(parsed.institutions, parsed.intakeExceptions);
          }
          return parsed as DemoStoreState;
        }
      }

      // 2. Try migrating v1 store if it exists
      const serializedV1 = localStorage.getItem(PREVIOUS_DEMO_STORE_KEY);
      const canonical = getCanonicalInitialState();

      if (serializedV1) {
        try {
          const parsedV1 = JSON.parse(serializedV1);
          // Preserve any custom user-created batches in v1 (e.g. DEMO-BATCH-...)
          if (parsedV1 && Array.isArray(parsedV1.batches)) {
            const userBatches: SubmissionBatch[] = parsedV1.batches.filter(
              (b: SubmissionBatch) => b.id && (b.id.startsWith('DEMO-BATCH-') || b.id.startsWith('BATCH-USER-'))
            );
            const userEnrolments: Enrolment[] = Array.isArray(parsedV1.enrolments)
              ? parsedV1.enrolments.filter((e: Enrolment) => e.batch_id && (e.batch_id.startsWith('DEMO-BATCH-') || e.batch_id.startsWith('BATCH-USER-')))
              : [];
            const userAuditLogs: AuditLog[] = Array.isArray(parsedV1.auditLogs)
              ? parsedV1.auditLogs.filter((a: AuditLog) => a.action && a.action.startsWith('DEMO_'))
              : [];

            if (userBatches.length > 0) {
              canonical.batches = [...userBatches, ...canonical.batches];
            }
            if (userEnrolments.length > 0) {
              canonical.enrolments = [...userEnrolments, ...canonical.enrolments];
            }
            if (userAuditLogs.length > 0) {
              canonical.auditLogs = [...userAuditLogs, ...canonical.auditLogs];
            }
          }
        } catch (migErr) {
          console.warn('Migration from v1 store encountered error:', migErr);
        }
      }

      this.saveToStorage(canonical);
      return canonical;
    } catch (e) {
      console.warn('Failed to load demoStore from localStorage:', e);
      const fresh = getCanonicalInitialState();
      this.saveToStorage(fresh);
      return fresh;
    }
  }

  private saveToStorage(stateToSave: DemoStoreState = this.state): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      localStorage.setItem(DEMO_STORE_KEY, JSON.stringify(stateToSave));
    } catch (e) {
      console.warn('Failed to save demoStore to localStorage:', e);
    }
  }

  public reset(): void {
    this.state = getCanonicalInitialState();
    this.saveToStorage(this.state);
  }

  public reseed(): void {
    this.reset();
  }

  // -------------------------------------------------------------
  // Institutions & Programmes Queries
  // -------------------------------------------------------------
  public getInstitutions(): Institution[] {
    return [...this.state.institutions];
  }

  public getInstitution(id: string): Institution | undefined {
    return this.state.institutions.find(i => i.id === id);
  }

  public getProgrammes(institutionId?: string): Programme[] {
    const list = institutionId
      ? this.state.programmes.filter(p => p.institution_id === institutionId)
      : this.state.programmes;

    // Attach approved intakes to each programme for easy UI display
    return list.map(p => {
      const intakes = this.state.intakes.filter(i => i.programme_id === p.id);
      return {
        ...p,
        approved_intakes: intakes,
      };
    });
  }

  // -------------------------------------------------------------
  // Institution Intake Quotas Check
  // -------------------------------------------------------------
  public getInstitutionProgrammesAndIntakes(
    institutionId: string = DEMO_INSTITUTION_ID,
    academicYear: string = '2024-25'
  ): {
    existingIds: Set<string>;
    progMap: Map<string, { progId: string; intake?: ApprovedIntake; regCount: number; supCount: number }>;
  } {
    const existingIds = new Set<string>();
    for (const enr of this.state.enrolments) {
      if (enr.institution_id === institutionId && enr.institution_student_id && enr.submission_status === 'approved') {
        existingIds.add(enr.institution_student_id);
      }
    }

    const progMap = new Map<string, { progId: string; intake?: ApprovedIntake; regCount: number; supCount: number }>();
    const instProgrammes = this.state.programmes.filter(p => p.institution_id === institutionId);

    for (const prog of instProgrammes) {
      const intake = this.state.intakes.find(
        i => i.programme_id === prog.id && i.academic_year === academicYear && i.status === 'active'
      );

      let regCount = 0;
      let supCount = 0;
      for (const enr of this.state.enrolments) {
        if (
          enr.programme_id === prog.id &&
          enr.academic_year === academicYear &&
          enr.enrolment_status === 'active' &&
          enr.submission_status === 'approved'
        ) {
          if (enr.supernumerary_classification && enr.supernumerary_classification !== 'none') {
            supCount++;
          } else {
            regCount++;
          }
        }
      }

      progMap.set(prog.code.toUpperCase(), {
        progId: prog.id,
        intake,
        regCount,
        supCount,
      });
    }

    return { existingIds, progMap };
  }

  // -------------------------------------------------------------
  // Batch Provisioning (Institution Admin)
  // -------------------------------------------------------------
  public createDraftBatch(
    academicYear: string,
    totalRecords: number,
    institutionId: string = DEMO_INSTITUTION_ID
  ): { batchId: string | null; error: string | null } {
    if (!/^\d{4}-\d{2}$/.test(academicYear)) {
      return { batchId: null, error: 'Academic year must use the YYYY-YY format.' };
    }
    if (!Number.isInteger(totalRecords) || totalRecords < 1) {
      return { batchId: null, error: 'A submission batch must contain at least one record.' };
    }

    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const batchId = `DEMO-BATCH-${dateStr}-${randomSuffix}`;

    const inst = this.getInstitution(institutionId) || {
      id: institutionId,
      aicte_id: '1-SRIT2024',
      name: 'Shri Ram Institute of Technology (DEMO)',
      type: 'autonomous_college',
      approval_status: 'active',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };

    const newBatch: SubmissionBatch = {
      id: batchId,
      institution_id: institutionId,
      academic_year: academicYear,
      status: 'draft',
      total_records: totalRecords,
      valid_records: 0,
      error_records: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      institution: inst,
    };

    this.state.batches.unshift(newBatch);
    this.saveToStorage();

    return { batchId, error: null };
  }

  // -------------------------------------------------------------
  // Batch Submission & Row Processing (Institution Admin)
  // -------------------------------------------------------------
  public submitBatch(
    batchId: string,
    institutionId: string = DEMO_INSTITUTION_ID,
    academicYear: string = '2024-25',
    records: BatchEnrolmentRecordInput[]
  ): { data: BatchEnrolmentResponse | null; error: string | null } {
    if (!records || records.length === 0) {
      return {
        data: null,
        error: 'Cannot persist batch: No valid records provided in submission payload.',
      };
    }

    const inst = this.getInstitution(institutionId) || {
      id: institutionId,
      aicte_id: '1-SRIT2024',
      name: 'Shri Ram Institute of Technology (DEMO)',
      type: 'autonomous_college',
      approval_status: 'active',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };

    let batch = this.state.batches.find(b => b.id === batchId);
    if (!batch) {
      batch = {
        id: batchId,
        institution_id: institutionId,
        academic_year: academicYear,
        status: 'draft',
        total_records: records.length,
        valid_records: 0,
        error_records: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        institution: inst,
      };
      this.state.batches.unshift(batch);
    }

    const rowResults: BatchEnrolmentRowResult[] = [];
    let acceptedCount = 0;
    let rejectedCount = 0;
    let duplicateCount = 0;

    const { existingIds, progMap } = this.getInstitutionProgrammesAndIntakes(institutionId, academicYear);
    const seenBatchStudentIds = new Set<string>();

    for (const rec of records) {
      const studentIdCode = (rec.institution_student_id || '').trim();
      const progCode = (rec.programme_code || '').trim().toUpperCase();
      const progInfo = progMap.get(progCode);

      // Check intra-batch duplicate
      if (seenBatchStudentIds.has(studentIdCode)) {
        rowResults.push({
          row_number: rec.row_number,
          institution_student_id: studentIdCode,
          status: 'duplicate',
          error_type: 'duplicate',
          error_message: `Duplicate student ID '${studentIdCode}' within the same submission batch.`,
        });
        duplicateCount++;
        rejectedCount++;
        continue;
      }
      seenBatchStudentIds.add(studentIdCode);

      // Check existing enrolment collision
      if (existingIds.has(studentIdCode)) {
        rowResults.push({
          row_number: rec.row_number,
          institution_student_id: studentIdCode,
          status: 'duplicate',
          error_type: 'duplicate',
          error_message: `Student with ID '${studentIdCode}' is already enrolled in this institution for academic year ${academicYear}.`,
        });
        duplicateCount++;
        rejectedCount++;
        continue;
      }

      // Check unknown programme
      if (!progInfo) {
        rowResults.push({
          row_number: rec.row_number,
          institution_student_id: studentIdCode,
          status: 'rejected',
          error_type: 'invalid_format',
          error_message: `Unknown or unapproved programme code '${progCode}' for this institution.`,
        });
        rejectedCount++;
        continue;
      }

      // Check APAAR demographic conflict
      const normApaar = rec.apaar_id ? String(rec.apaar_id).replace(/[^0-9]/g, '') : undefined;
      let apaarConflictStudent: Student | undefined;
      if (normApaar && normApaar.length === 12) {
        const matchingStudent = this.state.students.find(s => s.apaar_id === normApaar);
        if (matchingStudent && matchingStudent.full_name.trim().toLowerCase() !== rec.full_name.trim().toLowerCase()) {
          apaarConflictStudent = matchingStudent;
        }
      }

      if (apaarConflictStudent) {
        const candidateStudentId = 'std-cand-' + Math.floor(10000 + Math.random() * 90000);
        const candidateStudent: Student = {
          id: candidateStudentId,
          apaar_id: normApaar,
          full_name: rec.full_name.trim(),
          date_of_birth: rec.date_of_birth,
          gender: rec.gender,
          apaar_verification_status: 'unverified',
          apaar_verification_note: 'Flagged for demographic mismatch with APAAR directory record.',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        this.state.students.push(candidateStudent);

        const dupCaseId = 'dup-case-' + Math.floor(1000 + Math.random() * 9000);
        const dupCase: DuplicateReviewCase = {
          id: dupCaseId,
          batch_id: batch.id,
          student_id_1: apaarConflictStudent.id,
          student_id_2: candidateStudentId,
          case_type: 'demographic_divergence',
          severity: 'medium',
          detection_reason: `Demographic mismatch / name divergence: Verified APAAR register identity '${apaarConflictStudent.full_name}' differs from admission record '${rec.full_name}' for APAAR ID XXXXXXXX${normApaar.slice(-4)} (simulated APAAR directory). Flagged for manual review.`,
          review_status: 'pending',
          created_at: new Date().toISOString(),
          verification_source: 'Simulated Local Demo APAAR Verification',
          verification_status: 'flagged_demographic_divergence',
          verification_timestamp: new Date().toISOString(),
          student_1: apaarConflictStudent,
          student_2: candidateStudent,
        };
        this.state.duplicateCases.unshift(dupCase);

        rowResults.push({
          row_number: rec.row_number,
          institution_student_id: studentIdCode,
          status: 'duplicate',
          error_type: 'duplicate',
          error_message: `APAAR demographic mismatch: APAAR ID links to registered student '${apaarConflictStudent.full_name}' while submitted name is '${rec.full_name}'. Flagged for review.`,
        });
        duplicateCount++;
        rejectedCount++;
        continue;
      }

      // Check Quota limits
      const isSuper = Boolean(rec.supernumerary_classification && rec.supernumerary_classification !== 'none');
      if (progInfo.intake) {
        if (!isSuper && progInfo.regCount >= progInfo.intake.approved_intake) {
          rowResults.push({
            row_number: rec.row_number,
            institution_student_id: studentIdCode,
            status: 'rejected',
            error_type: 'intake_exceeded',
            error_message: `Approved regular intake capacity (${progInfo.intake.approved_intake}) reached for programme ${progCode}.`,
          });
          rejectedCount++;
          continue;
        }
        if (isSuper && progInfo.supCount >= progInfo.intake.total_supernumerary) {
          rowResults.push({
            row_number: rec.row_number,
            institution_student_id: studentIdCode,
            status: 'rejected',
            error_type: 'supernumerary_exceeded',
            error_message: `Approved supernumerary quota (${progInfo.intake.total_supernumerary}) reached for programme ${progCode}.`,
          });
          rejectedCount++;
          continue;
        }
      }

      // Valid record: create student and enrolment
      const studentId = 'std-' + Math.floor(100000 + Math.random() * 900000);
      const studentRecord: Student = {
        id: studentId,
        apaar_id: normApaar,
        full_name: rec.full_name.trim(),
        date_of_birth: rec.date_of_birth,
        gender: rec.gender,
        apaar_verification_status: normApaar && normApaar.length === 12 ? 'verified' : 'unverified',
        apaar_verified_at: normApaar && normApaar.length === 12 ? new Date().toISOString() : undefined,
        apaar_verification_source: 'simulated_local_demo',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      this.state.students.push(studentRecord);

      const enrolmentId = 'enr-' + Math.floor(100000 + Math.random() * 900000);
      const enrolmentRecord: Enrolment = {
        id: enrolmentId,
        student_id: studentId,
        institution_id: institutionId,
        programme_id: progInfo.progId,
        approved_intake_id: progInfo.intake?.id,
        batch_id: batch.id,
        academic_year: academicYear,
        admission_date: rec.admission_date || new Date().toISOString().slice(0, 10),
        enrolment_status: 'active',
        submission_status: 'submitted',
        admission_category: rec.admission_category,
        is_nri: Boolean(rec.is_nri),
        is_oci: Boolean(rec.is_oci),
        is_foreign_national: Boolean(rec.is_foreign_national),
        supernumerary_classification: rec.supernumerary_classification || 'none',
        institution_student_id: studentIdCode,
        remarks: rec.remarks,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        student: studentRecord,
        institution: inst,
      };
      this.state.enrolments.unshift(enrolmentRecord);

      existingIds.add(studentIdCode);
      if (isSuper) progInfo.supCount++;
      else progInfo.regCount++;

      rowResults.push({
        row_number: rec.row_number,
        institution_student_id: studentIdCode,
        status: 'accepted',
        student_id: studentId,
        enrolment_id: enrolmentId,
      });
      acceptedCount++;
    }

    // Update batch status and metrics
    batch.total_records = records.length;
    batch.valid_records = acceptedCount;
    batch.error_records = rejectedCount;
    batch.status = acceptedCount > 0 ? 'submitted' : 'validation_failed';
    batch.submitted_at = new Date().toISOString();
    batch.updated_at = new Date().toISOString();
    (batch as any).raw_records = records;
    (batch as any).row_results = rowResults;

    // Audit log
    this.state.auditLogs.unshift({
      id: 'audit-' + Math.floor(1000 + Math.random() * 9000),
      actor_id: '00000000-0000-0000-0000-000000000002',
      actor_email: 'principal@srit.ac.in',
      actor_role: 'institution_admin',
      institution_id: institutionId,
      action: 'BATCH_SUBMITTED',
      entity_type: 'submission_batches',
      entity_id: batch.id,
      new_values: {
        total_records: records.length,
        accepted: acceptedCount,
        rejected: rejectedCount,
        duplicates: duplicateCount,
      },
      created_at: new Date().toISOString(),
    });

    this.saveToStorage();

    return {
      data: {
        success: acceptedCount > 0,
        batch_id: batch.id,
        total_records: records.length,
        accepted_records: acceptedCount,
        rejected_records: rejectedCount,
        duplicate_records: duplicateCount,
        batch_status: batch.status,
        row_results: rowResults,
        message: `Processed ${records.length} records: ${acceptedCount} accepted, ${rejectedCount} rejected, ${duplicateCount} duplicate cases.`,
      },
      error: null,
    };
  }

  // -------------------------------------------------------------
  // Data Access Queries
  // -------------------------------------------------------------
  public getBatchDetails(batchId: string): {
    batch: SubmissionBatch | undefined;
    rowResults: BatchEnrolmentRowResult[];
    enrolments: Enrolment[];
  } {
    const batch = this.state.batches.find(b => b.id === batchId);
    const enrolments = this.state.enrolments.filter(e => e.batch_id === batchId);
    let rowResults: BatchEnrolmentRowResult[] = (batch as any)?.row_results || [];

    if (rowResults.length === 0 && enrolments.length > 0) {
      rowResults = enrolments.map((enr, idx) => ({
        row_number: idx + 1,
        institution_student_id: enr.institution_student_id || `STD-${idx + 1}`,
        status: 'accepted' as const,
        student_id: enr.student_id,
        enrolment_id: enr.id,
      }));
    }

    return { batch, rowResults, enrolments };
  }

  public getStudents(): Student[] {
    return [...this.state.students];
  }

  public getEnrolments(institutionId?: string): Enrolment[] {
    if (!institutionId) {
      return [...this.state.enrolments];
    }
    return this.state.enrolments.filter(e => e.institution_id === institutionId);
  }

  public getBatches(institutionId?: string): SubmissionBatch[] {
    if (!institutionId) {
      return [...this.state.batches];
    }
    return this.state.batches.filter(b => b.institution_id === institutionId);
  }

  
  public getDuplicateCases(): DuplicateReviewCase[] {
    const enrichEnrolment = (enr: any) => {
      if (!enr) return undefined;
      const inst = this.state.institutions.find(i => i.id === enr.institution_id);
      const prog = this.state.programmes.find(p => p.id === enr.programme_id);
      return {
        ...enr,
        institution: enr.institution || (inst ? { id: inst.id, name: inst.name, aicte_id: inst.aicte_id } : undefined),
        programme: enr.programme || (prog ? { id: prog.id, name: prog.name, code: prog.code } : undefined),
      };
    };

    return this.state.duplicateCases.map(c => {
      const s1 = c.student_1 || this.state.students.find(s => s.id === c.student_id_1);
      const s2 = c.student_2 || (c.student_id_2 ? this.state.students.find(s => s.id === c.student_id_2) : undefined);
      const enr1 = c.enrolment_id_1
        ? this.state.enrolments.find(e => e.id === c.enrolment_id_1)
        : (s1 ? this.state.enrolments.find(e => e.student_id === s1.id) : undefined);
      const enr2 = c.enrolment_id_2
        ? this.state.enrolments.find(e => e.id === c.enrolment_id_2)
        : (s2 ? this.state.enrolments.find(e => e.student_id === s2.id) : undefined);

      return {
        ...c,
        student_1: s1,
        student_2: s2,
        enrolment_1: enrichEnrolment(enr1),
        enrolment_2: enrichEnrolment(enr2),
      };
    });
  }

  // -------------------------------------------------------------
  // AICTE Workflow Actions
  // -------------------------------------------------------------
  public updateBatchStatus(
    batchId: string,
    status: BatchStatus,
    reviewerNotes?: string
  ): boolean {
    const batch = this.state.batches.find(b => b.id === batchId);
    if (!batch) return false;

    batch.status = status;
    batch.reviewer_notes = reviewerNotes;
    batch.reviewed_at = new Date().toISOString();
    batch.reviewed_by = '00000000-0000-0000-0000-000000000001';
    batch.updated_at = new Date().toISOString();

    // If batch approved, cascade approval status to active enrolments
    if (status === 'approved') {
      for (const enr of this.state.enrolments) {
        if (enr.batch_id === batchId) {
          enr.submission_status = 'approved';
        }
      }
    }

    this.state.auditLogs.unshift({
      id: 'audit-' + Math.floor(1000 + Math.random() * 9000),
      actor_id: '00000000-0000-0000-0000-000000000001',
      actor_email: 'aicte.admin@demo.aicte.gov.in',
      actor_role: 'aicte_admin',
      institution_id: batch.institution_id,
      action: 'BATCH_' + status.toUpperCase(),
      entity_type: 'submission_batches',
      entity_id: batchId,
      new_values: { status, reviewer_notes: reviewerNotes },
      created_at: new Date().toISOString(),
    });

    // Notify institution in inbox (Requirement 1)
    const statusTitle = status === 'approved'
      ? `Submission Batch ${batch.id} Approved`
      : status === 'rejected'
      ? `Submission Batch ${batch.id} Rejected`
      : `Submission Batch ${batch.id} Returned for Correction`;

    const nextAction = status === 'returned_for_correction'
      ? 'Upload corrected batch via CSV Upload'
      : status === 'approved'
      ? 'No action required. Records are committed to AICTE central register'
      : 'Review AICTE rejection remarks';

    this.createInboxItem({
      institution_id: batch.institution_id,
      type: 'submission_decision',
      title: statusTitle,
      reference_id: batch.id,
      reference_type: 'batch',
      status: status === 'returned_for_correction' ? 'awaiting_action' : 'completed',
      aicte_message: reviewerNotes || (status === 'approved' ? 'Batch approved by AICTE review board.' : status === 'rejected' ? 'Batch rejected by AICTE review board.' : 'Batch returned for correction.'),
      metadata: {
        batch_id: batch.id,
        decision: status,
        academic_year: batch.academic_year,
        next_action: nextAction,
      },
    });

    this.saveToStorage();
    return true;
  }

  public resolveDuplicateCase(
    caseId: string,
    status: DuplicateReviewStatus,
    notes: string,
    reviewerEmail = 'aicte.admin@demo.aicte.gov.in'
  ): boolean {
    const dupCase = this.state.duplicateCases.find(c => c.id === caseId);
    if (!dupCase) return false;

    dupCase.review_status = status;
    dupCase.reviewer_notes = notes;
    dupCase.reviewed_by = reviewerEmail;
    dupCase.reviewed_at = new Date().toISOString();

    this.state.auditLogs.unshift({
      id: 'audit-' + Math.floor(1000 + Math.random() * 9000),
      actor_id: '00000000-0000-0000-0000-000000000001',
      actor_email: reviewerEmail,
      actor_role: 'aicte_admin',
      action: 'DUPLICATE_CASE_' + status.toUpperCase(),
      entity_type: 'duplicate_review_cases',
      entity_id: caseId,
      new_values: { review_status: status, reviewer_notes: notes },
      created_at: new Date().toISOString(),
    });

    // Notify affected institution(s) preserving cross-tenant privacy (Requirement 2)
    const e1 = dupCase.enrolment_1 || this.state.enrolments.find(e => e.student_id === dupCase.student_id_1);
    const e2 = dupCase.enrolment_2 || (dupCase.student_id_2 ? this.state.enrolments.find(e => e.student_id === dupCase.student_id_2) : undefined);
    const s1 = dupCase.student_1 || this.state.students.find(s => s.id === dupCase.student_id_1);
    const s2 = dupCase.student_2 || (dupCase.student_id_2 ? this.state.students.find(s => s.id === dupCase.student_id_2) : undefined);

    const inst1Id = e1?.institution_id || (dupCase as any).institution_id || DEMO_INSTITUTION_ID;
    const inst2Id = e2?.institution_id;

    const actionReq = status === 'confirmed_duplicate';
    const nextAction = actionReq ? 'Review duplicate finding and regularize enrolment status' : 'Informational notice: review concluded';

    // 1. Notify Institution 1 (sees their student, other student identity masked)
    this.createInboxItem({
      institution_id: inst1Id,
      type: 'duplicate_adjudication',
      title: `Duplicate Case ${dupCase.id} Decision: ${status.replace(/_/g, ' ').toUpperCase()}`,
      reference_id: dupCase.id,
      reference_type: 'duplicate_case',
      status: actionReq ? 'awaiting_action' : 'completed',
      aicte_message: `AICTE Decision: ${status.replace(/_/g, ' ').toUpperCase()}. ${notes || 'Duplicate review case adjudicated by AICTE council.'}`,
      metadata: {
        case_id: dupCase.id,
        decision: status,
        student_id: s1?.id,
        student_name: s1?.full_name,
        masked_student_name: s2 ? '[Confidential Candidate - Verified Institution]' : undefined,
        next_action: nextAction,
      },
    });

    // 2. If cross-institution collision, notify Institution 2 (sees their student, inst 1 masked)
    if (inst2Id && inst2Id !== inst1Id) {
      this.createInboxItem({
        institution_id: inst2Id,
        type: 'duplicate_adjudication',
        title: `Duplicate Case ${dupCase.id} Decision: ${status.replace(/_/g, ' ').toUpperCase()}`,
        reference_id: dupCase.id,
        reference_type: 'duplicate_case',
        status: actionReq ? 'awaiting_action' : 'completed',
        aicte_message: `AICTE Decision: ${status.replace(/_/g, ' ').toUpperCase()}. ${notes || 'Duplicate review case adjudicated by AICTE council.'}`,
        metadata: {
          case_id: dupCase.id,
          decision: status,
          student_id: s2?.id,
          student_name: s2?.full_name,
          masked_student_name: '[Confidential Candidate - Verified Institution]',
          next_action: nextAction,
        },
      });
    }

    this.saveToStorage();
    return true;
  }


  // -------------------------------------------------------------
  // Institution Inbox Operations (AICTE-to-Institution Communications)
  // -------------------------------------------------------------
  public createInboxItem(item: Partial<InstitutionInboxItem> & { institution_id: string; type: InboxItemType; title: string }): InstitutionInboxItem {
    if (!this.state.inboxItems) {
      this.state.inboxItems = [];
    }
    const id = item.id || `inbox-${String(this.state.inboxItems.length + 1).padStart(3, '0')}`;
    const now = new Date().toISOString();
    const newItem: InstitutionInboxItem = {
      id,
      institution_id: item.institution_id,
      type: item.type,
      title: item.title,
      reference_id: item.reference_id || id,
      reference_type: item.reference_type || 'system',
      status: item.status || 'awaiting_action',
      is_read: item.is_read ?? false,
      aicte_message: item.aicte_message || '',
      institution_response: item.institution_response,
      responded_at: item.responded_at,
      responded_by: item.responded_by,
      deadline: item.deadline,
      date: item.date || now,
      metadata: item.metadata || {},
      created_at: item.created_at || now,
      updated_at: item.updated_at || now,
    };

    const existingIdx = this.state.inboxItems.findIndex(i => i.id === newItem.id);
    if (existingIdx >= 0) {
      this.state.inboxItems[existingIdx] = newItem;
    } else {
      this.state.inboxItems.unshift(newItem);
    }

    this.saveToStorage();
    return newItem;
  }

  public getInboxItems(
    institutionId?: string,
    tab?: 'all' | 'awaiting_action' | 'under_review' | 'completed'
  ): InstitutionInboxItem[] {
    let items = this.state.inboxItems || [];
    if (institutionId) {
      items = items.filter(i => i.institution_id === institutionId);
    }
    if (tab && tab !== 'all') {
      if (tab === 'awaiting_action') {
        items = items.filter(i => i.status === 'awaiting_action');
      } else if (tab === 'under_review') {
        items = items.filter(i => i.status === 'under_review');
      } else if (tab === 'completed') {
        items = items.filter(i => i.status === 'completed');
      }
    }
    return [...items].sort((a, b) => new Date(b.date || b.created_at).getTime() - new Date(a.date || a.created_at).getTime());
  }

  public getInboxItem(id: string, institutionId?: string): InstitutionInboxItem | undefined {
    const item = (this.state.inboxItems || []).find(i => i.id === id);
    if (!item) return undefined;
    if (institutionId && item.institution_id !== institutionId) {
      return undefined; // Strictly tenant isolated
    }
    return item;
  }

  public markInboxItemRead(id: string, institutionId?: string): boolean {
    const item = (this.state.inboxItems || []).find(i => i.id === id);
    if (!item) return false;
    if (institutionId && item.institution_id !== institutionId) return false;
    item.is_read = true;
    item.updated_at = new Date().toISOString();
    this.saveToStorage();
    return true;
  }

  public submitInboxResponse(
    id: string,
    institutionId: string,
    responseText: string,
    proposedData?: any,
    actorEmail = 'principal@srit.ac.in'
  ): { success: boolean; data?: InstitutionInboxItem; error?: string } {
    const item = (this.state.inboxItems || []).find(i => i.id === id);
    if (!item) {
      return { success: false, error: `Inbox item '${id}' not found.` };
    }
    if (item.institution_id !== institutionId) {
      return { success: false, error: 'Unauthorized: Cannot respond to communication addressed to another institution.' };
    }
    if (item.status === 'completed') {
      return { success: false, error: 'Cannot respond to an already completed notification.' };
    }

    const now = new Date().toISOString();
    item.institution_response = responseText.trim();
    item.responded_at = now;
    item.responded_by = actorEmail;
    item.status = 'under_review';
    item.updated_at = now;

    // Synchronize underlying record depending on type
    if (item.type === 'intake_inquiry') {
      const ex = (this.state.intakeExceptions || []).find(e => e.id === item.reference_id);
      if (ex) {
        ex.status = 'explanation_submitted';
        ex.institution_response = responseText.trim();
        ex.responded_at = now;
        ex.responded_by = actorEmail;
        ex.updated_at = now;
      }
    } else if (item.type === 'correction_request') {
      const cr = this.state.correctionRequests.find(c => c.id === item.reference_id);
      if (cr) {
        cr.status = 'submitted_for_review';
        cr.institution_response = responseText.trim();
        if (proposedData) cr.proposed_changes = proposedData;
        cr.updated_at = now;
        cr.history.push({
          id: 'hist-' + Math.floor(1000 + Math.random() * 9000),
          actor_email: actorEmail,
          actor_role: 'institution_admin',
          action: 'submitted_for_review',
          comment: responseText.trim(),
          proposed_changes: proposedData,
          created_at: now,
        });
      }
    }

    // Audit log
    this.state.auditLogs.unshift({
      id: 'audit-' + Math.floor(1000 + Math.random() * 9000),
      actor_id: '00000000-0000-0000-0000-000000000002',
      actor_email: actorEmail,
      actor_role: 'institution_admin',
      institution_id: institutionId,
      action: 'INBOX_RESPONSE_SUBMITTED',
      entity_type: 'institution_inbox_items',
      entity_id: item.id,
      new_values: {
        type: item.type,
        reference_id: item.reference_id,
        summary: responseText.slice(0, 100),
      },
      created_at: now,
    });

    this.saveToStorage();
    return { success: true, data: item };
  }

  // -------------------------------------------------------------
  // Intake Exceptions Operations
  // -------------------------------------------------------------
  public getIntakeExceptions(institutionId?: string): IntakeException[] {
    let exceptions = this.state.intakeExceptions || [];
    if (institutionId) {
      exceptions = exceptions.filter(e => e.institution_id === institutionId);
    }
    return [...exceptions];
  }

  public getIntakeException(id: string): IntakeException | undefined {
    return (this.state.intakeExceptions || []).find(e => e.id === id);
  }

  public requestIntakeExplanation(
    exceptionId: string,
    inquiryText: string,
    deadline?: string,
    reviewerEmail = 'aicte.admin@demo.aicte.gov.in'
  ): { success: boolean; data?: IntakeException; error?: string } {
    const ex = (this.state.intakeExceptions || []).find(e => e.id === exceptionId);
    if (!ex) {
      return { success: false, error: `Intake exception '${exceptionId}' not found.` };
    }

    const now = new Date().toISOString();
    ex.status = 'awaiting_institution';
    ex.inquiry_text = inquiryText.trim();
    ex.inquiry_deadline = deadline || new Date(Date.now() + 7 * 86400000).toISOString();
    ex.inquiry_sent_at = now;
    ex.updated_at = now;

    // Create / update institution inbox item
    this.createInboxItem({
      institution_id: ex.institution_id,
      type: 'intake_inquiry',
      title: `Intake Exception Inquiry: ${ex.programme} (${ex.academic_year})`,
      reference_id: ex.id,
      reference_type: 'intake_exception',
      status: 'awaiting_action',
      aicte_message: inquiryText.trim(),
      deadline: ex.inquiry_deadline,
      metadata: {
        exception_id: ex.id,
        programme: ex.programme,
        academic_year: ex.academic_year,
        approved_intake: ex.approved_intake,
        actual_enrolled: ex.enrolled ?? ex.supernumerary_enrolled,
        excess: ex.excess,
        next_action: 'Submit formal institutional explanation to AICTE council',
      },
    });

    // Audit log
    this.state.auditLogs.unshift({
      id: 'audit-' + Math.floor(1000 + Math.random() * 9000),
      actor_id: '00000000-0000-0000-0000-000000000001',
      actor_email: reviewerEmail,
      actor_role: 'aicte_admin',
      institution_id: ex.institution_id,
      action: 'INTAKE_EXPLANATION_REQUESTED',
      entity_type: 'intake_exceptions',
      entity_id: ex.id,
      new_values: {
        programme: ex.programme,
        excess: ex.excess,
        inquiry: inquiryText.slice(0, 100),
        deadline: ex.inquiry_deadline,
      },
      created_at: now,
    });

    this.saveToStorage();
    return { success: true, data: ex };
  }

  public submitIntakeExplanation(
    exceptionId: string,
    institutionId: string,
    explanation: string,
    actorEmail = 'principal@srit.ac.in'
  ): { success: boolean; data?: IntakeException; error?: string } {
    const ex = (this.state.intakeExceptions || []).find(e => e.id === exceptionId);
    if (!ex) {
      return { success: false, error: `Intake exception '${exceptionId}' not found.` };
    }
    if (ex.institution_id !== institutionId) {
      return { success: false, error: 'Unauthorized: Cannot submit explanation for another institution.' };
    }

    const now = new Date().toISOString();
    // CRITICAL Requirement 3: The response must not automatically approve the exception.
    ex.status = 'explanation_submitted';
    ex.institution_response = explanation.trim();
    ex.responded_at = now;
    ex.responded_by = actorEmail;
    ex.updated_at = now;

    // Update corresponding inbox item
    const inboxItem = (this.state.inboxItems || []).find(i => i.reference_id === exceptionId && i.type === 'intake_inquiry');
    if (inboxItem) {
      inboxItem.status = 'under_review';
      inboxItem.institution_response = explanation.trim();
      inboxItem.responded_at = now;
      inboxItem.responded_by = actorEmail;
      inboxItem.updated_at = now;
    }

    // Audit Log
    this.state.auditLogs.unshift({
      id: 'audit-' + Math.floor(1000 + Math.random() * 9000),
      actor_id: '00000000-0000-0000-0000-000000000002',
      actor_email: actorEmail,
      actor_role: 'institution_admin',
      institution_id: institutionId,
      action: 'INTAKE_EXPLANATION_SUBMITTED',
      entity_type: 'intake_exceptions',
      entity_id: ex.id,
      new_values: {
        explanation: explanation.slice(0, 100),
      },
      created_at: now,
    });

    this.saveToStorage();
    return { success: true, data: ex };
  }

  public rejectIntakeException(
    exceptionId: string,
    reason: string,
    reviewerEmail = 'aicte.admin@demo.aicte.gov.in'
  ): { success: boolean; data?: IntakeException; error?: string } {
    const ex = (this.state.intakeExceptions || []).find(e => e.id === exceptionId);
    if (!ex) {
      return { success: false, error: `Intake exception '${exceptionId}' not found.` };
    }

    const now = new Date().toISOString();
    ex.status = 'rejected';
    ex.resolution = `AICTE Decision: REJECTED. Reason: ${reason.trim()}`;
    ex.reviewed_by = reviewerEmail;
    ex.reviewed_at = now;
    ex.updated_at = now;

    // Update existing inbox item or create one
    const existingRejectInbox = (this.state.inboxItems || []).find(
      i => i.reference_id === ex.id && i.type === 'intake_inquiry'
    );
    if (existingRejectInbox) {
      existingRejectInbox.status = 'completed';
      existingRejectInbox.aicte_message = `AICTE Decision: Excess enrolment exception rejected. ${reason.trim()}`;
      existingRejectInbox.updated_at = now;
      if (existingRejectInbox.metadata) {
        existingRejectInbox.metadata.decision = 'rejected';
        existingRejectInbox.metadata.next_action = 'Enforce intake cap and regularize excess enrolments as directed by AICTE';
      }
    } else {
      this.createInboxItem({
        institution_id: ex.institution_id,
        type: 'intake_inquiry',
        title: `Intake Exception Rejected: ${ex.programme} (${ex.academic_year})`,
        reference_id: ex.id,
        reference_type: 'intake_exception',
        status: 'completed',
        aicte_message: `AICTE Decision: Excess enrolment exception rejected. ${reason.trim()}`,
        metadata: {
          exception_id: ex.id,
          programme: ex.programme,
          academic_year: ex.academic_year,
          excess: ex.excess,
          decision: 'rejected',
          next_action: 'Enforce intake cap and regularize excess enrolments as directed by AICTE',
        },
      });
    }

    // Audit Log
    this.state.auditLogs.unshift({
      id: 'audit-' + Math.floor(1000 + Math.random() * 9000),
      actor_id: '00000000-0000-0000-0000-000000000001',
      actor_email: reviewerEmail,
      actor_role: 'aicte_admin',
      institution_id: ex.institution_id,
      action: 'INTAKE_EXCEPTION_REJECTED',
      entity_type: 'intake_exceptions',
      entity_id: ex.id,
      new_values: {
        reason: reason.trim(),
        programme: ex.programme,
      },
      created_at: now,
    });

    this.saveToStorage();
    return { success: true, data: ex };
  }

  public approveIntakeDispensation(
    exceptionId: string,
    notes = 'Approved under special AICTE council dispensation.',
    reviewerEmail = 'aicte.admin@demo.aicte.gov.in'
  ): { success: boolean; data?: IntakeException; error?: string } {
    const ex = (this.state.intakeExceptions || []).find(e => e.id === exceptionId);
    if (!ex) {
      return { success: false, error: `Intake exception '${exceptionId}' not found.` };
    }

    const now = new Date().toISOString();
    ex.status = 'approved';
    ex.resolution = notes.trim();
    ex.reviewed_by = reviewerEmail;
    ex.reviewed_at = now;
    ex.updated_at = now;

    // Update existing inbox item or create one
    const existingApproveInbox = (this.state.inboxItems || []).find(
      i => i.reference_id === ex.id && i.type === 'intake_inquiry'
    );
    if (existingApproveInbox) {
      existingApproveInbox.status = 'completed';
      existingApproveInbox.aicte_message = `AICTE Decision: Intake dispensation approved. ${notes.trim()}`;
      existingApproveInbox.updated_at = now;
      if (existingApproveInbox.metadata) {
        existingApproveInbox.metadata.decision = 'approved';
        existingApproveInbox.metadata.next_action = 'No action required. Special dispensation registered.';
      }
    } else {
      this.createInboxItem({
        institution_id: ex.institution_id,
        type: 'intake_inquiry',
        title: `Intake Exception Approved: ${ex.programme} (${ex.academic_year})`,
        reference_id: ex.id,
        reference_type: 'intake_exception',
        status: 'completed',
        aicte_message: `AICTE Decision: Intake dispensation approved. ${notes.trim()}`,
        metadata: {
          exception_id: ex.id,
          programme: ex.programme,
          academic_year: ex.academic_year,
          excess: ex.excess,
          decision: 'approved',
          next_action: 'No action required. Special dispensation registered.',
        },
      });
    }

    // Audit Log
    this.state.auditLogs.unshift({
      id: 'audit-' + Math.floor(1000 + Math.random() * 9000),
      actor_id: '00000000-0000-0000-0000-000000000001',
      actor_email: reviewerEmail,
      actor_role: 'aicte_admin',
      institution_id: ex.institution_id,
      action: 'INTAKE_EXCEPTION_APPROVED',
      entity_type: 'intake_exceptions',
      entity_id: ex.id,
      new_values: {
        notes: notes.trim(),
        programme: ex.programme,
      },
      created_at: now,
    });

    this.saveToStorage();
    return { success: true, data: ex };
  }

  public getAuditLogs(): AuditLog[] {
    return [...this.state.auditLogs];
  }

  // -------------------------------------------------------------
  // Dashboard & Analytics Aggregations
  // -------------------------------------------------------------
  public getDashboardStats(): {
    total_institutions: number;
    total_enrolments: number;
    approved_enrolments: number;
    pending_submissions: number;
    apaar_verified: number;
    apaar_missing: number;
    potential_duplicates: number;
    intake_exceptions: number;
  } {
    const total_institutions = this.state.institutions.length;
    const total_enrolments = this.state.enrolments.length;
    // Only approved batches count towards approved enrolments
    const approved_enrolments = this.state.enrolments.filter(e => e.submission_status === 'approved').length;
    const pending_submissions = this.state.batches.filter(b => b.status === 'submitted' || b.status === 'under_review').length;
    const apaar_verified = this.state.enrolments.filter(e => e.student?.apaar_verification_status === 'verified').length;
    const apaar_missing = this.state.enrolments.filter(
      e => !e.student?.apaar_id || e.student?.apaar_verification_status === 'unverified'
    ).length;
    const potential_duplicates = this.state.duplicateCases.filter(c => c.review_status === 'pending').length;

    let intake_exceptions = 0;
    for (const prog of this.state.programmes) {
      const intake = this.state.intakes.find(i => i.programme_id === prog.id && i.status === 'active');
      if (intake) {
        const enrolledCount = this.state.enrolments.filter(e => e.programme_id === prog.id && e.enrolment_status === 'active').length;
        if (enrolledCount > (intake.approved_intake + intake.total_supernumerary)) {
          intake_exceptions++;
        }
      }
    }

    return {
      total_institutions,
      total_enrolments,
      approved_enrolments,
      pending_submissions,
      apaar_verified,
      apaar_missing,
      potential_duplicates,
      intake_exceptions,
    };
  }

  public getApaarPieData(): { name: string; value: number; color: string }[] {
    let verified = 0;
    let pending = 0;
    let invalid = 0;
    let notProvided = 0;

    for (const enr of this.state.enrolments) {
      const status = enr.student?.apaar_verification_status;
      if (!enr.student?.apaar_id || status === 'unverified') {
        notProvided++;
      } else if (status === 'verified') {
        verified++;
      } else if (status === 'pending') {
        pending++;
      } else if (status === 'invalid') {
        invalid++;
      } else {
        notProvided++;
      }
    }

    return [
      { name: 'Verified', value: verified, color: '#22c55e' },
      { name: 'Pending', value: pending, color: '#f59e0b' },
      { name: 'Invalid', value: invalid, color: '#ef4444' },
      { name: 'Not Provided', value: notProvided, color: '#94a3b8' },
    ];
  }

  public getProgrammeBarsData(): { name: string; approved: number; enrolled: number }[] {
    const codes = ['BTECH-CS', 'BTECH-EC', 'BTECH-ME', 'MBA', 'MCA'];
    return codes.map(code => {
      const progs = this.state.programmes.filter(p => p.code === code);
      const progIds = new Set(progs.map(p => p.id));
      const totalApproved = this.state.intakes
        .filter(i => progIds.has(i.programme_id) && i.status === 'active')
        .reduce((sum, i) => sum + i.approved_intake, 0);
      const totalEnrolled = this.state.enrolments
        .filter(e => progIds.has(e.programme_id) && e.enrolment_status === 'active')
        .length;

      const label = code === 'BTECH-CS' ? 'B.Tech CS' : (code === 'BTECH-EC' ? 'B.Tech EC' : (code === 'BTECH-ME' ? 'B.Tech ME' : code));
      return {
        name: label,
        approved: totalApproved,
        enrolled: totalEnrolled,
      };
    });
  }

  public getInstitutionSummary(institutionId: string = DEMO_INSTITUTION_ID) {
    const inst = this.state.institutions.find(i => i.id === institutionId) ?? this.state.institutions[0];
    const actualInstId = inst ? inst.id : institutionId;

    const instBatches = this.state.batches.filter(b => b.institution_id === actualInstId);
    const instEnrolments = this.state.enrolments.filter(e => e.institution_id === actualInstId);
    const csProg = this.state.programmes.find(p => p.institution_id === actualInstId && p.code === 'BTECH-CS');
    const secondProg = this.state.programmes.find(p => p.institution_id === actualInstId && p.code !== 'BTECH-CS')
      ?? this.state.programmes.find(p => p.institution_id === actualInstId);

    const csIntake = csProg ? this.state.intakes.find(i => i.programme_id === csProg.id) : undefined;
    const secondIntake = secondProg ? this.state.intakes.find(i => i.programme_id === secondProg.id) : undefined;

    const csEnrolled = csProg ? instEnrolments.filter(e => e.programme_id === csProg.id).length : 0;
    const secondEnrolled = secondProg ? instEnrolments.filter(e => e.programme_id === secondProg.id).length : 0;
    const csSupernumerary = csProg
      ? instEnrolments.filter(e => e.programme_id === csProg.id && e.supernumerary_classification && e.supernumerary_classification !== 'none').length
      : 0;

    const verifiedCount = instEnrolments.filter(e => e.student?.apaar_verification_status === 'verified').length;
    const verifiedPct = instEnrolments.length > 0 ? Math.round((verifiedCount / instEnrolments.length) * 100) : 0;

    return {
      institutionId: inst?.id ?? actualInstId,
      institutionName: inst?.name ?? 'Shri Ram Institute of Technology (DEMO)',
      aicteId: inst?.aicte_id ?? '1-SRIT2024',
      city: inst?.city ?? 'Mumbai',
      state: inst?.state ?? 'Maharashtra',
      type: inst?.type ? inst.type.replace(/_/g, ' ') : 'autonomous college',
      totalBatches: instBatches.length,
      submittedBatches: instBatches.filter(b => b.status === 'submitted' || b.status === 'under_review').length,
      approvedBatches: instBatches.filter(b => b.status === 'approved').length,
      totalEnrolments: instEnrolments.length,
      verifiedCount,
      verifiedPct,
      csProgrammeName: csProg ? csProg.name : 'Engineering Programme',
      csApproved: csIntake?.approved_intake ?? 120,
      csEnrolled,
      csSupernumerary,
      secondProgrammeName: secondProg ? secondProg.name : 'Management Programme',
      secondApproved: secondIntake?.approved_intake ?? 60,
      secondEnrolled,
      mbaApproved: secondIntake?.approved_intake ?? 60,
      mbaEnrolled: secondEnrolled,
    };
  }


  // ===========================================================================
  // Institution Correction Request & Resolution Workflow
  // ===========================================================================

  public getCorrectionRequests(institutionId?: string, status?: CorrectionRequestStatus): CorrectionRequest[] {
    const enrich = (req: CorrectionRequest): CorrectionRequest => {
      const enr = this.state.enrolments.find(e => e.id === req.enrolment_id);
      const student = enr?.student || this.state.students.find(s => s.id === req.student_id);
      const inst = this.state.institutions.find(i => i.id === req.institution_id);
      const prog = enr ? this.state.programmes.find(p => p.id === enr.programme_id) : undefined;

      const enrichedEnr = enr ? {
        ...enr,
        student,
        institution: inst || enr.institution,
        programme: prog || enr.programme,
      } : undefined;

      return {
        ...req,
        enrolment: enrichedEnr,
        student,
        institution: inst,
      };
    };

    let list = this.state.correctionRequests;
    if (institutionId) {
      list = list.filter(r => r.institution_id === institutionId);
    }
    if (status) {
      list = list.filter(r => r.status === status);
    }

    return list.map(enrich);
  }

  public getCorrectionRequest(requestId: string, institutionId?: string): CorrectionRequest | undefined {
    const all = this.getCorrectionRequests(institutionId);
    return all.find(r => r.id === requestId);
  }

  public createCorrectionRequest(
    input: CreateCorrectionRequestInput,
    creatorEmail = 'aicte.admin@demo.aicte.gov.in'
  ): { success: boolean; data?: CorrectionRequest; error?: string } {
    if (!input.enrolment_id) {
      return { success: false, error: 'Enrolment ID is required.' };
    }
    if (!input.issue_description || !input.issue_description.trim()) {
      return { success: false, error: 'Issue description is required.' };
    }

    const enr = this.state.enrolments.find(e => e.id === input.enrolment_id);
    if (!enr) {
      return { success: false, error: `Enrolment record '${input.enrolment_id}' not found.` };
    }

    // Check for duplicate active request on same enrolment & category
    const existing = this.state.correctionRequests.find(
      r => r.enrolment_id === input.enrolment_id &&
           r.category === input.category &&
           r.status !== 'resolved' &&
           r.status !== 'closed'
    );
    if (existing) {
      return { success: true, data: existing };
    }

    const nextNum = this.state.correctionRequests.length + 1;
    const reqId = `cr-${String(nextNum).padStart(4, '0')}`;

    const newReq: CorrectionRequest = {
      id: reqId,
      institution_id: enr.institution_id,
      enrolment_id: enr.id,
      student_id: enr.student_id,
      case_id: input.case_id,
      batch_id: input.batch_id || enr.batch_id,
      category: input.category,
      issue_description: input.issue_description.trim(),
      requested_fields: input.requested_fields && input.requested_fields.length > 0 ? input.requested_fields : ['apaar_id'],
      priority: input.priority || 'medium',
      status: 'awaiting_institution',
      created_by: creatorEmail,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      history: [
        {
          id: 'hist-' + Math.floor(1000 + Math.random() * 9000),
          actor_email: creatorEmail,
          actor_role: 'aicte_admin',
          action: 'created',
          comment: input.issue_description.trim(),
          created_at: new Date().toISOString(),
        },
      ],
    };

    this.state.correctionRequests.unshift(newReq);

    // Sync actionable inbox item for the institution
    this.createInboxItem({
      institution_id: enr.institution_id,
      type: 'correction_request',
      title: `Record Correction: ${input.category.replace(/_/g, ' ')} (${enr.programme_id})`,
      reference_id: newReq.id,
      reference_type: 'correction_request',
      status: 'awaiting_action',
      aicte_message: input.issue_description.trim(),
      metadata: {
        correction_id: newReq.id,
        enrolment_id: enr.id,
        student_id: enr.student_id,
        category: input.category,
        priority: input.priority,
        requested_fields: newReq.requested_fields,
        next_action: 'Submit corrected student information',
      },
    });

    // Audit Event
    this.state.auditLogs.unshift({
      id: 'audit-' + Math.floor(1000 + Math.random() * 9000),
      actor_id: '00000000-0000-0000-0000-000000000001',
      actor_email: creatorEmail,
      actor_role: 'aicte_admin',
      institution_id: enr.institution_id,
      action: 'CORRECTION_REQUEST_CREATED',
      entity_type: 'correction_requests',
      entity_id: newReq.id,
      new_values: {
        category: newReq.category,
        priority: newReq.priority,
        enrolment_id: newReq.enrolment_id,
        student_id: newReq.student_id,
      },
      created_at: new Date().toISOString(),
    });

    this.saveToStorage();
    return { success: true, data: newReq };
  }

  public submitInstitutionCorrectionResponse(
    requestId: string,
    institutionId: string,
    responseNote: string,
    proposedChanges?: any,
    actorEmail = 'principal@srit.ac.in'
  ): { success: boolean; data?: CorrectionRequest; error?: string } {
    const req = this.state.correctionRequests.find(r => r.id === requestId);
    if (!req) {
      return { success: false, error: `Correction request '${requestId}' not found.` };
    }

    // Strict Tenant Check
    if (req.institution_id !== institutionId) {
      return { success: false, error: 'Unauthorized: Cannot respond to request addressed to another institution.' };
    }

    // State transition validation
    if (req.status !== 'awaiting_institution' && req.status !== 'open' && req.status !== 'returned_for_correction') {
      return { success: false, error: `Cannot submit response in '${req.status}' state.` };
    }

    req.institution_response = responseNote.trim();
    req.proposed_changes = proposedChanges;
    req.status = 'submitted_for_review';

    // Synchronize corresponding inbox item
    const crInboxItem = (this.state.inboxItems || []).find(i => i.reference_id === req.id && i.type === 'correction_request');
    if (crInboxItem) {
      crInboxItem.status = 'under_review';
      crInboxItem.institution_response = responseNote.trim();
      crInboxItem.responded_at = new Date().toISOString();
      crInboxItem.responded_by = actorEmail;
      crInboxItem.updated_at = new Date().toISOString();
    }
    req.updated_at = new Date().toISOString();

    req.history.push({
      id: 'hist-' + Math.floor(1000 + Math.random() * 9000),
      actor_email: actorEmail,
      actor_role: 'institution_admin',
      action: 'submitted_for_review',
      comment: responseNote.trim(),
      proposed_changes: proposedChanges,
      created_at: new Date().toISOString(),
    });

    // Audit Log
    const maskedApaar = proposedChanges?.apaar_id ? maskSensitiveApaar(proposedChanges.apaar_id) : undefined;
    this.state.auditLogs.unshift({
      id: 'audit-' + Math.floor(1000 + Math.random() * 9000),
      actor_id: '00000000-0000-0000-0000-000000000002',
      actor_email: actorEmail,
      actor_role: 'institution_admin',
      institution_id: institutionId,
      action: 'CORRECTION_REQUEST_SUBMITTED_FOR_REVIEW',
      entity_type: 'correction_requests',
      entity_id: req.id,
      new_values: {
        summary: responseNote.slice(0, 100),
        has_proposed_changes: !!proposedChanges,
        masked_apaar: maskedApaar,
      },
      created_at: new Date().toISOString(),
    });

    this.saveToStorage();
    return { success: true, data: req };
  }

  public resolveCorrectionRequest(
    requestId: string,
    decision: 'accept' | 'return' | 'close',
    reviewerNotes: string,
    reviewerEmail = 'aicte.admin@demo.aicte.gov.in'
  ): { success: boolean; data?: CorrectionRequest; error?: string } {
    const req = this.state.correctionRequests.find(r => r.id === requestId);
    if (!req) {
      return { success: false, error: `Correction request '${requestId}' not found.` };
    }

    if (req.status === 'resolved' || req.status === 'closed') {
      return { success: false, error: `Request '${requestId}' is already in terminal state '${req.status}'.` };
    }

    const now = new Date().toISOString();
    let auditAction = 'CORRECTION_REQUEST_RESOLVED';

    if (decision === 'accept') {
      req.status = 'resolved';

      const resolvedInboxItem = (this.state.inboxItems || []).find(i => i.reference_id === req.id && i.type === 'correction_request');
      if (resolvedInboxItem) {
        resolvedInboxItem.status = 'completed';
        resolvedInboxItem.aicte_message = `AICTE Decision: APPROVED. ${reviewerNotes.trim()}`;
        resolvedInboxItem.updated_at = now;
      }
      req.resolved_at = now;
      req.resolved_by = reviewerEmail;
      req.resolution_notes = reviewerNotes.trim();

      // Safely apply approved changes
      if (req.proposed_changes) {
        const student = this.state.students.find(s => s.id === req.student_id);
        if (student) {
          if (req.proposed_changes.apaar_id) {
            const cleanApaar = String(req.proposed_changes.apaar_id).replace(/\s+/g, '');
            student.apaar_id = cleanApaar;
            student.apaar_verification_status = cleanApaar.length === 12 ? 'verified' : 'invalid';
          }
          if (req.proposed_changes.full_name) {
            student.full_name = req.proposed_changes.full_name.trim();
          }
        }
      }

      req.history.push({
        id: 'hist-' + Math.floor(1000 + Math.random() * 9000),
        actor_email: reviewerEmail,
        actor_role: 'aicte_admin',
        action: 'resolved',
        comment: `AICTE accepted correction: ${reviewerNotes.trim()}`,
        created_at: now,
      });
      auditAction = 'CORRECTION_REQUEST_RESOLVED';
    } else if (decision === 'return') {
      req.status = 'returned_for_correction';
      req.history.push({
        id: 'hist-' + Math.floor(1000 + Math.random() * 9000),
        actor_email: reviewerEmail,
        actor_role: 'aicte_admin',
        action: 'returned_for_correction',
        comment: `AICTE returned for further correction: ${reviewerNotes.trim()}`,
        created_at: now,
      });
      auditAction = 'CORRECTION_REQUEST_RETURNED';
    } else if (decision === 'close') {
      req.status = 'closed';
      req.resolved_at = now;
      req.resolved_by = reviewerEmail;
      req.resolution_notes = reviewerNotes.trim();
      req.history.push({
        id: 'hist-' + Math.floor(1000 + Math.random() * 9000),
        actor_email: reviewerEmail,
        actor_role: 'aicte_admin',
        action: 'closed',
        comment: `AICTE closed request: ${reviewerNotes.trim()}`,
        created_at: now,
      });
      auditAction = 'CORRECTION_REQUEST_CLOSED';
    }

    req.updated_at = now;

    // Audit log
    this.state.auditLogs.unshift({
      id: 'audit-' + Math.floor(1000 + Math.random() * 9000),
      actor_id: '00000000-0000-0000-0000-000000000001',
      actor_email: reviewerEmail,
      actor_role: 'aicte_admin',
      institution_id: req.institution_id,
      action: auditAction,
      entity_type: 'correction_requests',
      entity_id: req.id,
      new_values: {
        decision,
        notes: reviewerNotes.slice(0, 100),
      },
      created_at: now,
    });

    this.saveToStorage();
    return { success: true, data: req };
  }

  public getCorrectionRequestStats(institutionId?: string) {
    const list = institutionId
      ? this.state.correctionRequests.filter(r => r.institution_id === institutionId)
      : this.state.correctionRequests;

    return {
      total: list.length,
      awaiting_institution: list.filter(r => r.status === 'awaiting_institution' || r.status === 'open').length,
      submitted_for_review: list.filter(r => r.status === 'submitted_for_review').length,
      returned_for_correction: list.filter(r => r.status === 'returned_for_correction').length,
      resolved: list.filter(r => r.status === 'resolved').length,
      closed: list.filter(r => r.status === 'closed').length,
    };
  }

  public getReportsData() {
    // Generate detailed institution x programme metrics across all 12 institutions
    const instEnrolments = this.state.institutions.flatMap(inst => {
      const instProgs = this.state.programmes.filter(p => p.institution_id === inst.id);
      return instProgs.map(prog => {
        const intake = this.state.intakes.find(i => i.programme_id === prog.id && i.status === 'active');
        const enrs = this.state.enrolments.filter(e => e.institution_id === inst.id && e.programme_id === prog.id);
        const supernumerary = enrs.filter(e => e.supernumerary_classification && e.supernumerary_classification !== 'none').length;
        const nri = enrs.filter(e => e.is_nri).length;
        const oci = enrs.filter(e => e.is_oci).length;
        const fn = enrs.filter(e => e.is_foreign_national).length;

        const cleanInstName = inst.name.replace(' (DEMO)', '').replace('Shri Ram Institute of Technology', 'SRIT Mumbai');
        const progLabel = prog.name.split(' ')[0] + ' ' + prog.code.replace('BTECH-', '');

        return {
          institution: cleanInstName,
          programme: progLabel,
          approved_intake: intake?.approved_intake ?? 60,
          enrolled: enrs.length,
          supernumerary,
          nri,
          oci,
          fn,
        };
      });
    });

    const approvedCount = this.state.batches.filter(b => b.status === 'approved').length;
    const pendingCount = this.state.batches.filter(b => b.status === 'submitted' || b.status === 'under_review').length;
    const returnedCount = this.state.batches.filter(b => b.status === 'returned_for_correction').length;
    const draftCount = this.state.batches.filter(b => b.status === 'draft').length;

    const pieData = [
      { name: 'Approved', value: approvedCount > 0 ? approvedCount : 1, color: '#22c55e' },
      { name: 'Pending', value: pendingCount > 0 ? pendingCount : 1, color: '#f59e0b' },
      { name: 'Returned', value: returnedCount, color: '#ef4444' },
      { name: 'Draft', value: draftCount, color: '#94a3b8' },
    ];

    return { instEnrolments, pieData };
  }
}

export const demoStore = new DemoStore();
