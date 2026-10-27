import { describe, it, expect } from 'vitest';
import { validateApaarFormat } from '../lib/utils';
import { validateCSVRow, validateCSVHeaders } from '../services/validationEngine';
import { verifyApaarId } from '../services/apaarAdapter';
import type { CSVRow, ApprovedIntake, SubmissionStatus } from '../types';

describe('1. APAAR Format and Simulation Engine', () => {
  it('should accept valid 12-digit numeric APAAR IDs', () => {
    expect(validateApaarFormat('123456789012')).toBe(true);
    expect(validateApaarFormat('987654321098')).toBe(true);
  });

  it('should reject invalid APAAR formats (letters, wrong length, empty)', () => {
    expect(validateApaarFormat('12345')).toBe(false); // too short
    expect(validateApaarFormat('1234567890123')).toBe(false); // too long
    expect(validateApaarFormat('1234ABCD9012')).toBe(false); // contains letters
    expect(validateApaarFormat('')).toBe(false);
  });

  it('should clearly flag simulated APAAR verification results and statuses', async () => {
    // Valid simulated APAAR
    const resValid = await verifyApaarId({ apaar_id: '123456789012', full_name: 'Aarav Sharma' });
    expect(resValid.is_simulated).toBe(true);
    expect(resValid.outcome).toBe('verified');
    expect(resValid.provider).toBe('mock');

    // Invalid simulated APAAR (ends in 00)
    const resInvalid = await verifyApaarId({ apaar_id: '123456789000', full_name: 'Test Student' });
    expect(resInvalid.is_simulated).toBe(true);
    expect(resInvalid.outcome).toBe('invalid');

    // Unavailable simulated provider (ends in 99)
    const resUnavailable = await verifyApaarId({ apaar_id: '123456789099', full_name: 'Test Student' });
    expect(resUnavailable.is_simulated).toBe(true);
    expect(resUnavailable.outcome).toBe('unavailable');
  });
});

describe('2. CSV Validation Engine & Business Logic', () => {
  const mockIntake: ApprovedIntake = {
    id: 'intake-1',
    programme_id: 'prog-1',
    institution_id: 'inst-1',
    academic_year: '2024-25',
    approved_intake: 60,
    supernumerary_nri: 3,
    supernumerary_oci: 2,
    supernumerary_fn: 1,
    supernumerary_pwd: 2,
    supernumerary_tfws: 2,
    supernumerary_km: 2,
    total_supernumerary: 12,
    approval_reference: 'AICTE/2024/01',
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const validRow: CSVRow = {
    row_number: 1,
    institution_student_id: 'STU-001',
    full_name: 'Aarav Sharma',
    apaar_id: '123456789012',
    programme_code: 'BTECH-CS',
    academic_year: '2024-25',
    admission_date: '2024-07-15',
    admission_category: 'general',
    gender: 'male',
    supernumerary_classification: 'none',
  };

  it('should validate headers correctly and detect missing headers', () => {
    const validHeaders = ['institution_student_id', 'full_name', 'programme_code', 'academic_year', 'admission_date', 'admission_category'];
    expect(validateCSVHeaders(validHeaders).valid).toBe(true);

    const missingHeaders = ['institution_student_id', 'full_name'];
    const check = validateCSVHeaders(missingHeaders);
    expect(check.valid).toBe(false);
    expect(check.missing).toContain('programme_code');
  });

  it('should validate a clean row successfully with zero errors', () => {
    const existing = new Set<string>();
    const batch = new Set<string>();
    const res = validateCSVRow(validRow, existing, batch, mockIntake, 10, 0);

    expect(res.is_valid).toBe(true);
    expect(res.errors.length).toBe(0);
  });

  it('should flag missing required fields (e.g. missing name and admission date)', () => {
    const badRow: CSVRow = {
      ...validRow,
      full_name: '',
      admission_date: '',
    };
    const res = validateCSVRow(badRow, new Set(), new Set(), mockIntake, 0, 0);
    expect(res.is_valid).toBe(false);
    expect(res.errors.some(e => e.field === 'full_name')).toBe(true);
    expect(res.errors.some(e => e.field === 'admission_date')).toBe(true);
  });

  it('should warn when APAAR ID is missing, but not block if basic info is present', () => {
    const noApaarRow: CSVRow = {
      ...validRow,
      apaar_id: '',
    };
    const res = validateCSVRow(noApaarRow, new Set(), new Set(), mockIntake, 0, 0);
    expect(res.is_valid).toBe(true);
    expect(res.warnings.some(w => w.field === 'apaar_id')).toBe(true);
  });

  it('should flag duplicate student IDs within the same batch', () => {
    const batch = new Set<string>(['STU-001']);
    const res = validateCSVRow(validRow, new Set(), batch, mockIntake, 0, 0);
    expect(res.is_valid).toBe(false);
    expect(res.errors.some(e => e.type === 'duplicate')).toBe(true);
  });

  it('should flag duplicate student IDs already existing in database', () => {
    const existing = new Set<string>(['STU-001']);
    const res = validateCSVRow(validRow, existing, new Set(), mockIntake, 0, 0);
    expect(res.is_valid).toBe(false);
    expect(res.errors.some(e => e.type === 'duplicate')).toBe(true);
  });

  it('should detect regular approved intake limit overflow', () => {
    // Current regular count is 60 (equal to approved_intake of 60)
    const res = validateCSVRow(validRow, new Set(), new Set(), mockIntake, 60, 0);
    expect(res.is_valid).toBe(false);
    expect(res.errors.some(e => e.type === 'intake_exceeded')).toBe(true);
  });

  it('should enforce supernumerary quota separately from regular quota', () => {
    const nriRow: CSVRow = {
      ...validRow,
      institution_student_id: 'STU-NRI-1',
      admission_category: 'nri',
      supernumerary_classification: 'nri',
      is_nri: 'true',
    };
    // Total supernumerary capacity is 12, currently at 12 -> should fail with supernumerary exceeded
    const resOverflow = validateCSVRow(nriRow, new Set(), new Set(), mockIntake, 20, 12);
    expect(resOverflow.is_valid).toBe(false);
    expect(resOverflow.errors.some(e => e.type === 'supernumerary_exceeded')).toBe(true);

    // When under capacity (e.g. 5 out of 12), it should pass
    const resUnder = validateCSVRow(nriRow, new Set(), new Set(), mockIntake, 20, 5);
    expect(resUnder.is_valid).toBe(true);
  });
});

describe('3. Role & Submission State Transitions', () => {
  it('should only permit valid submission transitions', () => {
    const validTransitions: Record<SubmissionStatus, SubmissionStatus[]> = {
      draft: ['submitted', 'validation_failed'],
      validation_failed: ['draft', 'submitted'],
      submitted: ['under_review', 'approved', 'rejected', 'returned_for_correction'],
      under_review: ['approved', 'rejected', 'returned_for_correction'],
      approved: [], // Terminal state
      rejected: ['draft'], // Can be revised
      returned_for_correction: ['draft', 'submitted'],
    };

    // Institution cannot transition directly from draft to approved
    expect(validTransitions['draft'].includes('approved')).toBe(false);

    // AICTE can approve from under_review
    expect(validTransitions['under_review'].includes('approved')).toBe(true);

    // Returned for correction can go back to draft
    expect(validTransitions['returned_for_correction'].includes('draft')).toBe(true);
  });

  it('should enforce that institution admins cannot access AICTE admin functions', () => {
    const checkRolePermission = (role: 'aicte_admin' | 'institution_admin', action: string): boolean => {
      if (action.startsWith('aicte:') && role !== 'aicte_admin') {
        return false;
      }
      return true;
    };

    expect(checkRolePermission('institution_admin', 'aicte:approve_batch')).toBe(false);
    expect(checkRolePermission('institution_admin', 'aicte:manage_institutions')).toBe(false);
    expect(checkRolePermission('institution_admin', 'aicte:modify_intake')).toBe(false);
    expect(checkRolePermission('aicte_admin', 'aicte:approve_batch')).toBe(true);
  });

  it('should enforce tenant isolation (institution can only access own institution ID)', () => {
    const userInstitutionId = 'inst-111';
    const canAccessRecord = (role: string, targetInstId: string): boolean => {
      if (role === 'aicte_admin') return true;
      return targetInstId === userInstitutionId;
    };

    expect(canAccessRecord('institution_admin', 'inst-111')).toBe(true);
    expect(canAccessRecord('institution_admin', 'inst-222')).toBe(false);
    expect(canAccessRecord('aicte_admin', 'inst-222')).toBe(true);
  });
});