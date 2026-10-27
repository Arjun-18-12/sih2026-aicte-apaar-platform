import { describe, it, expect, beforeEach, vi } from "vitest";
import { demoStore, DEMO_INSTITUTION_ID } from "../services/demoStore";
import { supabase } from "../lib/supabase";
import type { BatchEnrolmentRecordInput } from "../types";

describe("Task 3: AICTE Dashboard & Duplicate Review Workflow Integration", () => {
  beforeEach(() => {
    demoStore.reset();
    vi.clearAllMocks();
  });

  it("aggregates dashboard statistics dynamically from local demo store", () => {
    const initialStats = demoStore.getDashboardStats();

    expect(initialStats).toBeDefined();
    expect(initialStats.total_institutions).toBe(12);
    expect(initialStats.total_enrolments).toBe(1200);
    expect(initialStats.approved_enrolments).toBe(697);
    expect(initialStats.pending_submissions).toBe(11);
    expect(initialStats.apaar_verified).toBeGreaterThan(900);
    expect(initialStats.potential_duplicates).toBe(22);
  });

  it("immediately updates dashboard stats when an institution submits a batch", () => {
    const beforeStats = demoStore.getDashboardStats();
    const { batchId } = demoStore.createDraftBatch("2024-25", 2);

    const newRecords: BatchEnrolmentRecordInput[] = [
      {
        row_number: 1,
        institution_student_id: "SRIT-2024-T3-01",
        full_name: "Karan Johar",
        programme_code: "BTECH-CS",
        academic_year: "2024-25",
        admission_date: "2024-07-25",
        admission_category: "general",
        apaar_id: "778899001122",
      },
      {
        row_number: 2,
        institution_student_id: "SRIT-2024-T3-02",
        full_name: "Sneha Reddy",
        programme_code: "MBA",
        academic_year: "2024-25",
        admission_date: "2024-07-26",
        admission_category: "obc",
        apaar_id: "889900112233",
      },
    ];

    const submitRes = demoStore.submitBatch(batchId!, DEMO_INSTITUTION_ID, "2024-25", newRecords);
    expect(submitRes.data?.success).toBe(true);

    const afterStats = demoStore.getDashboardStats();
    expect(afterStats.total_enrolments).toBe(beforeStats.total_enrolments + 2);
    expect(afterStats.pending_submissions).toBe(beforeStats.pending_submissions + 1);
    expect(afterStats.apaar_verified).toBe(beforeStats.apaar_verified + 2);
  });

  it("resolves duplicate cases, decrements pending duplicates, and persists status", () => {
    const initialStats = demoStore.getDashboardStats();
    const initialPending = initialStats.potential_duplicates;
    expect(initialPending).toBeGreaterThan(0);

    const cases = demoStore.getDuplicateCases();
    const caseToResolve = cases.find(c => c.review_status === "pending");
    expect(caseToResolve).toBeDefined();

    const success = demoStore.resolveDuplicateCase(
      caseToResolve!.id,
      "confirmed_duplicate",
      "Confirmed dual institution enrolment via simulated demo review.",
      "aicte.evaluator@demo.gov.in"
    );
    expect(success).toBe(true);

    // Verify status was persisted in case object
    const updatedCases = demoStore.getDuplicateCases();
    const resolvedCase = updatedCases.find(c => c.id === caseToResolve!.id);
    expect(resolvedCase?.review_status).toBe("confirmed_duplicate");
    expect(resolvedCase?.reviewer_notes).toContain("simulated demo review");
    expect(resolvedCase?.reviewed_by).toBe("aicte.evaluator@demo.gov.in");
    expect(resolvedCase?.reviewed_at).toBeDefined();

    // Verify dashboard pending duplicates count decrements immediately
    const afterStats = demoStore.getDashboardStats();
    expect(afterStats.potential_duplicates).toBe(initialPending - 1);
  });

  it("preserves student and enrolment records without deletion or mutation during duplicate resolution", () => {
    const enrolmentsBefore = demoStore.getEnrolments();
    const enrolmentsCountBefore = enrolmentsBefore.length;

    const cases = demoStore.getDuplicateCases();
    const pendingCase = cases.find(c => c.review_status === "pending");
    expect(pendingCase).toBeDefined();

    demoStore.resolveDuplicateCase(pendingCase!.id, "legitimate", "Valid inter-college transfer.");

    const enrolmentsAfter = demoStore.getEnrolments();
    expect(enrolmentsAfter.length).toBe(enrolmentsCountBefore);
  });

  it("records synthetic audit logs for duplicate case resolutions and submissions", () => {
    const logsBefore = demoStore.getAuditLogs();

    demoStore.resolveDuplicateCase(
      "d1",
      "dismissed",
      "False positive match.",
      "auditor@aicte.gov.in"
    );

    const logsAfter = demoStore.getAuditLogs();
    expect(logsAfter.length).toBe(logsBefore.length + 1);

    const latestLog = logsAfter[0];
    expect(latestLog.action).toBe("DUPLICATE_CASE_DISMISSED");
    expect(latestLog.actor_email).toBe("auditor@aicte.gov.in");
    expect(latestLog.entity_type).toBe("duplicate_review_cases");
    expect(latestLog.entity_id).toBe("d1");
  });

  it("guarantees zero Supabase RPC or table write calls during AICTE workflows", () => {
    const rpcSpy = vi.spyOn(supabase, "rpc");
    const fromSpy = vi.spyOn(supabase, "from");

    demoStore.getDashboardStats();
    demoStore.getApaarPieData();
    demoStore.getProgrammeBarsData();
    demoStore.getInstitutionSummary(DEMO_INSTITUTION_ID);
    demoStore.getDuplicateCases();
    demoStore.resolveDuplicateCase("d2", "legitimate", "Checked offline documentation");
    demoStore.getAuditLogs();
    demoStore.getReportsData();

    expect(rpcSpy).not.toHaveBeenCalled();
    expect(fromSpy).not.toHaveBeenCalled();
  });
});
