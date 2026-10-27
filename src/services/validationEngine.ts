import type { CSVRow, ValidationResult, RowError, RowWarning, ApprovedIntake } from '../types';
import { validateApaarFormat } from '../lib/utils';

const REQUIRED_FIELDS: (keyof CSVRow)[] = [
  'institution_student_id',
  'full_name',
  'programme_code',
  'academic_year',
  'admission_date',
  'admission_category',
];

const VALID_CATEGORIES = [
  'general', 'sc', 'st', 'obc', 'ews', 'pwd',
  'nri', 'oci', 'foreign_national', 'management_quota', 'other'
];

const VALID_SUPERNUMERARY = ['nri', 'oci', 'fn', 'pwd_extra', 'tuition_fee_waiver', 'kashmiri_migrants', 'none', ''];
const VALID_GENDERS = ['male', 'female', 'other', 'prefer_not_to_say', ''];
const AY_REGEX = /^\d{4}-\d{2}$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function validateCSVRow(
  row: CSVRow,
  existingStudentIds: Set<string>,
  batchStudentIds: Set<string>,
  intakeData: ApprovedIntake | undefined,
  currentRegularCount: number,
  currentSupernumeraryCount: number
): ValidationResult {
  const errors: RowError[] = [];
  const warnings: RowWarning[] = [];

  for (const field of REQUIRED_FIELDS) {
    const v = row[field];
    if (!v || String(v).trim() === '') {
      errors.push({ field: String(field), message: `${field} is required.`, type: 'missing_field' });
    }
  }

  if (row.apaar_id && row.apaar_id.trim()) {
    if (!validateApaarFormat(row.apaar_id.trim())) {
      errors.push({ field: 'apaar_id', message: 'APAAR ID must be exactly 12 digits.', type: 'apaar_invalid' });
    }
  } else {
    warnings.push({ field: 'apaar_id', message: 'APAAR ID not provided. Verification will be marked as unverified.' });
  }

  if (row.academic_year && !AY_REGEX.test(String(row.academic_year))) {
    errors.push({ field: 'academic_year', message: 'Academic year must be in format YYYY-YY (e.g. 2024-25).', type: 'consistency' });
  }

  if (row.admission_date && !DATE_REGEX.test(String(row.admission_date))) {
    errors.push({ field: 'admission_date', message: 'Admission date must be in format YYYY-MM-DD.', type: 'consistency' });
  }

  if (row.admission_category && !VALID_CATEGORIES.includes(String(row.admission_category).toLowerCase())) {
    errors.push({ field: 'admission_category', message: `Invalid category "${row.admission_category}". Valid: ${VALID_CATEGORIES.join(', ')}.`, type: 'consistency' });
  }

  if (row.gender && !VALID_GENDERS.includes(String(row.gender).toLowerCase())) {
    errors.push({ field: 'gender', message: `Invalid gender "${row.gender}".`, type: 'consistency' });
  }

  if (row.supernumerary_classification && !VALID_SUPERNUMERARY.includes(String(row.supernumerary_classification).toLowerCase())) {
    errors.push({ field: 'supernumerary_classification', message: `Invalid supernumerary classification "${row.supernumerary_classification}".`, type: 'consistency' });
  }

  const isNRI = row.is_nri === 'true' || row.is_nri === '1';
  const isOCI = row.is_oci === 'true' || row.is_oci === '1';
  const isFN = row.is_foreign_national === 'true' || row.is_foreign_national === '1';
  const cat = String(row.admission_category || '').toLowerCase();

  if (isNRI && cat !== 'nri') warnings.push({ field: 'is_nri', message: 'is_nri is true but admission_category is not "nri". Please verify.' });
  if (isOCI && cat !== 'oci') warnings.push({ field: 'is_oci', message: 'is_oci is true but admission_category is not "oci". Please verify.' });
  if (isFN && cat !== 'foreign_national') warnings.push({ field: 'is_foreign_national', message: 'is_foreign_national is true but admission_category is not "foreign_national".' });

  const sid = String(row.institution_student_id || '');
  if (sid && batchStudentIds.has(sid)) {
    errors.push({ field: 'institution_student_id', message: `Duplicate institution_student_id "${sid}" within this batch.`, type: 'duplicate' });
  }
  if (sid && existingStudentIds.has(sid)) {
    errors.push({ field: 'institution_student_id', message: `institution_student_id "${sid}" already exists in a previous approved submission.`, type: 'duplicate' });
  }

  if (intakeData) {
    const supClass = String(row.supernumerary_classification || 'none').toLowerCase();
    const isSupernumerary = supClass !== 'none' && supClass !== '';

    if (!isSupernumerary) {
      if (currentRegularCount >= intakeData.approved_intake) {
        errors.push({ field: 'institution_student_id', message: `Regular intake limit (${intakeData.approved_intake}) exceeded. Current: ${currentRegularCount}. Exception review required.`, type: 'intake_exceeded' });
      }
    } else {
      if (currentSupernumeraryCount >= intakeData.total_supernumerary) {
        errors.push({ field: 'supernumerary_classification', message: `Supernumerary capacity (${intakeData.total_supernumerary}) exceeded. Current: ${currentSupernumeraryCount}. Exception review required.`, type: 'supernumerary_exceeded' });
      }
    }
  }

  return {
    row_number: row.row_number as number,
    institution_student_id: String(row.institution_student_id || ''),
    is_valid: errors.length === 0,
    errors,
    warnings,
    data: row,
  };
}

export function validateCSVHeaders(headers: string[]): { valid: boolean; missing: string[] } {
  const required = ['institution_student_id', 'full_name', 'programme_code', 'academic_year', 'admission_date', 'admission_category'];
  const missing = required.filter(r => !headers.map(h => h.toLowerCase().trim()).includes(r));
  return { valid: missing.length === 0, missing };
}

export function parseCSVToRows(rawRows: Record<string, string>[]): CSVRow[] {
  return rawRows.map((row, i) => {
    const normalized: Record<string, string | number | undefined> = { row_number: i + 2 };
    for (const [k, v] of Object.entries(row)) {
      normalized[k.toLowerCase().trim().replace(/\s+/g, '_')] = v?.trim() || '';
    }
    return normalized as CSVRow;
  });
}
