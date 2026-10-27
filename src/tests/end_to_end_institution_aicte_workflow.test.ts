import { describe, it, expect, beforeEach } from "vitest";
import { demoStore, DEMO_INSTITUTION_ID } from "../services/demoStore";
import type { BatchEnrolmentRecordInput } from "../types";

describe("Requirement 6: Complete End-to-End Institution-Upload & AICTE-Validation Workflow", () => {
  beforeEach(() => {
    demoStore.reset();
  });

  // 1. Institution uploads Valid Enrolments Quick Sample -> submission created without institution-side validation
  it("institution uploads Valid Enrolments Quick Sample: submission is created with status 'submitted' and zero institution errors", () => {
    const validEnrolmentsSampleRows: BatchEnrolmentRecordInput[] = [
      { row_number: 1, institution_student_id: "SRIT-2024-001", full_name: "Aarav Rajesh Sharma", apaar_id: "123456789012", programme_code: "BTECH-CS", academic_year: "2024-25", admission_date: "2024-07-15", admission_category: "general", gender: "male" },
      { row_number: 2, institution_student_id: "SRIT-2024-002", full_name: "Priya Sundaram Iyer", apaar_id: "987654321098", programme_code: "BTECH-CS", academic_year: "2024-25", admission_date: "2024-07-16", admission_category: "obc", gender: "female" },
      { row_number: 3, institution_student_id: "SRIT-2024-003", full_name: "Rohan Amit Deshmukh", apaar_id: "112233445566", programme_code: "BTECH-CS", academic_year: "2024-25", admission_date: "2024-07-16", admission_category: "sc", gender: "male" },
      { row_number: 4, institution_student_id: "SRIT-2024-004", full_name: "Ananya Vikram Verma", apaar_id: "998877665544", programme_code: "BTECH-CS", academic_year: "2024-25", admission_date: "2024-07-18", admission_category: "ews", gender: "female" },
      { row_number: 5, institution_student_id: "SRIT-2024-005", full_name: "Devendra Kumar Singh", apaar_id: "556677889900", programme_code: "BTECH-CS", academic_year: "2024-25", admission_date: "2024-07-19", admission_category: "st", gender: "male" },
    ];

    // Institution provisions batch and submits raw rows directly
    const { batchId, error: draftErr } = demoStore.createDraftBatch("2024-25", validEnrolmentsSampleRows.length, DEMO_INSTITUTION_ID);
    expect(draftErr).toBeNull();
    expect(batchId).toBeDefined();

    const result = demoStore.submitBatch(batchId!, DEMO_INSTITUTION_ID, "2024-25", validEnrolmentsSampleRows);
    expect(result.error).toBeNull();
    expect(result.data).toBeDefined();
    expect(result.data?.success).toBe(true);
    expect(result.data?.batch_status).toBe("submitted");
    expect(result.data?.total_records).toBe(5);
    expect(result.data?.accepted_records).toBe(5);
    expect(result.data?.rejected_records).toBe(0);
    expect(result.data?.duplicate_records).toBe(0);

    // Verify batch in store
    const batches = demoStore.getBatches(DEMO_INSTITUTION_ID);
    const submittedBatch = batches.find(b => b.id === batchId);
    expect(submittedBatch).toBeDefined();
    expect(submittedBatch?.status).toBe("submitted");
    expect(submittedBatch?.valid_records).toBe(5);
    expect(submittedBatch?.error_records).toBe(0);
  });

  // 2. Institution uploads Supernumerary Enrolments Quick Sample -> submission created without institution-side validation
  it("institution uploads Supernumerary Enrolments Quick Sample: submission is created with status 'submitted' within approved quota", () => {
    const supernumerarySampleRows: BatchEnrolmentRecordInput[] = [
      { row_number: 1, institution_student_id: "SRIT-2024-NRI-01", full_name: "Zack Tariq Merchant", apaar_id: "334455667788", programme_code: "BTECH-CS", academic_year: "2024-25", admission_date: "2024-07-20", admission_category: "nri", gender: "male", supernumerary_classification: "nri", is_nri: true },
      { row_number: 2, institution_student_id: "SRIT-2024-OCI-01", full_name: "Maya Elena Patel", apaar_id: "445566778899", programme_code: "BTECH-CS", academic_year: "2024-25", admission_date: "2024-07-21", admission_category: "oci", gender: "female", supernumerary_classification: "oci", is_oci: true },
      { row_number: 3, institution_student_id: "SRIT-2024-FN-01", full_name: "Lucas Jean Dubois", apaar_id: "556677889911", programme_code: "BTECH-CS", academic_year: "2024-25", admission_date: "2024-07-22", admission_category: "foreign_national", gender: "male", supernumerary_classification: "fn", is_foreign_national: true },
    ];

    const { batchId } = demoStore.createDraftBatch("2024-25", supernumerarySampleRows.length, DEMO_INSTITUTION_ID);
    const result = demoStore.submitBatch(batchId!, DEMO_INSTITUTION_ID, "2024-25", supernumerarySampleRows);

    expect(result.error).toBeNull();
    expect(result.data?.success).toBe(true);
    expect(result.data?.batch_status).toBe("submitted");
    expect(result.data?.total_records).toBe(3);
    expect(result.data?.accepted_records).toBe(3);
    expect(result.data?.rejected_records).toBe(0);

    // Verify row-level supernumerary status
    expect(result.data?.row_results[0].status).toBe("accepted");
    expect(result.data?.row_results[1].status).toBe("accepted");
    expect(result.data?.row_results[2].status).toBe("accepted");
  });

  // 3. AICTE opens submitted batch -> all applicable validations run there and details are displayed
  it("AICTE opens submitted batch: all applicable record validations are available with row-level diagnostics", () => {
    const { batchId } = demoStore.createDraftBatch("2024-25", 2, DEMO_INSTITUTION_ID);
    demoStore.submitBatch(batchId!, DEMO_INSTITUTION_ID, "2024-25", [
      { row_number: 1, institution_student_id: "SRIT-AICTE-01", full_name: "Vikram Malhotra", programme_code: "BTECH-CS", academic_year: "2024-25", admission_date: "2024-07-15", admission_category: "general", apaar_id: "123456789012" },
      { row_number: 2, institution_student_id: "SRIT-AICTE-02", full_name: "Sunita Reddy", programme_code: "BTECH-CS", academic_year: "2024-25", admission_date: "2024-07-16", admission_category: "obc", apaar_id: "987654321098" },
    ]);

    // AICTE opens batch
    const details = demoStore.getBatchDetails(batchId!);
    expect(details.batch).toBeDefined();
    expect(details.batch?.status).toBe("submitted");
    expect(details.rowResults).toHaveLength(2);
    expect(details.enrolments).toHaveLength(2);

    expect(details.rowResults[0].status).toBe("accepted");
    expect(details.rowResults[1].status).toBe("accepted");
    expect(details.enrolments[0].student?.apaar_verification_status).toBe("verified");
  });

  // 4. Genuine duplicates are flagged by AICTE
  it("genuine duplicates (intra-batch and cross-submission against previous approved) are flagged by AICTE", () => {
    // SRIT2024001 is seeded as an approved enrolment in batch b1
    const { batchId } = demoStore.createDraftBatch("2024-25", 3, DEMO_INSTITUTION_ID);
    const mixedRecords: BatchEnrolmentRecordInput[] = [
      {
        row_number: 1,
        institution_student_id: "SRIT2024001", // Duplicate of previous approved submission!
        full_name: "Duplicate Of Approved Student",
        programme_code: "BTECH-CS",
        academic_year: "2024-25",
        admission_date: "2024-07-15",
        admission_category: "general",
      },
      {
        row_number: 2,
        institution_student_id: "SRIT-UNIQUE-01",
        full_name: "Unique Student",
        programme_code: "BTECH-CS",
        academic_year: "2024-25",
        admission_date: "2024-07-15",
        admission_category: "general",
      },
      {
        row_number: 3,
        institution_student_id: "SRIT-UNIQUE-01", // Duplicate within same batch!
        full_name: "Duplicate of Row 2",
        programme_code: "BTECH-CS",
        academic_year: "2024-25",
        admission_date: "2024-07-15",
        admission_category: "general",
      },
    ];

    const result = demoStore.submitBatch(batchId!, DEMO_INSTITUTION_ID, "2024-25", mixedRecords);
    expect(result.data).toBeDefined();
    expect(result.data?.accepted_records).toBe(1);
    expect(result.data?.duplicate_records).toBe(2);

    // AICTE examines validation diagnostics
    const row1 = result.data?.row_results.find(r => r.row_number === 1);
    expect(row1?.status).toBe("duplicate");
    expect(row1?.error_message).toContain("already enrolled in this institution");

    const row3 = result.data?.row_results.find(r => r.row_number === 3);
    expect(row3?.status).toBe("duplicate");
    expect(row3?.error_message).toContain("within the same submission batch");
  });

  // 5. AICTE Administrator approves valid batch -> enrolments cascade to approved status
  it("AICTE administrator approves batch: cascades approval status to enrolments", () => {
    const { batchId } = demoStore.createDraftBatch("2024-25", 1, DEMO_INSTITUTION_ID);
    demoStore.submitBatch(batchId!, DEMO_INSTITUTION_ID, "2024-25", [
      { row_number: 1, institution_student_id: "SRIT-CASCADE-01", full_name: "Cascade Student", programme_code: "BTECH-CS", academic_year: "2024-25", admission_date: "2024-07-15", admission_category: "general" }
    ]);

    // AICTE decides to approve
    const approved = demoStore.updateBatchStatus(batchId!, "approved", "Approved by AICTE review board");
    expect(approved).toBe(true);

    const batches = demoStore.getBatches(DEMO_INSTITUTION_ID);
    const batch = batches.find(b => b.id === batchId);
    expect(batch?.status).toBe("approved");
    expect(batch?.reviewer_notes).toBe("Approved by AICTE review board");

    // Check that enrolment is now approved
    const enrolments = demoStore.getEnrolments(DEMO_INSTITUTION_ID);
    const enrolment = enrolments.find(e => e.institution_student_id === "SRIT-CASCADE-01");
    expect(enrolment?.submission_status).toBe("approved");

    // If another batch later attempts to submit SRIT-CASCADE-01, AICTE flags it as duplicate of previous approved submission
    const { batchId: batchId2 } = demoStore.createDraftBatch("2024-25", 1, DEMO_INSTITUTION_ID);
    const reSubmitResult = demoStore.submitBatch(batchId2!, DEMO_INSTITUTION_ID, "2024-25", [
      { row_number: 1, institution_student_id: "SRIT-CASCADE-01", full_name: "Same Student ID", programme_code: "BTECH-CS", academic_year: "2024-25", admission_date: "2024-07-15", admission_category: "general" }
    ]);
    expect(reSubmitResult.data?.duplicate_records).toBe(1);
    expect(reSubmitResult.data?.row_results[0].status).toBe("duplicate");
    expect(reSubmitResult.data?.row_results[0].error_message).toContain("already enrolled in this institution");
  });

  // 6. AICTE Administrator returns batch for correction with notes
  it("AICTE administrator returns batch for correction: stores reviewer feedback for institution", () => {
    const { batchId } = demoStore.createDraftBatch("2024-25", 1, DEMO_INSTITUTION_ID);
    demoStore.submitBatch(batchId!, DEMO_INSTITUTION_ID, "2024-25", [
      { row_number: 1, institution_student_id: "SRIT-RETURN-01", full_name: "Student Needing Fix", programme_code: "BTECH-CS", academic_year: "2024-25", admission_date: "2024-07-15", admission_category: "general" }
    ]);

    const returned = demoStore.updateBatchStatus(batchId!, "returned_for_correction", "Please provide candidate APAAR ID consent form.");
    expect(returned).toBe(true);

    const batches = demoStore.getBatches(DEMO_INSTITUTION_ID);
    const batch = batches.find(b => b.id === batchId);
    expect(batch?.status).toBe("returned_for_correction");
    expect(batch?.reviewer_notes).toBe("Please provide candidate APAAR ID consent form.");
  });
});
