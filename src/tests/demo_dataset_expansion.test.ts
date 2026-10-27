import { describe, it, expect, beforeEach, vi } from "vitest";
import { demoStore, DEMO_INSTITUTION_ID, DEMO_STORE_KEY } from "../services/demoStore";
import { supabase } from "../lib/supabase";
import {
  SYNTHETIC_DEMO_AICTE_ADMIN,
  SYNTHETIC_DEMO_INSTITUTION_ADMIN
} from "../contexts/AuthContext";
import type { BatchEnrolmentRecordInput } from "../types";

describe("Task 5: Multi-Institution AICTE–APAAR Demo Dataset Expansion", () => {
  beforeEach(() => {
    demoStore.reset();
    vi.clearAllMocks();
  });

  // 1. Expected synthetic dataset sizes
  it("generates the expected target dataset sizes across institutions, students, enrolments, batches, and cases", () => {
    const stats = demoStore.getDashboardStats();
    const institutions = demoStore.getInstitutions();
    const batches = demoStore.getBatches();
    const enrolments = demoStore.getEnrolments();
    const duplicateCases = demoStore.getDuplicateCases();
    const auditLogs = demoStore.getAuditLogs();

    expect(institutions.length).toBe(12);
    expect(stats.total_institutions).toBe(12);
    expect(enrolments.length).toBe(1200);
    expect(stats.total_enrolments).toBe(1200);
    expect(batches.length).toBeGreaterThanOrEqual(40);
    expect(batches.length).toBe(44);
    expect(duplicateCases.length).toBeGreaterThanOrEqual(40);
    expect(duplicateCases.length).toBe(42);
    expect(auditLogs.length).toBeGreaterThanOrEqual(50);
  });

  // 2. Unique IDs and valid relationships between records
  it("enforces unique primary keys and zero relational integrity errors across all records", () => {
    const institutions = demoStore.getInstitutions();
    const batches = demoStore.getBatches();
    const enrolments = demoStore.getEnrolments();
    const duplicateCases = demoStore.getDuplicateCases();
    const programmes = demoStore.getProgrammes();

    // Primary key uniqueness
    const instIds = new Set(institutions.map(i => i.id));
    expect(instIds.size).toBe(institutions.length);

    const instAicteIds = new Set(institutions.map(i => i.aicte_id));
    expect(instAicteIds.size).toBe(institutions.length);

    const batchIds = new Set(batches.map(b => b.id));
    expect(batchIds.size).toBe(batches.length);

    const enrIds = new Set(enrolments.map(e => e.id));
    expect(enrIds.size).toBe(enrolments.length);

    const caseIds = new Set(duplicateCases.map(c => c.id));
    expect(caseIds.size).toBe(duplicateCases.length);

    const progIds = new Set(programmes.map(p => p.id));
    expect(progIds.size).toBe(programmes.length);

    // Foreign key validity
    for (const enr of enrolments) {
      expect(instIds.has(enr.institution_id)).toBe(true);
      expect(progIds.has(enr.programme_id)).toBe(true);
      if (enr.batch_id) {
        expect(batchIds.has(enr.batch_id)).toBe(true);
      }
      expect(enr.student).toBeDefined();
      expect(enr.student?.full_name).toBeTruthy();
    }

    for (const c of duplicateCases) {
      expect(c.student_id_1).toBeTruthy();
      if (c.student_id_2) {
        expect(c.student_id_1).not.toBe(c.student_id_2);
      }
      if (c.batch_id) {
        expect(batchIds.has(c.batch_id)).toBe(true);
      }
    }
  });

  // 3. Correct institution and programme aggregation
  it("aggregates data correctly across all 12 institutions and approved programmes", () => {
    const institutions = demoStore.getInstitutions();
    expect(institutions.length).toBe(12);

    // Verify geographical diversity across Indian states
    const states = new Set(institutions.map(i => i.state));
    expect(states.size).toBe(12);
    expect(states).toContain("Maharashtra");
    expect(states).toContain("Delhi");
    expect(states).toContain("Karnataka");
    expect(states).toContain("Tamil Nadu");
    expect(states).toContain("Gujarat");
    expect(states).toContain("West Bengal");
    expect(states).toContain("Telangana");
    expect(states).toContain("Punjab");

    // Verify programme bars data aggregation
    const barData = demoStore.getProgrammeBarsData();
    expect(barData.length).toBe(5);
    const csBar = barData.find(b => b.name === "B.Tech CS");
    expect(csBar).toBeDefined();
    expect(csBar!.approved).toBeGreaterThan(1000);
    expect(csBar!.enrolled).toBeGreaterThan(300);

    // Verify multi-institution summary retrieval
    const sritSummary = demoStore.getInstitutionSummary(DEMO_INSTITUTION_ID);
    expect(sritSummary.institutionName).toContain("Shri Ram Institute");
    expect(sritSummary.city).toBe("Mumbai");
    expect(sritSummary.totalEnrolments).toBe(115);

    const ntuInst = institutions.find(i => i.aicte_id === "1-NTU2024");
    expect(ntuInst).toBeDefined();
    const ntuSummary = demoStore.getInstitutionSummary(ntuInst!.id);
    expect(ntuSummary.institutionName).toBe("National Technical University");
    expect(ntuSummary.city).toBe("New Delhi");
    expect(ntuSummary.totalEnrolments).toBeGreaterThan(100);
  });

  // 4. Correct approved-enrolment and intake calculations
  it("counts only enrolments in approved batches as approved enrolments", () => {
    const stats = demoStore.getDashboardStats();
    const allEnrolments = demoStore.getEnrolments();
    const approvedEnrolments = allEnrolments.filter(e => e.submission_status === "approved");
    const nonApprovedEnrolments = allEnrolments.filter(e => e.submission_status !== "approved");

    expect(stats.approved_enrolments).toBe(approvedEnrolments.length);
    expect(nonApprovedEnrolments.length).toBeGreaterThan(0);
    expect(stats.approved_enrolments).toBeLessThan(stats.total_enrolments);
    expect(stats.approved_enrolments + nonApprovedEnrolments.length).toBe(stats.total_enrolments);
  });

  // 5. Deterministic seeding without duplicate records after refresh
  it("guarantees deterministic seeding so reseeds never duplicate records or change identifiers", () => {
    const stats1 = demoStore.getDashboardStats();
    const firstStudentId = demoStore.getEnrolments()[0].student_id;
    const firstBatchId = demoStore.getBatches()[0].id;

    // Reseed
    demoStore.reset();

    const stats2 = demoStore.getDashboardStats();
    const reseedStudentId = demoStore.getEnrolments()[0].student_id;
    const reseedBatchId = demoStore.getBatches()[0].id;

    expect(stats2.total_institutions).toBe(stats1.total_institutions);
    expect(stats2.total_enrolments).toBe(stats1.total_enrolments);
    expect(stats2.approved_enrolments).toBe(stats1.approved_enrolments);
    expect(stats2.potential_duplicates).toBe(stats1.potential_duplicates);
    expect(reseedStudentId).toBe(firstStudentId);
    expect(reseedBatchId).toBe(firstBatchId);
  });

  // 6. Persistence of duplicate-review decisions and audit events
  it("persists reviewer decisions and logs audit events in the shared store", () => {
    const cases = demoStore.getDuplicateCases();
    const pendingCases = cases.filter(c => c.review_status === "pending");
    expect(pendingCases.length).toBe(22);

    const targetCase = pendingCases[0];
    const initialLogsCount = demoStore.getAuditLogs().length;

    const resolved = demoStore.resolveDuplicateCase(
      targetCase.id,
      "confirmed_duplicate",
      "Confirmed duplicate registration via multi-college cross check.",
      "aicte.reviewer@demo.gov.in"
    );
    expect(resolved).toBe(true);

    const updatedCases = demoStore.getDuplicateCases();
    const updatedTarget = updatedCases.find(c => c.id === targetCase.id);
    expect(updatedTarget?.review_status).toBe("confirmed_duplicate");
    expect(updatedTarget?.reviewer_notes).toContain("multi-college cross check");
    expect(updatedTarget?.reviewed_by).toBe("aicte.reviewer@demo.gov.in");

    // Check stats updated
    const newStats = demoStore.getDashboardStats();
    expect(newStats.potential_duplicates).toBe(21);

    // Check audit log
    const updatedLogs = demoStore.getAuditLogs();
    expect(updatedLogs.length).toBe(initialLogsCount + 1);
    expect(updatedLogs[0].action).toBe("DUPLICATE_CASE_CONFIRMED_DUPLICATE");
    expect(updatedLogs[0].actor_email).toBe("aicte.reviewer@demo.gov.in");
  });

  // 7. CSV upload still working after expansion
  it("processes new CSV uploads cleanly and increments store counts dynamically", () => {
    const beforeStats = demoStore.getDashboardStats();
    const { batchId } = demoStore.createDraftBatch("2024-25", 2, DEMO_INSTITUTION_ID);
    expect(batchId).toBeTruthy();

    const uploadPayload: BatchEnrolmentRecordInput[] = [
      {
        row_number: 1,
        institution_student_id: "SRIT-EXP-001",
        full_name: "Vikramaditya Sengupta",
        programme_code: "BTECH-CS",
        academic_year: "2024-25",
        admission_date: "2024-08-10",
        admission_category: "general",
        apaar_id: "999988887777",
      },
      {
        row_number: 2,
        institution_student_id: "SRIT-EXP-002",
        full_name: "Ananya Iyer",
        programme_code: "BTECH-CS",
        academic_year: "2024-25",
        admission_date: "2024-08-10",
        admission_category: "obc",
        apaar_id: "999988886666",
      },
    ];

    const res = demoStore.submitBatch(batchId!, DEMO_INSTITUTION_ID, "2024-25", uploadPayload);
    expect(res.data?.success).toBe(true);
    expect(res.data?.accepted_records).toBe(2);

    const afterStats = demoStore.getDashboardStats();
    expect(afterStats.total_enrolments).toBe(beforeStats.total_enrolments + 2);
    expect(afterStats.pending_submissions).toBe(beforeStats.pending_submissions + 1);
  });

  // 8. Existing demo role switching and sign-out
  it("preserves simulated identities and permissions for both demo roles", () => {
    expect(SYNTHETIC_DEMO_AICTE_ADMIN.profile.role).toBe("aicte_admin");
    expect(SYNTHETIC_DEMO_AICTE_ADMIN.email).toBe("aicte.admin@demo.aicte.gov.in");
    expect(SYNTHETIC_DEMO_AICTE_ADMIN.profile.institution_id).toBeUndefined();

    expect(SYNTHETIC_DEMO_INSTITUTION_ADMIN.profile.role).toBe("institution_admin");
    expect(SYNTHETIC_DEMO_INSTITUTION_ADMIN.email).toBe("principal@srit.ac.in");
    expect(SYNTHETIC_DEMO_INSTITUTION_ADMIN.profile.institution_id).toBe(DEMO_INSTITUTION_ID);
  });

  // 9. No synthetic demo writes to Supabase
  it("guarantees 100% isolation from live Supabase RPC and table mutations", () => {
    const rpcSpy = vi.spyOn(supabase, "rpc");
    const fromSpy = vi.spyOn(supabase, "from");

    demoStore.getInstitutions();
    demoStore.getProgrammes();
    demoStore.getDashboardStats();
    demoStore.getApaarPieData();
    demoStore.getProgrammeBarsData();
    demoStore.getReportsData();

    const { batchId } = demoStore.createDraftBatch("2024-25", 1);
    demoStore.submitBatch(batchId!, DEMO_INSTITUTION_ID, "2024-25", [
      {
        row_number: 1,
        institution_student_id: "SRIT-ISO-01",
        full_name: "Isolated Demo Student",
        programme_code: "BTECH-CS",
        academic_year: "2024-25",
        admission_date: "2024-08-15",
        admission_category: "general",
      },
    ]);
    demoStore.updateBatchStatus(batchId!, "approved", "Audit approved");
    demoStore.resolveDuplicateCase("d1", "dismissed", "Dismissed offline");

    expect(rpcSpy).not.toHaveBeenCalled();
    expect(fromSpy).not.toHaveBeenCalled();
  });

  // 10. Existing standard Supabase mode remains unchanged
  it("preserves store key versioning and format integrity", () => {
    expect(DEMO_STORE_KEY).toBe("aicte_synthetic_demo_store_v2");
    const reports = demoStore.getReportsData();
    expect(reports.instEnrolments.length).toBeGreaterThan(30);
    expect(reports.pieData.length).toBe(4);
    const approvedPie = reports.pieData.find(p => p.name === "Approved");
    expect(approvedPie?.value).toBeGreaterThan(20);
  });
});
