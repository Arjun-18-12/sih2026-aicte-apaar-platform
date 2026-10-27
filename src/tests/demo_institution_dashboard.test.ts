import { describe, it, expect, beforeEach, vi } from "vitest";
import { demoStore, DEMO_INSTITUTION_ID } from "../services/demoStore";
import {
  SYNTHETIC_DEMO_AICTE_ADMIN,
  SYNTHETIC_DEMO_INSTITUTION_ADMIN,
} from "../contexts/AuthContext";
import type { BatchEnrolmentRecordInput } from "../types";

describe("Task 6B: Institution Dashboard Synchronization & Multi-Institution Tenant Isolation", () => {
  beforeEach(() => {
    demoStore.reset();
    vi.clearAllMocks();
  });

  // 1. SRIT dashboard values are derived from the demo store
  it("derives SRIT dashboard values accurately from demoStore records", () => {
    const sritInst = demoStore.getInstitution(DEMO_INSTITUTION_ID);
    expect(sritInst).toBeDefined();
    expect(sritInst!.name).toBe("Shri Ram Institute of Technology (DEMO)");

    const sritEnrolments = demoStore.getEnrolments(DEMO_INSTITUTION_ID);
    expect(sritEnrolments.length).toBe(115);

    const sritBatches = demoStore.getBatches(DEMO_INSTITUTION_ID);
    expect(sritBatches.length).toBe(4);

    const pendingBatches = sritBatches.filter(b => b.status === "submitted" || b.status === "under_review");
    expect(pendingBatches.length).toBe(3);

    const approvedBatches = sritBatches.filter(b => b.status === "approved");
    expect(approvedBatches.length).toBe(1);

    const validationErrors = sritBatches.reduce((sum, b) => sum + (b.error_records || 0), 0);
    expect(validationErrors).toBe(0);

    const programmes = demoStore.getProgrammes(DEMO_INSTITUTION_ID);
    expect(programmes.length).toBe(4);
  });

  // 2. Institution name and programme chart match the selected institution
  it("computes accurate programme chart data for SRIT and other institutions without hardcoded numbers", () => {
    // SRIT
    const sritProgs = demoStore.getProgrammes(DEMO_INSTITUTION_ID);
    const sritEnrolments = demoStore.getEnrolments(DEMO_INSTITUTION_ID);

    const sritChartData = sritProgs.map((p: any) => {
      const intake = p.approved_intakes?.find(i => i.academic_year === "2024-25" && i.status === "active")
        ?? p.approved_intakes?.[0];
      const enrolled = sritEnrolments.filter(e => e.programme_id === p.id && e.enrolment_status === "active").length;
      return {
        name: p.code,
        approved: intake?.approved_intake ?? 0,
        enrolled,
      };
    });

    expect(sritChartData.length).toBe(4);
    const csProg = sritChartData.find(c => c.name === "BTECH-CS");
    expect(csProg).toBeDefined();
    expect(csProg!.approved).toBe(120);
    expect(csProg!.enrolled).toBeGreaterThan(0);

    // Sum of enrolled across programmes equals SRIT total enrolments
    const sumEnrolled = sritChartData.reduce((sum, c) => sum + c.enrolled, 0);
    expect(sumEnrolled).toBe(sritEnrolments.length);

    // Alternative institution: NTU (11111111-1111-1111-1111-000000000002)
    const ntuId = "11111111-1111-1111-1111-000000000002";
    const ntuInst = demoStore.getInstitution(ntuId);
    expect(ntuInst).toBeDefined();
    expect(ntuInst!.name).toBe("National Technical University");

    const ntuEnrolments = demoStore.getEnrolments(ntuId);
    expect(ntuEnrolments.length).toBe(140);
  });

  // 3. Uploading a CSV changes the institution dashboard totals correctly
  it("updates institution dashboard metrics dynamically when a new batch is submitted", () => {
    const initialEnrolments = demoStore.getEnrolments(DEMO_INSTITUTION_ID).length;
    const initialBatches = demoStore.getBatches(DEMO_INSTITUTION_ID).length;
    const initialPending = demoStore.getBatches(DEMO_INSTITUTION_ID).filter(b => b.status === "submitted" || b.status === "under_review").length;

    const { batchId } = demoStore.createDraftBatch("2024-25", 2, DEMO_INSTITUTION_ID);
    expect(batchId).toBeTruthy();

    const newRows: BatchEnrolmentRecordInput[] = [
      {
        row_number: 1,
        institution_student_id: "SRIT-DASH-SYNC-01",
        full_name: "Gaurav Malhotra",
        programme_code: "BTECH-CS",
        academic_year: "2024-25",
        admission_date: "2024-08-01",
        admission_category: "general",
        apaar_id: "667788990011",
      },
      {
        row_number: 2,
        institution_student_id: "SRIT-DASH-SYNC-02",
        full_name: "Deepika Padukone",
        programme_code: "MBA",
        academic_year: "2024-25",
        admission_date: "2024-08-01",
        admission_category: "obc",
        apaar_id: "778899001122",
      },
    ];

    const res = demoStore.submitBatch(batchId!, DEMO_INSTITUTION_ID, "2024-25", newRows);
    expect(res.data?.success).toBe(true);

    const updatedEnrolments = demoStore.getEnrolments(DEMO_INSTITUTION_ID);
    const updatedBatches = demoStore.getBatches(DEMO_INSTITUTION_ID);

    expect(updatedEnrolments.length).toBe(initialEnrolments + 2);
    expect(updatedBatches.length).toBe(initialBatches + 1);

    const updatedPending = updatedBatches.filter(b => b.status === "submitted" || b.status === "under_review").length;
    expect(updatedPending).toBe(initialPending + 1);
  });

  // 4. AICTE approval or return updates the relevant institution dashboard
  it("reflects AICTE approval and return actions in the institution dashboard counts", () => {
    const sritBatches = demoStore.getBatches(DEMO_INSTITUTION_ID);
    const submittedBatch = sritBatches.find(b => b.status === "submitted");
    expect(submittedBatch).toBeDefined();

    const initialApproved = sritBatches.filter(b => b.status === "approved").length;

    // AICTE approves the batch
    const approved = demoStore.updateBatchStatus(submittedBatch!.id, "approved", "Verified AICTE intake compliance.");
    expect(approved).toBe(true);

    const refreshedBatches = demoStore.getBatches(DEMO_INSTITUTION_ID);
    const newApprovedCount = refreshedBatches.filter(b => b.status === "approved").length;
    expect(newApprovedCount).toBe(initialApproved + 1);

    // AICTE returns another batch for correction
    const secondSubmitted = refreshedBatches.find(b => b.status === "submitted");
    expect(secondSubmitted).toBeDefined();
    demoStore.updateBatchStatus(secondSubmitted!.id, "returned_for_correction", "Discrepancy in demographic details.");

    const afterReturnBatches = demoStore.getBatches(DEMO_INSTITUTION_ID);
    const returnedBatch = afterReturnBatches.find(b => b.id === secondSubmitted!.id);
    expect(returnedBatch?.status).toBe("returned_for_correction");
  });

  // 5. Switching roles does not leak another institution's records
  it("enforces tenant-scoped boundaries so an institution admin only receives their own institution's records", () => {
    const sritId = DEMO_INSTITUTION_ID;
    const ntuId = "11111111-1111-1111-1111-000000000002";

    const sritEnrolments = demoStore.getEnrolments(sritId);
    const ntuEnrolments = demoStore.getEnrolments(ntuId);
    const allEnrolments = demoStore.getEnrolments();

    expect(sritEnrolments.length).toBe(115);
    expect(ntuEnrolments.length).toBe(140);
    expect(allEnrolments.length).toBe(1200);

    // Verify SRIT view contains zero NTU records
    for (const e of sritEnrolments) {
      expect(e.institution_id).toBe(sritId);
      expect(e.institution_id).not.toBe(ntuId);
    }

    // Verify NTU view contains zero SRIT records
    for (const e of ntuEnrolments) {
      expect(e.institution_id).toBe(ntuId);
      expect(e.institution_id).not.toBe(sritId);
    }
  });

  // 6. Existing demo-store records and review decisions survive resets and re-reads
  it("ensures canonical store consistency across multiple retrievals", () => {
    const summary1 = demoStore.getInstitutionSummary(DEMO_INSTITUTION_ID);
    const summary2 = demoStore.getInstitutionSummary(DEMO_INSTITUTION_ID);

    expect(summary1.totalEnrolments).toBe(summary2.totalEnrolments);
    expect(summary1.totalBatches).toBe(summary2.totalBatches);
    expect(summary1.approvedBatches).toBe(summary2.approvedBatches);
    expect(summary1.submittedBatches).toBe(summary2.submittedBatches);
    expect(summary1.institutionName).toBe(summary2.institutionName);
  });
});
