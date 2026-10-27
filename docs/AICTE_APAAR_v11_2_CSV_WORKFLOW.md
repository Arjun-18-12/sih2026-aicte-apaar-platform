# AICTE–APAAR Student Data Management Platform
## End-to-End CSV Submission & Enrolment Specification (v11.2)
**Document Status:** OFFICIAL WORKFLOW & API SPECIFICATION  
**Repository:** `D:\aicte-apaar-platform`  
**Target Code:** `src/pages/institution/CSVUploadPage.tsx`  

---

## 1. End-to-End CSV Processing Architecture

### A. The 10-Stage Pipeline
1. **Batch Creation:** Institution Admin initiates upload. Frontend calls `INSERT INTO submission_batches (institution_id, academic_year, status) VALUES (inst_id, year, 'draft') RETURNING id;`.
2. **Client Parsing & Format Sanitization:** PapaParse reads rows in browser. Rejects rows missing mandatory headers (`full_name`, `dob`, `gender`, `institution_student_id`).
3. **APAAR Input Validation:**
   - Validates candidate APAAR: asserts input matches `^[0-9\s\-]+$`. Any input containing letters or symbols is flagged as an invalid format error.
   - Normalizes by stripping spaces and hyphens. Asserts length = 12 digits.
4. **Row-Level Atomic Processing:** For each valid row, client invokes `enrol_student_atomic()`.
5. **Intake Lock & Quota Verification:** Procedure acquires `FOR UPDATE` lock on `approved_intakes`. Counts active enrolments. If limit reached, throws `54000 (Intake capacity exceeded)`.
6. **Dual-Constraint Idempotency Check:**
   - Checks if `(institution_id, institution_student_id, academic_year)` exists.
   - Checks if `(student_id, institution_id, programme_id, academic_year)` exists.
   - If exact match exists: returns existing `enrolment_id` with status `'already_enrolled'`.
7. **Identity Resolution:**
   - If candidate APAAR exists in `students`: compares normalized name and DOB.
   - On mismatch: creates candidate student with `candidate_apaar_id = NULL`, inserts `duplicate_review_cases` with token `ERR_DEMOGRAPHIC_MISMATCH`, returns `'duplicate_review_required'`. Commits cleanly.
8. **Enrolment Creation:** Inserts into `public.enrolments` with `submission_status = 'draft'` and `enrolment_status = 'active'`.
9. **Batch Counter Finalization:** Updates `submission_batches` counters (`total_records`, `valid_records`, `error_records`).
10. **Institutional Submission & Review:**
    - Admin clicks "Submit Batch". Frontend updates batch to `'submitted'`.
    - Trigger `enforce_batch_state_transitions` validates allowed transition.
    - Associated enrolments sync to `'submitted'`. Batch is locked from institutional edits.

---

## 2. API Contract for `enrol_student_atomic`

```sql
CREATE OR REPLACE FUNCTION public.enrol_student_atomic(
  p_institution_id uuid,
  p_programme_id uuid,
  p_academic_year text,
  p_batch_id uuid,
  p_institution_student_id text,
  p_full_name text,
  p_date_of_birth date,
  p_gender text,
  p_candidate_apaar_id text DEFAULT NULL
)
RETURNS public.enrolment_result
```

### Output Structure (`public.enrolment_result`)
- `enrolment_id`: UUID of created/existing enrolment.
- `student_id`: UUID of student record.
- `duplicate_case_id`: UUID of review case (if conflict detected).
- `status_code`: `'enrolled'` | `'already_enrolled'` | `'duplicate_review_required'`.
- `message`: Human-readable outcome description.

---

## 3. Required Frontend Changes in `src/pages/institution/CSVUploadPage.tsx`

1. **Remove Empty Batch Submission:** Remove lines 123–140 where an empty batch is created without database student records.
2. **Implement Chunked Atomic Calling:** In `processBatchUpload()`, process parsed rows in chunks of 25 using `supabase.rpc('enrol_student_atomic', ...)`.
3. **Display Structured Outcomes:** Update results view to display flagged rows with direct links to the Duplicate Review Case ID.
