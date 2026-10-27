/**
 * Enrolment Persistence Service (P0-1)
 *
 * Encapsulates client interaction with the trusted server-side RPC
 * 'submit_enrolment_batch_atomic'.
 *
 * Enforces:
 * - Data masking for sensitive academic identifiers (APAAR)
 * - Safe payload normalization
 * - Transactional error interception and structured reporting
 */

import { supabase } from '../lib/supabase';
import type {
  CSVRow,
  BatchEnrolmentRecordInput,
  BatchEnrolmentResponse,
  AdmissionCategory,
  SupernumeraryClassification,
} from '../types';

/**
 * Mask any 12-digit numeric identifier in error messages or logs to prevent
 * accidental leakage of student APAAR IDs in browser consoles or telemetry.
 */
export function maskSensitiveData(input: string): string {
  if (!input) return '';
  return input.replace(/\b(\d{8})(\d{4})\b/g, 'XXXXXXXX$2');
}

/**
 * Normalize and convert a raw validated CSVRow into the documented
 * BatchEnrolmentRecordInput schema required by the database RPC.
 */
export function formatCSVRowToRpcInput(row: CSVRow): BatchEnrolmentRecordInput {
  const normApaar = row.apaar_id ? String(row.apaar_id).replace(/[^0-9]/g, '') : undefined;

  return {
    row_number: Number(row.row_number) || 0,
    institution_student_id: String(row.institution_student_id || '').trim(),
    full_name: String(row.full_name || '').trim(),
    programme_code: String(row.programme_code || '').trim().toUpperCase(),
    academic_year: String(row.academic_year || '').trim(),
    admission_date: String(row.admission_date || '').trim(),
    admission_category: (String(row.admission_category || 'general').trim().toLowerCase()) as AdmissionCategory,
    is_nri: row.is_nri === 'true' || row.is_nri === '1',
    is_oci: row.is_oci === 'true' || row.is_oci === '1',
    is_foreign_national: row.is_foreign_national === 'true' || row.is_foreign_national === '1',
    supernumerary_classification: (String(row.supernumerary_classification || 'none').trim().toLowerCase()) as SupernumeraryClassification,
    apaar_id: normApaar && normApaar.length === 12 ? normApaar : undefined,
    date_of_birth: row.date_of_birth ? String(row.date_of_birth).trim() : undefined,
    gender: row.gender ? (String(row.gender).trim().toLowerCase() as any) : undefined,
    remarks: row.remarks ? String(row.remarks).trim() : undefined,
  };
}

/**
 * Provision a server-owned draft batch for the signed-in institution.
 *
 * The database derives the institution from the authenticated profile; the
 * browser never supplies a tenant identifier or authoritative counters.
 */
export async function createSubmissionBatch(
  academicYear: string,
  totalRecords: number,
): Promise<{ batchId: string | null; error: string | null }> {
  if (!/^\d{4}-\d{2}$/.test(academicYear)) {
    return { batchId: null, error: 'Academic year must use the YYYY-YY format.' };
  }

  if (!Number.isInteger(totalRecords) || totalRecords < 1) {
    return { batchId: null, error: 'A submission batch must contain at least one record.' };
  }

  try {
    const { data, error } = await supabase.rpc('create_submission_batch_draft', {
      p_academic_year: academicYear,
      p_total_records: totalRecords,
    });

    if (error) {
      return { batchId: null, error: `Unable to create the secure submission batch: ${maskSensitiveData(error.message)}` };
    }

    if (typeof data !== 'string' || !data) {
      return { batchId: null, error: 'The server did not return a submission-batch identifier.' };
    }

    return { batchId: data, error: null };
  } catch (err: any) {
    return {
      batchId: null,
      error: `Unable to reach the secure submission service: ${maskSensitiveData(err?.message || 'Unknown connection error')}`,
    };
  }
}

/**
 * Submit a batch of student records to the central repository via the trusted
 * transactional database RPC 'submit_enrolment_batch_atomic'.
 *
 * This operation executes inside a single PostgreSQL transaction.
 */
export async function submitEnrolmentBatch(
  batchId: string,
  records: BatchEnrolmentRecordInput[]
): Promise<{ data: BatchEnrolmentResponse | null; error: string | null }> {
  if (!batchId || batchId.startsWith('DEMO-')) {
    return {
      data: null,
      error: 'Cannot persist batch: Invalid or demo batch ID. An active submission batch must be provisioned in PostgreSQL first.',
    };
  }

  if (!records || records.length === 0) {
    return {
      data: null,
      error: 'Cannot persist batch: No valid records provided in submission payload.',
    };
  }

  try {
    const { data, error } = await supabase.rpc('submit_enrolment_batch_atomic', {
      p_batch_id: batchId,
      p_records: records,
    });

    if (error) {
      const safeMsg = maskSensitiveData(error.message || 'Database RPC invocation failed');
      
      // Provide clear diagnostic guidance if the migration has not been applied to PostgreSQL
      if (error.code === '42883' || safeMsg.toLowerCase().includes('does not exist')) {
        return {
          data: null,
          error: `Database RPC 'submit_enrolment_batch_atomic' is not deployed on the active database instance. Please review and apply the proposed migration in 'docs/AICTE_APAAR_P0_1_STUDENT_ENROLMENT_PERSISTENCE_SPECIFICATION.md'. [Detail: ${safeMsg}]`,
        };
      }

      return {
        data: null,
        error: `Server persistence error [${error.code || 'UNKNOWN'}]: ${safeMsg}`,
      };
    }

    if (!data) {
      return {
        data: null,
        error: 'Server persistence operation returned an empty response. Transaction may have rolled back.',
      };
    }

    return {
      data: data as BatchEnrolmentResponse,
      error: null,
    };
  } catch (err: any) {
    const safeError = maskSensitiveData(err?.message || 'Unexpected network or client failure during batch submission.');
    return {
      data: null,
      error: `Network or connectivity failure: ${safeError}`,
    };
  }
}
