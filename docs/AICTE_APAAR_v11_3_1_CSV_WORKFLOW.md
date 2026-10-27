# AICTE–APAAR Student Data Management Platform
## End-to-End CSV Processing & Enrolment Contract (v11.3.1)
**Document Status:** OFFICIAL WORKFLOW & API CONTRACT — FOR STAGING REVIEW ONLY  
**Repository:** `D:\aicte-apaar-platform`  
**Review Version:** v11.3.1 (Remediation of Batch Counter Semantics and Cross-Tenant Privacy)  
**Review Date:** 2026-10-24  
**Operating Mode:** STRICTLY READ-ONLY (No SQL executed; no database altered; all tests marked `NOT EXECUTED` or `BLOCKED`)

---

## 1. Architectural Separation: Proposed SQL vs. Current Repository State

> [!IMPORTANT]
> **Status Declaration:**  
> The database functions, triggers, and types defined in this document represent the **PROPOSED DATABASE CONTRACT (v11.3.1)**.  
> The React application source code at `src/pages/institution/CSVUploadPage.tsx` currently uses legacy direct table inserts. **NO FRONTEND FILES HAVE BEEN MODIFIED IN THE REPOSITORY.**  
> Section 6 of this document defines the exact TypeScript implementation contract required when a dedicated frontend staging branch is opened.

---

## 2. Authoritative Batch Counter Semantics & Data Integrity

### 2.1 The Accounting Failure in v11.3
In v11.3, the counter trigger calculated:
```sql
-- FLAWED v11.3 COUNTER TRIGGER:
valid_records = (SELECT COUNT(*) FROM public.enrolments WHERE batch_id = v_batch_id);
error_records = (SELECT COUNT(*) FROM public.submission_errors WHERE batch_id = v_batch_id);
total_records = valid_records + error_records;
```
**Why this breaks:**
1. **Multi-Error Rows:** A single CSV row (e.g., Row 4) containing both an invalid date of birth and an invalid candidate APAAR generates two error rows in `public.submission_errors`. The v11.3 trigger counted this as 2 errors. A 10-row CSV with 9 valid rows and 1 invalid row reported `valid_records = 9, error_records = 2, total_records = 11`—exceeding the number of rows in the source file!
2. **Retry Clutter:** If a user retried a failed chunk without deleting previous errors, duplicate error entries accumulated in `submission_errors`, further distorting batch statistics.
3. **Concurrent Chunk Interleaving:** Parallel chunk uploads could trigger concurrent, un-serialized counter updates, resulting in lost updates.

### 2.2 The Authoritative v11.3.1 Counter Contract
v11.3.1 establishes mathematically sound counter semantics based on **distinct source CSV rows**:

- **Stable Source Row Identity:** Every row in an uploaded CSV is uniquely identified within a batch by its 1-indexed line number: `row_number` (integer) and its institutional identifier: `institution_student_id` (text).
- **`error_records` (Authoritative Definition):**  
  The count of **distinct CSV row numbers** in `public.submission_errors` associated with this batch that currently have unresolved errors:
  ```sql
  error_records = (SELECT COUNT(DISTINCT row_number) FROM public.submission_errors WHERE batch_id = v_batch_id);
  ```
- **`valid_records` (Authoritative Definition):**  
  The count of distinct successful enrolments created or linked under this batch:
  ```sql
  valid_records = (SELECT COUNT(*) FROM public.enrolments WHERE batch_id = v_batch_id);
  ```
- **`total_records` (Authoritative Definition):**  
  The exact sum of unique valid rows and unique error rows processed for this batch:
  ```sql
  total_records = valid_records + error_records;
  ```
- **Concurrent Chunk Serialization:**  
  The counter trigger acquires a row lock (`FOR UPDATE`) on `submission_batches` before calculating counts, ensuring parallel chunk dispatches serialize cleanly without deadlocks or dirty reads.
- **Retry Hygiene Contract:**  
  When the client retries a failed row or chunk, it must first execute:
  ```typescript
  await supabase.from('submission_errors').delete().match({ batch_id: batchId, row_number: rowIdx + 1 });
  ```
  If the retry succeeds, `enrol_student_atomic` creates an enrolment row. The trigger automatically decrements `error_records` and increments `valid_records`, maintaining 100% accounting accuracy.

---

## 3. The 10-Stage CSV Processing Lifecycle

The diagram below details the end-to-end ingestion pipeline from CSV parsing to atomic enrolment, counter auto-synchronization, and privacy-preserving duplicate review:

```mermaid
flowchart TD
  subgraph Stage 1: Batch Initialization
    A[Admin Selects Programme & Year] --> B[Create submission_batches: status='draft']
  end

  subgraph Stage 2: Client Parsing & Chunking
    B --> C[PapaParse CSV Stream]
    C --> D[Header & Client Validation]
    D --> E[Slice Rows into Chunks of 25]
  end

  subgraph Stage 3: Atomic Ingestion per Row
    E --> F[Invoke enrol_student_atomic]
    F --> G{Acquire Advisory Lock: enrol_inst_id_year}
    G --> H{Stage 3a: Enrolment Exists on inst_student_id?}
    H -->|Demographics Match| I[Return status_code='already_enrolled']
    H -->|Identity Conflict| J[Raise 23505: Conflicting Identity]
    H -->|Programme Conflict| K[Raise 23505: Conflicting Enrolment]
    H -->|Not Found: New Enrolment| L[Lock Approved Intake FOR UPDATE]
    L --> M{Stage 3b: Current Count < Quota Limit?}
    M -->|Quota Full| N[Raise 54000: Intake Capacity Exceeded]
    M -->|Capacity Available| O[Validate Candidate APAAR Format: ^0-9s-]+$]
    O --> P{Stage 3c: Candidate APAAR Conflict?}
    P -->|Demographics Match| Q[Link Existing Student & Create Enrolment]
    P -->|Demographics Differ| R[Insert duplicate_review_cases: Return duplicate_review_required]
    P -->|New APAAR / No APAAR| S[Insert Student with candidate_apaar_id]
    Q --> T[Insert Enrolment: Return status_code='enrolled']
    S --> T
  end

  subgraph Stage 4: Tamper-Proof Counter Auto-Sync
    T --> U[Trigger trg_sync_enrolment_counters Fires]
    R --> V[Client Inserts submission_errors]
    J --> V
    N --> V
    V --> W[Trigger trg_sync_error_counters Fires]
    U --> X[Row Lock submission_batches FOR UPDATE]
    W --> X
    X --> Y[Re-compute: valid=COUNT, errors=COUNT DISTINCT row_number]
  end

  subgraph Stage 5: Final Submission
    Y --> Z[Admin Clicks Submit Batch]
    Z --> AA[Trigger enforce_batch_state_transitions Validates: status='submitted']
  end
```

---

## 4. Detailed Stage Contracts

### Stage 1: Batch Initialization
The institution administrator selects an approved programme and academic year. The frontend creates a draft batch:
```typescript
const { data: batch, error } = await supabase
  .from('submission_batches')
  .insert({
    institution_id: currentInstitutionId,
    programme_id: selectedProgrammeId,
    academic_year: selectedAcademicYear,
    batch_name: `Upload_${selectedProgrammeCode}_${Date.now()}`,
    status: 'draft'
  })
  .select()
  .single();
```
Direct client writes to `total_records`, `valid_records`, and `error_records` are revoked in PostgreSQL.

### Stage 2: Client-Side Chunking
- Rows are parsed using `PapaParse`.
- Chunk size is set to **25 rows** per dispatch to optimize HTTP connection multiplexing and avoid gateway timeouts.

### Stage 3: Atomic Enrolment Contract (`enrol_student_atomic`)

#### 3.1 Transaction-Level Advisory Lock
```sql
PERFORM pg_advisory_xact_lock(hashtext('enrol_' || p_institution_id::text || '_' || p_institution_student_id || '_' || p_academic_year));
```
Serializes concurrent retries and prevents unhandled unique key constraint collisions.

#### 3.2 Pre-Capacity Idempotency Check (Defect F-11.3-01 Resolution)
Executes before acquiring intake locks or creating student records:
```sql
SELECT id, student_id, programme_id, enrolment_status
INTO v_existing_enrolment_id, v_existing_student_id, v_existing_prog_id, v_existing_enrol_status
FROM public.enrolments
WHERE institution_id = p_institution_id
  AND institution_student_id = p_institution_student_id
  AND academic_year = p_academic_year;

IF FOUND THEN
  IF v_existing_prog_id = p_programme_id THEN
    SELECT full_name, date_of_birth INTO v_existing_name, v_existing_dob
    FROM public.students WHERE id = v_existing_student_id;

    IF lower(trim(v_existing_name)) = lower(trim(p_full_name)) AND 
       (v_existing_dob IS NULL OR v_existing_dob = p_date_of_birth) THEN
      v_res.enrolment_id := v_existing_enrolment_id;
      v_res.student_id := v_existing_student_id;
      v_res.duplicate_case_id := NULL;
      v_res.status_code := 'already_enrolled';
      v_res.message := 'Idempotent retry: student already enrolled in programme.';
      RETURN v_res;
    ELSE
      RAISE EXCEPTION 'Conflicting identity: institution_student_id % belongs to a student with different demographics', p_institution_student_id
        USING ERRCODE = '23505';
    END IF;
  ELSE
    RAISE EXCEPTION 'Conflicting enrolment: institution_student_id % already enrolled in a different programme', p_institution_student_id
      USING ERRCODE = '23505';
  END IF;
END IF;
```

#### 3.3 Intake Limit Evaluation
Row-locks the `approved_intakes` entry and evaluates current active count:
```sql
SELECT approved_intake INTO v_intake_limit
FROM public.approved_intakes
WHERE institution_id = p_institution_id
  AND programme_id = p_programme_id
  AND academic_year = p_academic_year
FOR UPDATE;

SELECT COUNT(*) INTO v_current_count
FROM public.enrolments
WHERE institution_id = p_institution_id
  AND programme_id = p_programme_id
  AND academic_year = p_academic_year
  AND enrolment_status = 'active'::public.enrolment_status
  AND submission_status != 'rejected'::public.submission_status;

IF v_current_count >= v_intake_limit THEN
  RAISE EXCEPTION 'Intake capacity exceeded: current count % meets approved limit %',
    v_current_count, v_intake_limit
    USING ERRCODE = '54000';
END IF;
```

#### 3.4 Strict Candidate APAAR Validation & Duplicate Routing
```sql
IF p_candidate_apaar_id IS NOT NULL AND trim(p_candidate_apaar_id) != '' THEN
  IF trim(p_candidate_apaar_id) !~ '^[0-9\s\-]+$' THEN
    RAISE EXCEPTION 'Invalid APAAR format: identifier contains forbidden characters'
      USING ERRCODE = '22023';
  END IF;

  v_norm_apaar := regexp_replace(trim(p_candidate_apaar_id), '[^0-9]', '', 'g');
  IF length(v_norm_apaar) != 12 THEN
    RAISE EXCEPTION 'Invalid APAAR format: identifier must be exactly 12 numeric digits'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('candidate_apaar_' || v_norm_apaar));

  SELECT id, full_name, date_of_birth
  INTO v_student_id, v_existing_name, v_existing_dob
  FROM public.students
  WHERE apaar_id = v_norm_apaar OR candidate_apaar_id = v_norm_apaar
  LIMIT 1;

  IF FOUND THEN
    IF lower(trim(v_existing_name)) != lower(trim(p_full_name)) OR 
       (v_existing_dob IS NOT NULL AND v_existing_dob != p_date_of_birth) THEN
      
      -- Insert candidate student WITHOUT APAAR ID
      INSERT INTO public.students (full_name, date_of_birth, gender, candidate_apaar_id, apaar_id, apaar_verification_status, created_at, updated_at)
      VALUES (p_full_name, p_date_of_birth, p_gender, NULL, NULL, 'unverified'::public.apaar_verification_status, NOW(), NOW())
      RETURNING id INTO v_candidate_student_id;

      -- Create Duplicate Review Case referencing existing student (S1) and candidate (S2)
      INSERT INTO public.duplicate_review_cases (
        batch_id,
        student_id_1,
        student_id_2,
        detection_reason,
        review_status,
        created_at
      ) VALUES (
        p_batch_id,
        v_student_id,
        v_candidate_student_id,
        'ERR_DEMOGRAPHIC_MISMATCH: candidate APAAR matches existing registered record',
        'pending'::public.duplicate_review_status,
        NOW()
      )
      RETURNING id INTO v_case_id;

      v_res.enrolment_id := NULL;
      v_res.student_id := v_candidate_student_id;
      v_res.duplicate_case_id := v_case_id;
      v_res.status_code := 'duplicate_review_required';
      v_res.message := 'Identity conflict detected: submitted demographics do not match registered record. Routed to duplicate review.';
      RETURN v_res;
    END IF;
  ELSE
    INSERT INTO public.students (full_name, date_of_birth, gender, candidate_apaar_id, apaar_id, apaar_verification_status, created_at, updated_at)
    VALUES (p_full_name, p_date_of_birth, p_gender, v_norm_apaar, NULL, 'unverified'::public.apaar_verification_status, NOW(), NOW())
    RETURNING id INTO v_student_id;
  END IF;
ELSE
  INSERT INTO public.students (full_name, date_of_birth, gender, candidate_apaar_id, apaar_id, apaar_verification_status, created_at, updated_at)
  VALUES (p_full_name, p_date_of_birth, p_gender, NULL, NULL, 'unverified'::public.apaar_verification_status, NOW(), NOW())
  RETURNING id INTO v_student_id;
END IF;
```

---

## 5. Duplicate-Review Navigation Workflow (Privacy-Preserving)

When `enrol_student_atomic` returns `duplicate_review_required`:
1. The client inserts an error record into `public.submission_errors` with `row_number` and duplicate case reference.
2. In the UI, the row is marked with a direct link to `/institution/duplicate-review/${result.duplicate_case_id}`.
3. **Cross-Tenant Privacy Enforcement:**
   - Under `duplicate_cases_select`, the submitting college views the case metadata (`detection_reason`, status).
   - Under hardened `students_select`, the college can inspect **only** candidate student `student_id_2`.
   - The submitting college is strictly **BLOCKED** from querying `student_id_1` from another institution.
4. AICTE regulatory personnel review the case and adjudicate it (merging, creating separate identity, or rejecting).

---

## 6. Proposed Frontend Implementation (`CSVUploadPage.tsx`)

When approved for implementation on a frontend development branch, replace lines 123–170 of `src/pages/institution/CSVUploadPage.tsx` with the following chunked, error-hygienic processing logic:

```typescript
// PROPOSED IMPLEMENTATION FOR src/pages/institution/CSVUploadPage.tsx (v11.3.1)
const CHUNK_SIZE = 25;

async function processCSVChunks(
  rows: CSVRow[],
  batchId: string,
  institutionId: string,
  programmeId: string,
  academicYear: string
) {
  let processedCount = 0;
  let alreadyEnrolledCount = 0;
  let duplicateCaseCount = 0;
  let errorCount = 0;

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    
    await Promise.all(
      chunk.map(async (row, index) => {
        const rowNumber = i + index + 1;
        try {
          // Clean up any previous errors for this row before retry (Retry Hygiene)
          await supabase
            .from('submission_errors')
            .delete()
            .match({ batch_id: batchId, row_number: rowNumber });

          const { data, error } = await supabase.rpc('enrol_student_atomic', {
            p_institution_id: institutionId,
            p_programme_id: programmeId,
            p_academic_year: academicYear,
            p_batch_id: batchId,
            p_institution_student_id: row.institution_student_id.trim(),
            p_full_name: row.full_name.trim(),
            p_date_of_birth: row.date_of_birth,
            p_gender: row.gender.toLowerCase().trim(),
            p_candidate_apaar_id: row.candidate_apaar_id?.trim() || null
          });

          if (error) throw error;

          if (data.status_code === 'already_enrolled') {
            alreadyEnrolledCount++;
          } else if (data.status_code === 'duplicate_review_required') {
            duplicateCaseCount++;
            await supabase.from('submission_errors').insert({
              batch_id: batchId,
              row_number: rowNumber,
              error_field: 'candidate_apaar_id',
              error_message: `Demographics differ from existing APAAR record. Case ID: ${data.duplicate_case_id}`,
              raw_data: row
            });
          } else if (data.status_code === 'enrolled') {
            processedCount++;
          }
        } catch (err: any) {
          errorCount++;
          await supabase.from('submission_errors').insert({
            batch_id: batchId,
            row_number: rowNumber,
            error_field: 'general',
            error_message: err.message || 'Validation error during enrolment',
            raw_data: row
          });
        }
      })
    );
  }

  return { processedCount, alreadyEnrolledCount, duplicateCaseCount, errorCount };
}
```
