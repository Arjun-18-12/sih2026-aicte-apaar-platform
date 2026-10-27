import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  formatCSVRowToRpcInput,
  maskSensitiveData,
  createSubmissionBatch,
  submitEnrolmentBatch,
} from '../services/enrolmentService';
import { validateCSVRow } from '../services/validationEngine';
import type { CSVRow, ApprovedIntake, BatchEnrolmentResponse } from '../types';
import { supabase } from '../lib/supabase';

// Mock Supabase RPC
vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

describe('P0-1 Enrolment Persistence — Client Service & Validation Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockIntake: ApprovedIntake = {
    id: 'intake-cs-2024',
    programme_id: 'prog-cs',
    institution_id: 'inst-srit',
    academic_year: '2024-25',
    approved_intake: 60,
    supernumerary_nri: 3,
    supernumerary_oci: 2,
    supernumerary_fn: 1,
    supernumerary_pwd: 2,
    supernumerary_tfws: 2,
    supernumerary_km: 2,
    total_supernumerary: 12,
    approval_reference: 'AICTE/2024/001',
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const validRawRow: CSVRow = {
    row_number: 2,
    institution_student_id: 'SRIT2024001',
    full_name: 'Aarav Sharma',
    apaar_id: '123456789012',
    programme_code: 'BTECH-CS',
    academic_year: '2024-25',
    admission_date: '2024-08-01',
    admission_category: 'general',
    date_of_birth: '2006-05-15',
    gender: 'male',
    supernumerary_classification: 'none',
    remarks: 'Merit quota',
  };

  describe('1. Confidentiality & Payload Normalization', () => {
    it('should normalize clean valid student records into documented RPC payload schema', () => {
      const payload = formatCSVRowToRpcInput(validRawRow);

      expect(payload.row_number).toBe(2);
      expect(payload.institution_student_id).toBe('SRIT2024001');
      expect(payload.full_name).toBe('Aarav Sharma');
      expect(payload.programme_code).toBe('BTECH-CS');
      expect(payload.academic_year).toBe('2024-25');
      expect(payload.admission_date).toBe('2024-08-01');
      expect(payload.admission_category).toBe('general');
      expect(payload.apaar_id).toBe('123456789012');
      expect(payload.is_nri).toBe(false);
      expect(payload.supernumerary_classification).toBe('none');
    });

    it('should strip hyphens and spaces from APAAR IDs during normalization', () => {
      const rowWithFormattedApaar: CSVRow = {
        ...validRawRow,
        apaar_id: '1234-5678-9012',
      };
      const payload = formatCSVRowToRpcInput(rowWithFormattedApaar);
      expect(payload.apaar_id).toBe('123456789012');
    });

    it('should mask 12-digit APAAR identifiers in logs and error messages', () => {
      const sensitiveMsg = 'Duplicate key constraint violation on apaar_id 123456789012 for student';
      const masked = maskSensitiveData(sensitiveMsg);
      expect(masked).toBe('Duplicate key constraint violation on apaar_id XXXXXXXX9012 for student');
      expect(masked).not.toContain('123456789012');
    });
  });

  describe('2. Pre-Flight Academic & Identity Validation Rules', () => {
    it('should pass validation for a clean, non-conflicting student record', () => {
      const existing = new Set<string>();
      const batch = new Set<string>();
      const res = validateCSVRow(validRawRow, existing, batch, mockIntake, 10, 0);

      expect(res.is_valid).toBe(true);
      expect(res.errors.length).toBe(0);
    });

    it('should reject records with missing mandatory fields', () => {
      const badRow: CSVRow = {
        ...validRawRow,
        full_name: '',
        admission_date: '',
      };
      const res = validateCSVRow(badRow, new Set(), new Set(), mockIntake, 0, 0);
      expect(res.is_valid).toBe(false);
      expect(res.errors.some((e) => e.field === 'full_name')).toBe(true);
      expect(res.errors.some((e) => e.field === 'admission_date')).toBe(true);
    });

    it('should reject invalid APAAR formats (letters, wrong digit count)', () => {
      const rowWithBadApaar: CSVRow = {
        ...validRawRow,
        apaar_id: '1234ABCD9012',
      };
      const res = validateCSVRow(rowWithBadApaar, new Set(), new Set(), mockIntake, 0, 0);
      expect(res.is_valid).toBe(false);
      expect(res.errors.some((e) => e.field === 'apaar_id')).toBe(true);
    });

    it('should flag duplicate student IDs within the same upload batch', () => {
      const batchIds = new Set<string>(['SRIT2024001']);
      const res = validateCSVRow(validRawRow, new Set(), batchIds, mockIntake, 0, 0);

      expect(res.is_valid).toBe(false);
      expect(res.errors.some((e) => e.type === 'duplicate')).toBe(true);
      expect(res.errors[0].message).toContain('within this batch');
    });

    it('should flag duplicate student IDs already enrolled in the institution', () => {
      const existingDbIds = new Set<string>(['SRIT2024001']);
      const res = validateCSVRow(validRawRow, existingDbIds, new Set(), mockIntake, 0, 0);

      expect(res.is_valid).toBe(false);
      expect(res.errors.some((e) => e.type === 'duplicate')).toBe(true);
      expect(res.errors[0].message).toContain('already exists in a previous approved submission');
    });

    it('should flag regular approved intake overflow when intake limit is met', () => {
      // Approved intake is 60; current regular count is 60
      const res = validateCSVRow(validRawRow, new Set(), new Set(), mockIntake, 60, 0);
      expect(res.is_valid).toBe(false);
      expect(res.errors.some((e) => e.type === 'intake_exceeded')).toBe(true);
    });

    it('should enforce supernumerary quota separately from regular intake', () => {
      const nriRow: CSVRow = {
        ...validRawRow,
        institution_student_id: 'SRIT-NRI-001',
        admission_category: 'nri',
        supernumerary_classification: 'nri',
        is_nri: 'true',
      };

      // Total supernumerary capacity is 12; currently at 12
      const resOverflow = validateCSVRow(nriRow, new Set(), new Set(), mockIntake, 30, 12);
      expect(resOverflow.is_valid).toBe(false);
      expect(resOverflow.errors.some((e) => e.type === 'supernumerary_exceeded')).toBe(true);

      // Under capacity (e.g. 5 out of 12)
      const resUnder = validateCSVRow(nriRow, new Set(), new Set(), mockIntake, 30, 5);
      expect(resUnder.is_valid).toBe(true);
    });
  });

  describe('3. Client Service RPC Invocation & Error Handling', () => {
    it('creates a draft through the server-owned batch RPC without a client institution ID', async () => {
      (supabase.rpc as any).mockResolvedValueOnce({
        data: 'b89f81a2-3f12-4c22-91f1-9876543210ab',
        error: null,
      });

      const res = await createSubmissionBatch('2024-25', 5);

      expect(res).toEqual({ batchId: 'b89f81a2-3f12-4c22-91f1-9876543210ab', error: null });
      expect(supabase.rpc).toHaveBeenCalledWith('create_submission_batch_draft', {
        p_academic_year: '2024-25',
        p_total_records: 5,
      });
    });

    it('rejects malformed batch metadata before calling the server', async () => {
      const res = await createSubmissionBatch('2024/25', 0);

      expect(res.batchId).toBeNull();
      expect(res.error).toContain('Academic year');
      expect(supabase.rpc).not.toHaveBeenCalled();
    });

    it('should block submission if batch ID is unprovisioned or demo', async () => {
      const records = [formatCSVRowToRpcInput(validRawRow)];
      const res = await submitEnrolmentBatch('DEMO-BATCH-12345', records);

      expect(res.data).toBeNull();
      expect(res.error).toContain('Invalid or demo batch ID');
      expect(supabase.rpc).not.toHaveBeenCalled();
    });

    it('should block submission if record payload is empty', async () => {
      const res = await submitEnrolmentBatch('b89f81a2-3f12-4c22-91f1-9876543210ab', []);

      expect(res.data).toBeNull();
      expect(res.error).toContain('No valid records provided');
      expect(supabase.rpc).not.toHaveBeenCalled();
    });

    it('should handle missing database RPC error with deployment instructions', async () => {
      const mockRpcError = {
        code: '42883',
        message: 'function public.submit_enrolment_batch_atomic(uuid, jsonb) does not exist',
      };
      (supabase.rpc as any).mockResolvedValueOnce({ data: null, error: mockRpcError });

      const records = [formatCSVRowToRpcInput(validRawRow)];
      const res = await submitEnrolmentBatch('b89f81a2-3f12-4c22-91f1-9876543210ab', records);

      expect(res.data).toBeNull();
      expect(res.error).toContain('Database RPC \'submit_enrolment_batch_atomic\' is not deployed');
      expect(res.error).toContain('docs/AICTE_APAAR_P0_1_STUDENT_ENROLMENT_PERSISTENCE_SPECIFICATION.md');
    });

    it('should handle network exceptions safely without crashing', async () => {
      (supabase.rpc as any).mockRejectedValueOnce(new Error('Failed to fetch: net::ERR_CONNECTION_REFUSED'));

      const records = [formatCSVRowToRpcInput(validRawRow)];
      const res = await submitEnrolmentBatch('b89f81a2-3f12-4c22-91f1-9876543210ab', records);

      expect(res.data).toBeNull();
      expect(res.error).toContain('Network or connectivity failure');
    });

    it('should return parsed BatchEnrolmentResponse upon successful server persistence', async () => {
      const mockSuccessResponse: BatchEnrolmentResponse = {
        success: true,
        batch_id: 'b89f81a2-3f12-4c22-91f1-9876543210ab',
        total_records: 1,
        accepted_records: 1,
        rejected_records: 0,
        duplicate_records: 0,
        batch_status: 'submitted',
        row_results: [
          {
            row_number: 2,
            institution_student_id: 'SRIT2024001',
            status: 'accepted',
            student_id: 's-111',
            enrolment_id: 'e-111',
          },
        ],
        message: 'Batch processed successfully: all records accepted.',
      };

      (supabase.rpc as any).mockResolvedValueOnce({ data: mockSuccessResponse, error: null });

      const records = [formatCSVRowToRpcInput(validRawRow)];
      const res = await submitEnrolmentBatch('b89f81a2-3f12-4c22-91f1-9876543210ab', records);

      expect(res.error).toBeNull();
      expect(res.data).toEqual(mockSuccessResponse);
      expect(res.data?.accepted_records).toBe(1);
      expect(res.data?.batch_status).toBe('submitted');
    });
  });
});
