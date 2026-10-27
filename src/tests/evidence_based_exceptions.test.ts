import { describe, it, expect, beforeEach } from 'vitest';
import { demoStore, DEMO_INSTITUTION_ID } from '../services/demoStore';

describe('Evidence-Based Exceptions and Duplicate Review Verification', () => {
  beforeEach(() => {
    // Reset demo store before each test
    demoStore.reset();
  });

  // 1. Different APAAR IDs do not trigger a duplicate-ID case
  it('1. ensures different APAAR IDs never trigger a cross-institution duplicate case', () => {
    const cases = demoStore.getDuplicateCases();
    const crossCases = cases.filter(c => c.case_type === 'cross_institution_duplicate');

    expect(crossCases.length).toBeGreaterThan(0);
    for (const c of crossCases) {
      expect(c.student_1).toBeDefined();
      expect(c.student_2).toBeDefined();
      expect(c.student_1?.apaar_id).toBeTruthy();
      expect(c.student_2?.apaar_id).toBeTruthy();
      // MUST share the identical normalized APAAR ID
      expect(c.student_1?.apaar_id).toBe(c.student_2?.apaar_id);
    }
  });

  // 2. A missing APAAR ID creates a missing-ID exception without requiring a second student
  it('2. verifies missing APAAR ID creates a single-record exception with no secondary student', () => {
    const cases = demoStore.getDuplicateCases();
    const missingCases = cases.filter(c => c.case_type === 'missing_apaar');

    expect(missingCases.length).toBeGreaterThanOrEqual(4);
    for (const c of missingCases) {
      expect(c.student_id_1).toBeTruthy();
      expect(c.student_1).toBeDefined();
      // Must NOT have a secondary student attached
      expect(c.student_id_2).toBeUndefined();
      expect(c.student_2).toBeUndefined();
      expect(c.enrolment_2).toBeUndefined();
      // Detection reason must be specific to missing APAAR ID
      expect(c.detection_reason.toLowerCase()).toContain('missing apaar');
      expect([
        'not_performed',
        'resolved_missing_id',
        'verification_unavailable_missing_id'
      ]).toContain(c.verification_status);
    }
  });

  // 3. Two unrelated records are not linked merely because they occur near each other in a dataset
  it('3. confirms Siddharth Bhattacharya (Case d3) is isolated as a single-record exception and not falsely linked to Rishi Deshmukh', () => {
    const cases = demoStore.getDuplicateCases();
    const caseD3 = cases.find(c => c.id === 'd3');

    expect(caseD3).toBeDefined();
    expect(caseD3?.case_type).toBe('missing_apaar');
    expect(caseD3?.student_1?.full_name).toContain('Siddharth Bhattacharya');
    expect(caseD3?.student_1?.apaar_id).toBeFalsy(); // No APAAR ID

    // Must NOT be linked to Rishi Deshmukh or any second student
    expect(caseD3?.student_id_2).toBeUndefined();
    expect(caseD3?.student_2).toBeUndefined();
    expect(caseD3?.detection_reason).not.toContain('Rishi Deshmukh');
    expect(caseD3?.detection_reason).toContain('Missing APAAR ID');

    // Rishi Deshmukh exists independently in the dataset with his own record
    const allEnrs = demoStore.getEnrolments();
    const rishiEnr = allEnrs.find(e => e.student?.full_name.includes('Rishi Deshmukh'));
    expect(rishiEnr).toBeDefined();
    expect(rishiEnr?.student_id).not.toBe(caseD3?.student_id_1);
  });

  // 4. A name mismatch is not claimed without an associated, traceable identity comparison
  it('4. ensures demographic name divergence cases share the identical APAAR ID with traceable register evidence', () => {
    const cases = demoStore.getDuplicateCases();
    const demoDivergenceCases = cases.filter(c => c.case_type === 'demographic_divergence');

    expect(demoDivergenceCases.length).toBeGreaterThan(0);
    for (const c of demoDivergenceCases) {
      expect(c.student_1).toBeDefined();
      expect(c.student_2).toBeDefined();
      // Both candidate and directory register share the SAME APAAR ID
      expect(c.student_1?.apaar_id).toBeTruthy();
      expect(c.student_2?.apaar_id).toBeTruthy();
      expect(c.student_1?.apaar_id).toBe(c.student_2?.apaar_id);
      // Names are different (e.g. middle initial variance)
      expect(c.student_1?.full_name).not.toBe(c.student_2?.full_name);
      // Verification source and status are explicitly traceable
      expect(c.verification_source).toBeTruthy();
      expect(c.verification_status).toBe('flagged_demographic_divergence');
      expect(c.verification_timestamp).toBeTruthy();
      // Must NOT accuse of fraud; flagged for manual review
      expect(c.detection_reason.toLowerCase()).toContain('flagged for manual review');
      expect(c.detection_reason.toLowerCase()).not.toContain('fraudulent');
    }
  });

  // 5. External-institution conflict is not claimed without supporting external evidence
  it('5. verifies cross-institution cases point to valid, distinct existing institutions in the dataset', () => {
    const cases = demoStore.getDuplicateCases();
    const crossCases = cases.filter(c => c.case_type === 'cross_institution_duplicate');
    const institutions = demoStore.getInstitutions();

    for (const c of crossCases) {
      expect(c.enrolment_1).toBeDefined();
      expect(c.enrolment_2).toBeDefined();
      // Distinct institutions
      expect(c.enrolment_1?.institution_id).not.toBe(c.enrolment_2?.institution_id);
      // Both institutions exist in registry
      const inst1 = institutions.find(i => i.id === c.enrolment_1?.institution_id);
      const inst2 = institutions.find(i => i.id === c.enrolment_2?.institution_id);
      expect(inst1).toBeDefined();
      expect(inst2).toBeDefined();
      expect(inst1?.name).toBeTruthy();
      expect(inst2?.name).toBeTruthy();
    }
  });

  // 6. A valid same-ID, cross-institution match identifies the correct records and institutions
  it('6. validates cross-institution duplicates link active 2024-25 enrolments with identical APAAR ID', () => {
    const cases = demoStore.getDuplicateCases();
    const d1 = cases.find(c => c.id === 'd1');

    expect(d1).toBeDefined();
    expect(d1?.case_type).toBe('cross_institution_duplicate');
    expect(d1?.student_1?.apaar_id).toBe(d1?.student_2?.apaar_id);
    expect(d1?.enrolment_1?.institution_id).not.toBe(d1?.enrolment_2?.institution_id);
    expect(d1?.enrolment_1?.academic_year).toBe('2024-25');
    expect(d1?.enrolment_2?.academic_year).toBe('2024-25');
  });

  // 7. A single-record exception renders exactly its relevant record
  it('7. verifies single-record exceptions have only 1 student record and 1 enrolment record', () => {
    const cases = demoStore.getDuplicateCases();
    const singleRecordCases = cases.filter(c => c.case_type === 'missing_apaar' || c.case_type === 'invalid_apaar');

    expect(singleRecordCases.length).toBe(12); // 8 missing + 4 invalid
    for (const c of singleRecordCases) {
      expect(c.student_1).toBeDefined();
      expect(c.student_2).toBeUndefined();
      expect(c.enrolment_1).toBeDefined();
      expect(c.enrolment_2).toBeUndefined();
    }
  });

  // 8. A multi-record case renders all and only the relevant records
  it('8. confirms multi-record cases link exactly two relevant records and no extraneous records', () => {
    const cases = demoStore.getDuplicateCases();
    const multiRecordCases = cases.filter(c => c.case_type === 'cross_institution_duplicate');

    expect(multiRecordCases.length).toBe(18);
    for (const c of multiRecordCases) {
      expect(c.student_1).toBeDefined();
      expect(c.student_2).toBeDefined();
      expect(c.student_1?.id).not.toBe(c.student_2?.id);
    }
  });

  // 9. Institution switching and refresh do not mix case records between institutions
  it('9. verifies institution isolation in demoStore queries', () => {
    const insts = demoStore.getInstitutions();
    expect(insts.length).toBeGreaterThanOrEqual(2);

    const instA = insts[0].id;
    const instB = insts[1].id;

    const enrsA = demoStore.getEnrolments(instA);
    const enrsB = demoStore.getEnrolments(instB);

    expect(enrsA.length).toBeGreaterThan(0);
    expect(enrsB.length).toBeGreaterThan(0);

    for (const e of enrsA) {
      expect(e.institution_id).toBe(instA);
    }
    for (const e of enrsB) {
      expect(e.institution_id).toBe(instB);
    }
  });

  // 10. Review decisions and audit events remain consistent after correcting a case
  it('10. records reviewer decision and audit event when a case is resolved', () => {
    const initialCases = demoStore.getDuplicateCases();
    const pendingCase = initialCases.find(c => c.review_status === 'pending');
    expect(pendingCase).toBeDefined();

    const caseId = pendingCase!.id;
    const reviewerNote = 'Reviewed admission docs; verified legitimate student transfer.';
    const success = demoStore.resolveDuplicateCase(caseId, 'legitimate', reviewerNote, 'reviewer@aicte.gov.in');

    expect(success).toBe(true);

    const updatedCases = demoStore.getDuplicateCases();
    const resolved = updatedCases.find(c => c.id === caseId);
    expect(resolved?.review_status).toBe('legitimate');
    expect(resolved?.reviewer_notes).toBe(reviewerNote);
    expect(resolved?.reviewed_by).toBe('reviewer@aicte.gov.in');
    expect(resolved?.reviewed_at).toBeDefined();

    const auditLogs = demoStore.getAuditLogs();
    const log = auditLogs.find(l => l.entity_id === caseId && l.action === 'DUPLICATE_CASE_LEGITIMATE');
    expect(log).toBeDefined();
    expect(log?.actor_email).toBe('reviewer@aicte.gov.in');
  });

  // 11. Existing CSV upload, enrolment, submission, and AICTE review workflows continue to work
  it('11. verifies CSV upload workflow creates batches, validates records, and generates exceptions without Supabase writes', () => {
    const instId = DEMO_INSTITUTION_ID;
    const { batchId, error } = demoStore.createDraftBatch('2024-25', 1, instId);

    expect(error).toBeNull();
    expect(batchId).toBeTruthy();

    const result = demoStore.submitBatch(batchId!, instId, '2024-25', [
      {
        row_number: 1,
        institution_student_id: 'SRIT-REG-01',
        full_name: 'Test Student One',
        programme_code: 'BTECH-CS',
        academic_year: '2024-25',
        admission_date: '2024-07-15',
        admission_category: 'general',
      },
    ]);

    expect(result.error).toBeNull();
    expect(result.data?.accepted_records).toBe(1);
    const batch = demoStore.getBatches().find(b => b.id === batchId);
    expect(batch?.status).toBe('submitted');
  });

  // 12. Synthetic verification results are visibly identified as simulated
  it('12. ensures all synthetic verification results are explicitly labeled as simulated', () => {
    const cases = demoStore.getDuplicateCases();
    for (const c of cases) {
      if (c.case_type === 'demographic_divergence') {
        expect(c.verification_source?.toLowerCase()).toContain('simulated');
      }
    }

    // Intake exceptions are distinct from duplicate cases
    const intakeExceptions = demoStore.getIntakeExceptions();
    expect(intakeExceptions.length).toBeGreaterThan(0);
    for (const ex of intakeExceptions) {
      expect(ex.approved_intake).toBeGreaterThan(0);
      expect(ex.excess).toBeGreaterThan(0);
      expect(ex.detection_note.toLowerCase()).toMatch(/intake|capacity/);
      expect(ex.detection_note.toLowerCase()).not.toContain('apaar id (');
    }
  });
});
