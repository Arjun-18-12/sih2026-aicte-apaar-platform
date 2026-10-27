import { describe, it, expect, beforeEach, vi } from "vitest";
import { demoStore, DEMO_INSTITUTION_ID } from "../services/demoStore";
import { supabase } from "../lib/supabase";
import type { BatchEnrolmentRecordInput } from "../types";

describe("Task 2: Local Synthetic CSV Upload & Demo Persistence", () => {
  beforeEach(() => {
    demoStore.reset();
    vi.clearAllMocks();
  });

  it("creates a synthetic draft batch with valid identifier and institution metadata", () => {
    const { batchId, error } = demoStore.createDraftBatch("2024-25", 5, DEMO_INSTITUTION_ID);

    expect(error).toBeNull();
    expect(batchId).toBeDefined();
    expect(batchId).toMatch(/^DEMO-BATCH-\d{8}-\d{4}$/);

    const batches = demoStore.getBatches(DEMO_INSTITUTION_ID);
    const created = batches.find(b => b.id === batchId);
    expect(created).toBeDefined();
    expect(created?.status).toBe("draft");
    expect(created?.total_records).toBe(5);
    expect(created?.institution_id).toBe(DEMO_INSTITUTION_ID);
  });

  it("rejects draft batch creation with invalid parameters", () => {
    const invalidYear = demoStore.createDraftBatch("2024", 5);
    expect(invalidYear.batchId).toBeNull();
    expect(invalidYear.error).toContain("YYYY-YY");

    const zeroRecords = demoStore.createDraftBatch("2024-25", 0);
    expect(zeroRecords.batchId).toBeNull();
    expect(zeroRecords.error).toContain("at least one record");
  });

  it("persists valid synthetic CSV records and reflects them in enrolments", () => {
    const { batchId } = demoStore.createDraftBatch("2024-25", 2);
    expect(batchId).toBeTruthy();

    const validRecords: BatchEnrolmentRecordInput[] = [
      {
        row_number: 1,
        institution_student_id: "SRIT-2024-TEST-01",
        full_name: "Aarav Rajesh Sharma",
        programme_code: "BTECH-CS",
        academic_year: "2024-25",
        admission_date: "2024-07-15",
        admission_category: "general",
        gender: "male",
        apaar_id: "123456789012",
      },
      {
        row_number: 2,
        institution_student_id: "SRIT-2024-TEST-02",
        full_name: "Priya Sundaram Iyer",
        programme_code: "BTECH-CS",
        academic_year: "2024-25",
        admission_date: "2024-07-16",
        admission_category: "obc",
        gender: "female",
        apaar_id: "987654321098",
      },
    ];

    const result = demoStore.submitBatch(batchId!, DEMO_INSTITUTION_ID, "2024-25", validRecords);

    expect(result.error).toBeNull();
    expect(result.data).toBeDefined();
    expect(result.data?.success).toBe(true);
    expect(result.data?.accepted_records).toBe(2);
    expect(result.data?.rejected_records).toBe(0);
    expect(result.data?.batch_status).toBe("submitted");
    expect(result.data?.row_results).toHaveLength(2);
    expect(result.data?.row_results[0].status).toBe("accepted");
    expect(result.data?.row_results[1].status).toBe("accepted");

    // Verify enrolments retrieval
    const enrolments = demoStore.getEnrolments(DEMO_INSTITUTION_ID);
    const student1 = enrolments.find(e => e.institution_student_id === "SRIT-2024-TEST-01");
    expect(student1).toBeDefined();
    expect(student1?.student?.full_name).toBe("Aarav Rajesh Sharma");
    expect(student1?.student?.apaar_verification_status).toBe("verified");
    expect(student1?.student?.apaar_verification_source).toBe("simulated_local_demo");
  });

  it("flags intra-batch duplicates and existing institution duplicates", () => {
    const { batchId } = demoStore.createDraftBatch("2024-25", 3);

    const recordsWithDuplicates: BatchEnrolmentRecordInput[] = [
      {
        row_number: 1,
        institution_student_id: "SRIT2024001", // Already exists in seed enrolments!
        full_name: "Duplicate Of Existing",
        programme_code: "BTECH-CS",
        academic_year: "2024-25",
        admission_date: "2024-07-15",
        admission_category: "general",
      },
      {
        row_number: 2,
        institution_student_id: "SRIT-2024-NEW-01",
        full_name: "Original Student",
        programme_code: "BTECH-CS",
        academic_year: "2024-25",
        admission_date: "2024-07-15",
        admission_category: "general",
      },
      {
        row_number: 3,
        institution_student_id: "SRIT-2024-NEW-01", // Duplicate within same batch!
        full_name: "Same ID in Batch",
        programme_code: "BTECH-CS",
        academic_year: "2024-25",
        admission_date: "2024-07-16",
        admission_category: "general",
      },
    ];

    const result = demoStore.submitBatch(batchId!, DEMO_INSTITUTION_ID, "2024-25", recordsWithDuplicates);

    expect(result.data).toBeDefined();
    expect(result.data?.accepted_records).toBe(1);
    expect(result.data?.duplicate_records).toBe(2);
    expect(result.data?.rejected_records).toBe(2);

    const row1 = result.data?.row_results.find(r => r.row_number === 1);
    expect(row1?.status).toBe("duplicate");
    expect(row1?.error_message).toContain("already enrolled in this institution");

    const row3 = result.data?.row_results.find(r => r.row_number === 3);
    expect(row3?.status).toBe("duplicate");
    expect(row3?.error_message).toContain("within the same submission batch");
  });

  it("detects APAAR demographic mismatches and provisions duplicate review cases", () => {
    const { batchId } = demoStore.createDraftBatch("2024-25", 1);

    // Arjun Sharma has apaar_id 111122223333 in seed data
    const conflictingStudent: BatchEnrolmentRecordInput[] = [
      {
        row_number: 1,
        institution_student_id: "SRIT-2024-MISMATCH",
        full_name: "Completely Different Name", // Conflict!
        programme_code: "BTECH-CS",
        academic_year: "2024-25",
        admission_date: "2024-07-15",
        admission_category: "general",
        apaar_id: "111122223333",
      },
    ];

    const result = demoStore.submitBatch(batchId!, DEMO_INSTITUTION_ID, "2024-25", conflictingStudent);

    expect(result.data?.accepted_records).toBe(0);
    expect(result.data?.duplicate_records).toBe(1);
    expect(result.data?.batch_status).toBe("validation_failed");

    const dupCases = demoStore.getDuplicateCases();
    expect(dupCases.length).toBeGreaterThan(0);
    const createdCase = dupCases.find(c => c.batch_id === batchId);
    expect(createdCase).toBeDefined();
    expect(createdCase?.detection_reason).toContain("Demographic mismatch");
    expect(createdCase?.review_status).toBe("pending");
  });

  it("guarantees demo operations never invoke Supabase RPCs or database mutations", () => {
    const rpcSpy = vi.spyOn(supabase, "rpc");
    const fromSpy = vi.spyOn(supabase, "from");

    // 1. Batch creation
    const { batchId } = demoStore.createDraftBatch("2024-25", 2);
    // 2. Intakes and programmes check
    demoStore.getInstitutionProgrammesAndIntakes(DEMO_INSTITUTION_ID, "2024-25");
    // 3. Batch submission
    demoStore.submitBatch(batchId!, DEMO_INSTITUTION_ID, "2024-25", [
      {
        row_number: 1,
        institution_student_id: "SRIT-OFFLINE-001",
        full_name: "Offline Synthetic Student",
        programme_code: "BTECH-CS",
        academic_year: "2024-25",
        admission_date: "2024-07-15",
        admission_category: "general",
      },
    ]);
    // 4. Update batch status
    demoStore.updateBatchStatus(batchId!, "approved", "Synthetic demo approval");

    expect(rpcSpy).not.toHaveBeenCalled();
    expect(fromSpy).not.toHaveBeenCalled();
  });
});
