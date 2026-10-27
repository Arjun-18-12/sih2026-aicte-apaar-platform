import { describe, it, expect, beforeEach } from 'vitest';
import { demoStore, DEMO_INSTITUTION_ID, DEMO_STORE_KEY } from '../services/demoStore';
import { InstitutionInboxItem, IntakeException } from '../types';

describe('AICTE-to-Institution Communication & Response Workflow', () => {
  const NTU_ID = '11111111-1111-1111-1111-000000000002';

  const storageMap = new Map<string, string>();
  (globalThis as any).window = {
    localStorage: {
      getItem: (k: string) => storageMap.get(k) || null,
      setItem: (k: string, v: string) => storageMap.set(k, String(v)),
      removeItem: (k: string) => storageMap.delete(k),
      clear: () => storageMap.clear(),
    },
  };
  (globalThis as any).localStorage = (globalThis as any).window.localStorage;

  beforeEach(() => {
    storageMap.clear();
    demoStore.reset();
  });

  // --------------------------------------------------------------------------
  // Scenario 1: AICTE submission decisions -> Institution inbox
  // --------------------------------------------------------------------------
  describe('1. AICTE submission decisions -> Institution inbox', () => {
    it('notifies submitting institution with next action when batch is returned for correction', () => {
      // Find a submitted batch for SRIT
      const batch = demoStore.getBatches(DEMO_INSTITUTION_ID)[0];
      expect(batch).toBeDefined();

      const reviewerNotes = '15 records have mismatched APAAR IDs. Please upload corrected batch.';
      demoStore.updateBatchStatus(batch.id, 'returned_for_correction', reviewerNotes);

      // Verify inbox item in SRIT inbox
      const sritInbox = demoStore.getInboxItems(DEMO_INSTITUTION_ID);
      const batchItem = sritInbox.find(i => i.reference_id === batch.id && i.type === 'submission_decision');

      expect(batchItem).toBeDefined();
      expect(batchItem?.status).toBe('awaiting_action');
      expect(batchItem?.aicte_message).toBe(reviewerNotes);
      expect(batchItem?.metadata.decision).toBe('returned_for_correction');
      expect(batchItem?.metadata.next_action).toBe('Upload corrected batch via CSV Upload');
      expect(batchItem?.institution_id).toBe(DEMO_INSTITUTION_ID);
    });

    it('notifies institution when batch is approved and cascades status', () => {
      const batch = demoStore.getBatches(DEMO_INSTITUTION_ID)[0];
      const reviewerNotes = 'All enrolments verified against council guidelines and approved.';
      demoStore.updateBatchStatus(batch.id, 'approved', reviewerNotes);

      const sritInbox = demoStore.getInboxItems(DEMO_INSTITUTION_ID);
      const batchItem = sritInbox.find(i => i.reference_id === batch.id && i.type === 'submission_decision');

      expect(batchItem).toBeDefined();
      expect(batchItem?.status).toBe('completed');
      expect(batchItem?.metadata.decision).toBe('approved');
      expect(batchItem?.metadata.next_action).toContain('central register');
    });

    it('notifies institution when batch is rejected with council remarks', () => {
      const batch = demoStore.getBatches(DEMO_INSTITUTION_ID)[0];
      const reviewerNotes = 'Intake limits severely violated. Batch rejected by council.';
      demoStore.updateBatchStatus(batch.id, 'rejected', reviewerNotes);

      const sritInbox = demoStore.getInboxItems(DEMO_INSTITUTION_ID);
      const batchItem = sritInbox.find(i => i.reference_id === batch.id && i.type === 'submission_decision');

      expect(batchItem).toBeDefined();
      expect(batchItem?.status).toBe('completed');
      expect(batchItem?.metadata.decision).toBe('rejected');
      expect(batchItem?.aicte_message).toBe(reviewerNotes);
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 2: Duplicate reviews -> Institution inbox with privacy preservation
  // --------------------------------------------------------------------------
  describe('2. Duplicate reviews -> Institution inbox with cross-institution privacy', () => {
    it('notifies affected institutions while masking the other institution candidate details', () => {
      const dupCases = demoStore.getDuplicateCases();
      const crossInstCase = dupCases.find(c => c.case_type === 'cross_institution_duplicate') || dupCases[0];
      expect(crossInstCase).toBeDefined();

      const reviewerNotes = 'Confirmed duplicate admission across multiple institutions. Prior admission takes precedence.';
      demoStore.resolveDuplicateCase(
        crossInstCase.id,
        'confirmed_duplicate',
        reviewerNotes,
        'aicte.admin@demo.aicte.gov.in'
      );

      // Institution 1 (SRIT) inbox check
      const sritInbox = demoStore.getInboxItems(DEMO_INSTITUTION_ID);
      const sritItem = sritInbox.find(i => i.reference_id === crossInstCase.id && i.type === 'duplicate_adjudication');

      expect(sritItem).toBeDefined();
      expect(sritItem?.status).toBe('awaiting_action');
      expect(sritItem?.aicte_message).toContain(reviewerNotes);
      // Privacy guarantee: The colliding candidate is masked
      expect(sritItem?.metadata.masked_student_name).toBe('[Confidential Candidate - Verified Institution]');
      expect(sritItem?.metadata.next_action).toBe('Review duplicate finding and regularize enrolment status');
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 3: Intake exceptions -> Institution inbox & explanation workflow
  // --------------------------------------------------------------------------
  describe('3. Intake exceptions -> Institution inbox & explanation workflow', () => {
    it('AICTE requests explanation, institution receives it and responds without auto-approving', () => {
      const exceptions = demoStore.getIntakeExceptions(DEMO_INSTITUTION_ID);
      const ex = exceptions[0];
      expect(ex).toBeDefined();

      const inquiryQuestion = 'Approved supernumerary cap is 6, but 8 candidates were admitted. Please provide governing board sanction.';
      const deadline = '2024-11-15T17:00:00Z';

      // 1. AICTE requests explanation
      const reqRes = demoStore.requestIntakeExplanation(ex.id, inquiryQuestion, deadline);
      expect(reqRes.success).toBe(true);

      // Verify intake exception state in AICTE
      const updatedEx = demoStore.getIntakeException(ex.id);
      expect(updatedEx?.status).toBe('awaiting_institution');
      expect(updatedEx?.inquiry_text).toBe(inquiryQuestion);
      expect(updatedEx?.inquiry_deadline).toBe(deadline);

      // 2. Institution receives inquiry in inbox
      const sritInbox = demoStore.getInboxItems(DEMO_INSTITUTION_ID);
      const inquiryItem = sritInbox.find(i => i.reference_id === ex.id && i.type === 'intake_inquiry');

      expect(inquiryItem).toBeDefined();
      expect(inquiryItem?.status).toBe('awaiting_action');
      expect(inquiryItem?.aicte_message).toBe(inquiryQuestion);
      expect(inquiryItem?.deadline).toBe(deadline);

      // 3. Institution submits explanation
      const institutionExplanation = 'Admissions 7 & 8 are PMSSS scholarship recipients sanctioned vide council order AICTE/PMSSS/2024/789.';
      const respRes = demoStore.submitInboxResponse(
        inquiryItem!.id,
        DEMO_INSTITUTION_ID,
        institutionExplanation,
        null,
        'principal@srit.ac.in'
      );
      expect(respRes.success).toBe(true);

      // 4. Verification: Status is under_review in inbox and explanation_submitted in intake exceptions
      const reloadedItem = demoStore.getInboxItem(inquiryItem!.id, DEMO_INSTITUTION_ID);
      expect(reloadedItem?.status).toBe('under_review');
      expect(reloadedItem?.institution_response).toBe(institutionExplanation);

      // CRITICAL REQUIREMENT: The response must NOT automatically approve the exception
      const reloadedEx = demoStore.getIntakeException(ex.id);
      expect(reloadedEx?.status).toBe('explanation_submitted');
      expect(reloadedEx?.status).not.toBe('approved');
      expect(reloadedEx?.status).not.toBe('resolved');
      expect(reloadedEx?.institution_response).toBe(institutionExplanation);

      // 5. AICTE can now review and approve under special dispensation
      const dispRes = demoStore.approveIntakeDispensation(
        ex.id,
        'PMSSS sanction verified and accepted under council dispensation.'
      );
      expect(dispRes.success).toBe(true);

      const finalEx = demoStore.getIntakeException(ex.id);
      expect(finalEx?.status).toBe('approved');

      // Inbox item transitions to completed
      const finalInboxItem = demoStore.getInboxItem(inquiryItem!.id, DEMO_INSTITUTION_ID);
      expect(finalInboxItem?.status).toBe('completed');
    });

    it('AICTE can reject intake exception with reasoned decision', () => {
      const exceptions = demoStore.getIntakeExceptions(DEMO_INSTITUTION_ID);
      const ex = exceptions[0];

      const rejectionReason = 'Admissions exceed approved capacity without governing approval. De-register excess enrolments.';
      const rejRes = demoStore.rejectIntakeException(ex.id, rejectionReason);

      expect(rejRes.success).toBe(true);
      const reloadedEx = demoStore.getIntakeException(ex.id);
      expect(reloadedEx?.status).toBe('rejected');
      expect(reloadedEx?.resolution).toContain(rejectionReason);

      // Institution inbox receives rejection notification
      const sritInbox = demoStore.getInboxItems(DEMO_INSTITUTION_ID);
      const rejItem = sritInbox.find(i => i.reference_id === ex.id && i.type === 'intake_inquiry');
      expect(rejItem).toBeDefined();
      expect(rejItem?.status).toBe('completed');
      expect(rejItem?.aicte_message).toContain('rejected');
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 4: AICTE correction requests -> Institution inbox
  // --------------------------------------------------------------------------
  describe('4. AICTE correction requests -> Institution inbox', () => {
    it('creates actionable inbox item for institution, accepts response, and updates record upon resolution', () => {
      const enrolments = demoStore.getEnrolments(DEMO_INSTITUTION_ID);
      const targetEnr = enrolments[0];

      // 1. AICTE creates correction request
      const crRes = demoStore.createCorrectionRequest({
        enrolment_id: targetEnr.id,
        category: 'demographic_review',
        issue_description: 'Name in application does not match APAAR identity registry.',
        priority: 'high',
        requested_fields: ['full_name', 'apaar_id'],
      });
      expect(crRes.success).toBe(true);
      const crId = crRes.data!.id;

      // 2. Institution receives correction request in inbox
      const sritInbox = demoStore.getInboxItems(DEMO_INSTITUTION_ID);
      const crItem = sritInbox.find(i => i.reference_id === crId && i.type === 'correction_request');

      expect(crItem).toBeDefined();
      expect(crItem?.status).toBe('awaiting_action');
      expect(crItem?.aicte_message).toContain('does not match APAAR');

      // 3. Institution responds with proposed corrections
      const responseRes = demoStore.submitInboxResponse(
        crItem!.id,
        DEMO_INSTITUTION_ID,
        'Verified Aadhaar card; spelling updated to match registry.',
        { full_name: 'Aarav Sharma Corrected', apaar_id: '999988887777' },
        'principal@srit.ac.in'
      );
      expect(responseRes.success).toBe(true);

      // Verify status transitions to under_review
      const underReviewItem = demoStore.getInboxItem(crItem!.id, DEMO_INSTITUTION_ID);
      expect(underReviewItem?.status).toBe('under_review');

      // 4. AICTE resolves request
      const resolveRes = demoStore.resolveCorrectionRequest(
        crId,
        'accept',
        'Verified with UIDAI database. Accepted.'
      );
      expect(resolveRes.success).toBe(true);

      // Inbox item status transitions to completed
      const completedItem = demoStore.getInboxItem(crItem!.id, DEMO_INSTITUTION_ID);
      expect(completedItem?.status).toBe('completed');
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 5: Multi-Institution Tenant Isolation & Security
  // --------------------------------------------------------------------------
  describe('5. Tenant Isolation & Security', () => {
    it('prevents Institution A from viewing or accessing Institution B inbox items', () => {
      // Create an inbox item specifically for NTU
      const ntuItem = demoStore.createInboxItem({
        institution_id: NTU_ID,
        type: 'submission_decision',
        title: 'NTU Exclusive Council Notice',
        reference_id: 'b-ntu-99',
        reference_type: 'batch',
        status: 'awaiting_action',
        aicte_message: 'Confidential message to NTU leadership.',
      });

      // SRIT tries to fetch inbox list -> must NOT contain NTU item
      const sritItems = demoStore.getInboxItems(DEMO_INSTITUTION_ID);
      expect(sritItems.some(i => i.id === ntuItem.id)).toBe(false);

      // SRIT tries to get single item by ID -> must return undefined (strictly tenant isolated)
      const isolatedItem = demoStore.getInboxItem(ntuItem.id, DEMO_INSTITUTION_ID);
      expect(isolatedItem).toBeUndefined();

      // NTU querying its own item -> succeeds
      const ntuRetrieved = demoStore.getInboxItem(ntuItem.id, NTU_ID);
      expect(ntuRetrieved).toBeDefined();
      expect(ntuRetrieved?.id).toBe(ntuItem.id);
    });

    it('rejects cross-institution response submissions with Unauthorized error', () => {
      const ntuItem = demoStore.createInboxItem({
        institution_id: NTU_ID,
        type: 'intake_inquiry',
        title: 'NTU Intake Inquiry',
        reference_id: 'ex-reg-1',
        reference_type: 'intake_exception',
        status: 'awaiting_action',
        aicte_message: 'Excess intake inquiry for NTU CS.',
      });

      // SRIT tries to submit response to NTU inbox item
      const unauthorizedRes = demoStore.submitInboxResponse(
        ntuItem.id,
        DEMO_INSTITUTION_ID, // Wrong tenant!
        'Unauthorized response from SRIT',
        null,
        'hacker@unauthorized.ac.in'
      );

      expect(unauthorizedRes.success).toBe(false);
      expect(unauthorizedRes.error).toContain('Unauthorized');

      // SRIT tries to submit explanation to NTU intake exception directly
      const unauthorizedExRes = demoStore.submitIntakeExplanation(
        'ex-reg-1',
        DEMO_INSTITUTION_ID, // Wrong tenant!
        'Unauthorized explanation'
      );
      expect(unauthorizedExRes.success).toBe(false);
      expect(unauthorizedExRes.error).toContain('Unauthorized');
    });

    it('allows marking an inbox item as read only for authorized tenant', () => {
      const sritInbox = demoStore.getInboxItems(DEMO_INSTITUTION_ID);
      const unreadItem = sritInbox.find(i => !i.is_read) || sritInbox[0];

      // NTU cannot mark SRIT item as read
      const unauthorizedMark = demoStore.markInboxItemRead(unreadItem.id, NTU_ID);
      expect(unauthorizedMark).toBe(false);

      // SRIT can mark its own item as read
      const authorizedMark = demoStore.markInboxItemRead(unreadItem.id, DEMO_INSTITUTION_ID);
      expect(authorizedMark).toBe(true);

      const reloaded = demoStore.getInboxItem(unreadItem.id, DEMO_INSTITUTION_ID);
      expect(reloaded?.is_read).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 6: State persistence across page refresh / storage
  // --------------------------------------------------------------------------
  describe('6. State persistence across reloads', () => {
    it('persists requests, responses, decisions, and unread statuses to storage', () => {
      // 1. Dispatch an inquiry
      const exceptions = demoStore.getIntakeExceptions(DEMO_INSTITUTION_ID);
      const ex = exceptions[0];
      demoStore.requestIntakeExplanation(ex.id, 'Persistence check inquiry text');

      // 2. Submit an explanation
      demoStore.submitIntakeExplanation(ex.id, DEMO_INSTITUTION_ID, 'Persistent explanation response text');

      // 3. Mark an item read
      const sritItems = demoStore.getInboxItems(DEMO_INSTITUTION_ID);
      const targetItem = sritItems[0];
      demoStore.markInboxItemRead(targetItem.id, DEMO_INSTITUTION_ID);

      // 4. Verify raw localStorage persistence
      const rawStorage = localStorage.getItem(DEMO_STORE_KEY);
      expect(rawStorage).toBeDefined();
      const parsed = JSON.parse(rawStorage!);

      const storedException = parsed.intakeExceptions.find((e: IntakeException) => e.id === ex.id);
      expect(storedException).toBeDefined();
      expect(storedException.status).toBe('explanation_submitted');
      expect(storedException.institution_response).toBe('Persistent explanation response text');

      const storedInboxItem = parsed.inboxItems.find((i: InstitutionInboxItem) => i.id === targetItem.id);
      expect(storedInboxItem).toBeDefined();
      expect(storedInboxItem.is_read).toBe(true);
    });
  });
});
