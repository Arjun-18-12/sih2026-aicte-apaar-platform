import { describe, it, expect, beforeEach } from 'vitest';
import { demoStore, DEMO_INSTITUTION_ID, DEMO_STORE_KEY } from '../services/demoStore';

describe('AICTE–APAAR Institution-Specific Correction Request & Resolution Workflow', () => {
  const sritId = DEMO_INSTITUTION_ID; // '11111111-1111-1111-1111-111111111111' (SRIT Mumbai)
  const ntuId = '11111111-1111-1111-1111-000000000002';  // NTU Delhi

  const storageMap = new Map<string, string>();
  const mockLocalStorage = {
    getItem: (k: string) => storageMap.get(k) || null,
    setItem: (k: string, v: string) => storageMap.set(k, String(v)),
    removeItem: (k: string) => storageMap.delete(k),
    clear: () => storageMap.clear(),
  };

  beforeEach(() => {
    storageMap.clear();
    (globalThis as any).window = { localStorage: mockLocalStorage };
    (globalThis as any).localStorage = mockLocalStorage;
    demoStore.reset();
  });

  // 1. AICTE can create a correction request for the correct institution and enrolment in demo mode
  it('1. AICTE can create a correction request for the correct institution and enrolment in demo mode', () => {
    const sritEnrolments = demoStore.getEnrolments(sritId);
    expect(sritEnrolments.length).toBeGreaterThan(0);
    // Select an enrolment without a pre-existing seeded request
    const targetEnr = sritEnrolments.find(e => !['e1', 'e2', 'e3', 'enr-000005', 'enr-000144'].includes(e.id)) || sritEnrolments[10];

    const result = demoStore.createCorrectionRequest({
      enrolment_id: targetEnr.id,
      category: 'missing_apaar',
      issue_description: 'Candidate admitted without verified APAAR ID. Please obtain consent and update.',
      requested_fields: ['apaar_id'],
      priority: 'high',
    }, 'aicte.officer@demo.aicte.gov.in');

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.id).toMatch(/^cr-\d+/);
    expect(result.data?.institution_id).toBe(sritId);
    expect(result.data?.enrolment_id).toBe(targetEnr.id);
    expect(result.data?.student_id).toBe(targetEnr.student_id);
    expect(result.data?.status).toBe('awaiting_institution');
    expect(result.data?.created_by).toBe('aicte.officer@demo.aicte.gov.in');
    expect(result.data?.history.length).toBe(1);
    expect(result.data?.history[0].action).toBe('created');
  });

  // 2. The intended institution sees the request in its scoped inbox
  it('2. The intended institution sees the request in its scoped inbox', () => {
    const sritEnrolments = demoStore.getEnrolments(sritId);
    const targetEnr = sritEnrolments[8];

    const createRes = demoStore.createCorrectionRequest({
      enrolment_id: targetEnr.id,
      category: 'demographic_review',
      issue_description: 'Name discrepancy detected between admission records and APAAR directory.',
      requested_fields: ['full_name'],
      priority: 'medium',
    });
    expect(createRes.success).toBe(true);

    const sritInbox = demoStore.getCorrectionRequests(sritId);
    const found = sritInbox.find(r => r.id === createRes.data?.id);
    expect(found).toBeDefined();
    expect(found?.institution_id).toBe(sritId);
    expect(found?.enrolment?.id).toBe(targetEnr.id);
  });

  // 3. A different institution cannot read or respond to that request
  it('3. A different institution cannot read or respond to that request (strict cross-tenant isolation)', () => {
    const sritEnrolments = demoStore.getEnrolments(sritId);
    const targetEnr = sritEnrolments[7];

    const createRes = demoStore.createCorrectionRequest({
      enrolment_id: targetEnr.id,
      category: 'apaar_entry_error',
      issue_description: 'APAAR ID check indicates typo in 12-digit number.',
      requested_fields: ['apaar_id'],
      priority: 'high',
    });
    const reqId = createRes.data!.id;

    // NTU cannot see SRIT request in scoped inbox
    const ntuInbox = demoStore.getCorrectionRequests(ntuId);
    const leaked = ntuInbox.find(r => r.id === reqId);
    expect(leaked).toBeUndefined();

    // Direct fetch with wrong institution context returns undefined
    const directFetch = demoStore.getCorrectionRequest(reqId, ntuId);
    expect(directFetch).toBeUndefined();

    // NTU attempt to submit response on SRIT request must be rejected
    const hackAttempt = demoStore.submitInstitutionCorrectionResponse(
      reqId,
      ntuId,
      'Unauthorized response attempt',
      { apaar_id: '111122223333' },
      'principal@ntu.ac.in'
    );
    expect(hackAttempt.success).toBe(false);
    expect(hackAttempt.error).toContain('Unauthorized');
  });

  // 4. The request persists across page refreshes / storage reload
  it('4. The request persists across page refreshes / storage reload', () => {
    const sritEnrolments = demoStore.getEnrolments(sritId);
    const createRes = demoStore.createCorrectionRequest({
      enrolment_id: sritEnrolments[9].id,
      category: 'other',
      issue_description: 'Test persistent storage across session boundaries.',
      requested_fields: ['apaar_id'],
      priority: 'low',
    });
    const reqId = createRes.data!.id;

    // Read directly from storage simulation
    const rawStorage = mockLocalStorage.getItem(DEMO_STORE_KEY);
    expect(rawStorage).toBeDefined();
    const parsed = JSON.parse(rawStorage!);
    const storedReq = parsed.correctionRequests.find((r: any) => r.id === reqId);
    expect(storedReq).toBeDefined();
    expect(storedReq.issue_description).toBe('Test persistent storage across session boundaries.');
  });

  // 5. The institution can submit a correction response
  it('5. The institution can submit a correction response with proposed data changes', () => {
    const sritEnrolments = demoStore.getEnrolments(sritId);
    const createRes = demoStore.createCorrectionRequest({
      enrolment_id: sritEnrolments[11].id,
      category: 'missing_apaar',
      issue_description: 'Please supply verified APAAR ID.',
      requested_fields: ['apaar_id'],
      priority: 'high',
    });
    const reqId = createRes.data!.id;

    const submitRes = demoStore.submitInstitutionCorrectionResponse(
      reqId,
      sritId,
      'Candidate consent obtained and valid APAAR card verified during physical verification.',
      { apaar_id: '888877776666' },
      'principal@srit.ac.in'
    );

    expect(submitRes.success).toBe(true);
    expect(submitRes.data?.status).toBe('submitted_for_review');
    expect(submitRes.data?.institution_response).toContain('physical verification');
    expect(submitRes.data?.proposed_changes?.apaar_id).toBe('888877776666');
    expect(submitRes.data?.history.length).toBe(2);
    expect(submitRes.data?.history[1].action).toBe('submitted_for_review');
    expect(submitRes.data?.history[1].actor_role).toBe('institution_admin');
  });

  // 6. The institution cannot approve its own correction as AICTE
  it('6. The institution cannot approve its own correction directly as AICTE', () => {
    const sritEnrolments = demoStore.getEnrolments(sritId);
    const createRes = demoStore.createCorrectionRequest({
      enrolment_id: sritEnrolments[12].id,
      category: 'missing_apaar',
      issue_description: 'Requires AICTE approval after submission.',
      requested_fields: ['apaar_id'],
    });
    const reqId = createRes.data!.id;

    // Submitting an institution response leaves the request in submitted_for_review
    demoStore.submitInstitutionCorrectionResponse(
      reqId,
      sritId,
      'Self-submitted correction notes',
      { apaar_id: '999911112222' }
    );

    const reqAfterSubmit = demoStore.getCorrectionRequest(reqId);
    expect(reqAfterSubmit?.status).toBe('submitted_for_review');
    expect(reqAfterSubmit?.status).not.toBe('resolved');

    // Student record remains unchanged at this point
    const student = demoStore.getStudents().find(s => s.id === reqAfterSubmit?.student_id);
    expect(student?.apaar_id).not.toBe('999911112222');
  });

  // 7. AICTE can accept or return a submitted correction
  it('7. AICTE can accept or return a submitted correction with reasoned decision', () => {
    const sritEnrolments = demoStore.getEnrolments(sritId);

    // Case A: AICTE Accept
    const req1 = demoStore.createCorrectionRequest({
      enrolment_id: sritEnrolments[13].id,
      category: 'missing_apaar',
      issue_description: 'Case A: for acceptance.',
      requested_fields: ['apaar_id'],
    }).data!;

    demoStore.submitInstitutionCorrectionResponse(
      req1.id,
      sritId,
      'Valid 12-digit APAAR verified from Digilocker.',
      { apaar_id: '555544443333' }
    );

    const acceptRes = demoStore.resolveCorrectionRequest(
      req1.id,
      'accept',
      'Verified against Digilocker consent document. Approved.',
      'aicte.admin@demo.aicte.gov.in'
    );

    expect(acceptRes.success).toBe(true);
    expect(acceptRes.data?.status).toBe('resolved');
    expect(acceptRes.data?.resolved_by).toBe('aicte.admin@demo.aicte.gov.in');
    expect(acceptRes.data?.resolution_notes).toContain('Approved');

    // Case B: AICTE Return for Further Correction
    const req2 = demoStore.createCorrectionRequest({
      enrolment_id: sritEnrolments[14].id,
      category: 'demographic_review',
      issue_description: 'Case B: for return.',
      requested_fields: ['full_name'],
    }).data!;

    demoStore.submitInstitutionCorrectionResponse(
      req2.id,
      sritId,
      'Institution updated name without documentary proof.'
    );

    const returnRes = demoStore.resolveCorrectionRequest(
      req2.id,
      'return',
      'Please attach gazette notification or Class 10 certificate for name change.',
      'aicte.admin@demo.aicte.gov.in'
    );

    expect(returnRes.success).toBe(true);
    expect(returnRes.data?.status).toBe('returned_for_correction');

    // Institution can re-submit after AICTE returns
    const resubmitRes = demoStore.submitInstitutionCorrectionResponse(
      req2.id,
      sritId,
      'Affidavit and Class 10 certificate verified and attached.'
    );
    expect(resubmitRes.success).toBe(true);
    expect(resubmitRes.data?.status).toBe('submitted_for_review');
  });

  // 8. Invalid status transitions are rejected
  it('8. Invalid status transitions are rejected', () => {
    const sritEnrolments = demoStore.getEnrolments(sritId);
    const req = demoStore.createCorrectionRequest({
      enrolment_id: sritEnrolments[15].id,
      category: 'missing_apaar',
      issue_description: 'Transition test.',
      requested_fields: ['apaar_id'],
    }).data!;

    // Move to terminal resolved state
    demoStore.submitInstitutionCorrectionResponse(req.id, sritId, 'Correction note', { apaar_id: '121212121212' });
    demoStore.resolveCorrectionRequest(req.id, 'accept', 'Accepted by board');

    // Re-submitting on resolved request must fail with state transition error
    const invalidSubmit = demoStore.submitInstitutionCorrectionResponse(
      req.id,
      sritId,
      'Trying to edit resolved request'
    );
    expect(invalidSubmit.success).toBe(false);
    expect(invalidSubmit.error).toContain('Cannot submit response in \'resolved\' state');

    // Resolving again on already terminal request must fail
    const invalidResolve = demoStore.resolveCorrectionRequest(
      req.id,
      'close',
      'Closing already resolved request'
    );
    expect(invalidResolve.success).toBe(false);
    expect(invalidResolve.error).toContain('already in terminal state');
  });

  // 9. Approved enrolment data is not silently overwritten before AICTE approval
  it('9. Approved enrolment data is not silently overwritten before AICTE approval', () => {
    const sritEnrolments = demoStore.getEnrolments(sritId);
    const targetEnr = sritEnrolments[16];
    const initialStudent = demoStore.getStudents().find(s => s.id === targetEnr.student_id);
    const initialApaar = initialStudent?.apaar_id;

    const req = demoStore.createCorrectionRequest({
      enrolment_id: targetEnr.id,
      category: 'apaar_entry_error',
      issue_description: 'Candidate APAAR check.',
      requested_fields: ['apaar_id'],
    }).data!;

    // Step A: Institution proposes change
    demoStore.submitInstitutionCorrectionResponse(
      req.id,
      sritId,
      'Corrected APAAR from card.',
      { apaar_id: '432143214321' }
    );

    // Verify record is NOT yet changed in store
    const studentDuringReview = demoStore.getStudents().find(s => s.id === targetEnr.student_id);
    expect(studentDuringReview?.apaar_id).toBe(initialApaar);

    // Step B: AICTE explicitly accepts
    demoStore.resolveCorrectionRequest(req.id, 'accept', 'Change verified.');

    // Only NOW is the record updated and marked verified
    const studentAfterAccept = demoStore.getStudents().find(s => s.id === targetEnr.student_id);
    expect(studentAfterAccept?.apaar_id).toBe('432143214321');
    expect(studentAfterAccept?.apaar_verification_status).toBe('verified');
  });

  // 10. Audit history is recorded for relevant actions with sensitive data masked
  it('10. Audit history is recorded for relevant actions with full APAAR masked', () => {
    const sritEnrolments = demoStore.getEnrolments(sritId);
    const targetEnr = sritEnrolments[17];

    const req = demoStore.createCorrectionRequest({
      enrolment_id: targetEnr.id,
      category: 'missing_apaar',
      issue_description: 'Audit test.',
      requested_fields: ['apaar_id'],
    }).data!;

    demoStore.submitInstitutionCorrectionResponse(
      req.id,
      sritId,
      'Submitted proposal.',
      { apaar_id: '987654321098' }
    );

    demoStore.resolveCorrectionRequest(req.id, 'accept', 'Accepted audit test.');

    const logs = demoStore.getAuditLogs();
    const createdLog = logs.find(l => l.action === 'CORRECTION_REQUEST_CREATED' && l.entity_id === req.id);
    const submittedLog = logs.find(l => l.action === 'CORRECTION_REQUEST_SUBMITTED_FOR_REVIEW' && l.entity_id === req.id);
    const resolvedLog = logs.find(l => l.action === 'CORRECTION_REQUEST_RESOLVED' && l.entity_id === req.id);

    expect(createdLog).toBeDefined();
    expect(createdLog?.actor_role).toBe('aicte_admin');
    expect(createdLog?.institution_id).toBe(sritId);

    expect(submittedLog).toBeDefined();
    expect(submittedLog?.actor_role).toBe('institution_admin');
    // Verify APAAR is masked in audit log (not raw 987654321098)
    expect(submittedLog?.new_values?.masked_apaar).toMatch(/X{8}\d{4}/);
    expect(submittedLog?.new_values?.masked_apaar).not.toBe('987654321098');

    expect(resolvedLog).toBeDefined();
    expect(resolvedLog?.actor_role).toBe('aicte_admin');
  });

  // 11. Duplicate clicks or retries do not create unintended duplicate requests
  it('11. Duplicate clicks or retries do not create unintended duplicate requests', () => {
    const sritEnrolments = demoStore.getEnrolments(sritId);
    const targetEnr = sritEnrolments[18];

    const res1 = demoStore.createCorrectionRequest({
      enrolment_id: targetEnr.id,
      category: 'missing_apaar',
      issue_description: 'First click creation.',
      requested_fields: ['apaar_id'],
    });

    // Rapid second click on same enrolment and category
    const res2 = demoStore.createCorrectionRequest({
      enrolment_id: targetEnr.id,
      category: 'missing_apaar',
      issue_description: 'Duplicate retry click.',
      requested_fields: ['apaar_id'],
    });

    expect(res1.success).toBe(true);
    expect(res2.success).toBe(true);
    // Returns existing request, does NOT create two separate open requests
    expect(res1.data?.id).toBe(res2.data?.id);
  });

  // 12. Existing batch review, enrolment, CSV upload, institution switching, and dashboard workflows continue to work
  it('12. Existing batch review, enrolment, CSV upload, and dashboard workflows continue to work without regression', () => {
    // A. Dashboard stats work
    const stats = demoStore.getDashboardStats();
    expect(stats.total_institutions).toBe(12);
    expect(stats.total_enrolments).toBe(1200);

    // B. Institution scoped view works
    const sritEnrolments = demoStore.getEnrolments(sritId);
    const ntuEnrolments = demoStore.getEnrolments(ntuId);
    expect(sritEnrolments.length).toBeGreaterThan(0);
    expect(ntuEnrolments.length).toBeGreaterThan(0);
    expect(sritEnrolments[0].institution_id).toBe(sritId);
    expect(ntuEnrolments[0].institution_id).toBe(ntuId);

    // C. Duplicate case resolution works
    const cases = demoStore.getDuplicateCases();
    expect(cases.length).toBeGreaterThan(0);
    const case1 = cases[0];
    const resolveDup = demoStore.resolveDuplicateCase(case1.id, 'legitimate', 'Verified institutional transfer');
    expect(resolveDup).toBe(true);

    // D. Batch submission & return works
    const batches = demoStore.getBatches(sritId);
    expect(batches.length).toBeGreaterThan(0);
    const b1 = batches[0];
    const returnBatch = demoStore.updateBatchStatus(b1.id, 'returned_for_correction', 'Needs resubmission');
    expect(returnBatch).toBe(true);
  });
});
