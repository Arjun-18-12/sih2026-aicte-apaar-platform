import { describe, it, expect, beforeEach } from "vitest";
import { demoStore, DEMO_INSTITUTION_ID } from "../services/demoStore";
import type { BatchEnrolmentRecordInput } from "../types";

describe("Verify Quick Samples with Patched DemoStore", () => {
  beforeEach(() => {
    demoStore.reset();
  });

  it("submits valid_enrolments_sample successfully with 5 accepted rows", () => {
    const { batchId } = demoStore.createDraftBatch("2024-25", 5, DEMO_INSTITUTION_ID);
    const validRows: BatchEnrolmentRecordInput[] = [
      { row_number: 1, institution_student_id: "SRIT-2024-001", full_name: "Aarav Rajesh Sharma", apaar_id: "123456789012", programme_code: "BTECH-CS", academic_year: "2024-25", admission_date: "2024-07-15", admission_category: "general", gender: "male" },
      { row_number: 2, institution_student_id: "SRIT-2024-002", full_name: "Priya Sundaram Iyer", apaar_id: "987654321098", programme_code: "BTECH-CS", academic_year: "2024-25", admission_date: "2024-07-16", admission_category: "obc", gender: "female" },
      { row_number: 3, institution_student_id: "SRIT-2024-003", full_name: "Rohan Amit Deshmukh", apaar_id: "112233445566", programme_code: "BTECH-CS", academic_year: "2024-25", admission_date: "2024-07-16", admission_category: "sc", gender: "male" },
      { row_number: 4, institution_student_id: "SRIT-2024-004", full_name: "Ananya Vikram Verma", apaar_id: "998877665544", programme_code: "BTECH-CS", academic_year: "2024-25", admission_date: "2024-07-18", admission_category: "ews", gender: "female" },
      { row_number: 5, institution_student_id: "SRIT-2024-005", full_name: "Devendra Kumar Singh", apaar_id: "556677889900", programme_code: "BTECH-CS", academic_year: "2024-25", admission_date: "2024-07-19", admission_category: "st", gender: "male" },
    ];
    const res = demoStore.submitBatch(batchId!, DEMO_INSTITUTION_ID, "2024-25", validRows);
    expect(res.data?.success).toBe(true);
    expect(res.data?.accepted_records).toBe(5);
    expect(res.data?.rejected_records).toBe(0);
    expect(res.data?.batch_status).toBe("submitted");
  });

  it("submits supernumerary_sample successfully with 3 accepted rows", () => {
    const { batchId } = demoStore.createDraftBatch("2024-25", 3, DEMO_INSTITUTION_ID);
    const superRows: BatchEnrolmentRecordInput[] = [
      { row_number: 1, institution_student_id: "SRIT-2024-NRI-01", full_name: "Zack Tariq Merchant", apaar_id: "334455667788", programme_code: "BTECH-CS", academic_year: "2024-25", admission_date: "2024-07-20", admission_category: "nri", gender: "male", supernumerary_classification: "nri", is_nri: true },
      { row_number: 2, institution_student_id: "SRIT-2024-OCI-01", full_name: "Maya Elena Patel", apaar_id: "445566778899", programme_code: "BTECH-CS", academic_year: "2024-25", admission_date: "2024-07-21", admission_category: "oci", gender: "female", supernumerary_classification: "oci", is_oci: true },
      { row_number: 3, institution_student_id: "SRIT-2024-FN-01", full_name: "Lucas Jean Dubois", apaar_id: "556677889911", programme_code: "BTECH-CS", academic_year: "2024-25", admission_date: "2024-07-22", admission_category: "foreign_national", gender: "male", supernumerary_classification: "fn", is_foreign_national: true },
    ];
    const res = demoStore.submitBatch(batchId!, DEMO_INSTITUTION_ID, "2024-25", superRows);
    expect(res.data?.success).toBe(true);
    expect(res.data?.accepted_records).toBe(3);
    expect(res.data?.rejected_records).toBe(0);
    expect(res.data?.batch_status).toBe("submitted");
  });
});
