import { describe, it, expect, beforeEach, vi } from "vitest";
import { demoStore, DEMO_INSTITUTION_ID } from "../services/demoStore";

const SRIT_ID = DEMO_INSTITUTION_ID; // "11111111-1111-1111-1111-111111111111"
const NTU_ID = "11111111-1111-1111-1111-000000000002";
const REC_ID = "11111111-1111-1111-1111-000000000003";
const EMPTY_INST_ID = "00000000-0000-0000-0000-000000000099";

const PAGE_SIZE = 20;

describe("Student Enrolments Institution Data Isolation & Switching", () => {
  beforeEach(() => {
    demoStore.reset();
    vi.clearAllMocks();
  });

  // 1. Institution A displays only its own enrolments
  it("displays only Institution A's (SRIT) enrolments with correct scoping", () => {
    const sritEnrolments = demoStore.getEnrolments(SRIT_ID);
    expect(sritEnrolments.length).toBe(115);

    // Every record must belong strictly to SRIT
    for (const enr of sritEnrolments) {
      expect(enr.institution_id).toBe(SRIT_ID);
      expect(enr.institution?.id).toBe(SRIT_ID);
      expect(enr.institution_student_id.startsWith("SRIT")).toBe(true);
    }
  });

  // 2. Institution B displays only its own enrolments
  it("displays only Institution B's (NTU) enrolments with correct scoping", () => {
    const ntuEnrolments = demoStore.getEnrolments(NTU_ID);
    expect(ntuEnrolments.length).toBe(140);

    // Every record must belong strictly to NTU
    for (const enr of ntuEnrolments) {
      expect(enr.institution_id).toBe(NTU_ID);
      expect(enr.institution?.id).toBe(NTU_ID);
      expect(enr.institution_student_id.startsWith("NTU")).toBe(true);
    }
  });

  // 3. Switching A → B changes the displayed records
  it("switching from Institution A to Institution B immediately changes displayed enrolments", () => {
    // Current state: Institution A (SRIT)
    let currentInstId = SRIT_ID;
    let displayedRecords = demoStore.getEnrolments(currentInstId);
    expect(displayedRecords.length).toBe(115);
    const firstStudentA = displayedRecords[0];
    expect(firstStudentA.institution_student_id).toBe("SRIT2024001");
    expect(firstStudentA.student?.full_name).toBe("Arjun Sharma");

    // Action: Switch to Institution B (NTU)
    currentInstId = NTU_ID;
    displayedRecords = demoStore.getEnrolments(currentInstId);
    expect(displayedRecords.length).toBe(140);
    const firstStudentB = displayedRecords[0];
    expect(firstStudentB.institution_student_id).toBe("NTU2024-2024-0001");
    expect(firstStudentB.student?.full_name).toBe("Vikas Gupta");

    // The two student lists are completely different
    expect(firstStudentA.id).not.toBe(firstStudentB.id);
    expect(firstStudentA.student_id).not.toBe(firstStudentB.student_id);
    expect(firstStudentA.institution_student_id).not.toBe(firstStudentB.institution_student_id);
  });

  // 4. Switching B → A restores A's records
  it("switching back from Institution B to Institution A restores Institution A's records", () => {
    // Start at B
    let currentInstId = NTU_ID;
    let records = demoStore.getEnrolments(currentInstId);
    expect(records.length).toBe(140);
    expect(records[0].institution_student_id).toBe("NTU2024-2024-0001");

    // Switch back to A
    currentInstId = SRIT_ID;
    records = demoStore.getEnrolments(currentInstId);
    expect(records.length).toBe(115);
    expect(records[0].institution_student_id).toBe("SRIT2024001");
    expect(records[0].student?.full_name).toBe("Arjun Sharma");
  });

  // 5. A student belonging to A is never shown in B's institution-facing enrolment table
  it("ensures zero overlap between student records of different institutions", () => {
    const sritEnrolments = demoStore.getEnrolments(SRIT_ID);
    const ntuEnrolments = demoStore.getEnrolments(NTU_ID);
    const recEnrolments = demoStore.getEnrolments(REC_ID);

    const sritStudentIds = new Set(sritEnrolments.map(e => e.student_id));
    const ntuStudentIds = new Set(ntuEnrolments.map(e => e.student_id));
    const recStudentIds = new Set(recEnrolments.map(e => e.student_id));

    // Verify SRIT has no students in NTU
    for (const studentId of sritStudentIds) {
      expect(ntuStudentIds.has(studentId)).toBe(false);
      expect(recStudentIds.has(studentId)).toBe(false);
    }

    // Verify NTU has no students in REC or SRIT
    for (const studentId of ntuStudentIds) {
      expect(sritStudentIds.has(studentId)).toBe(false);
      expect(recStudentIds.has(studentId)).toBe(false);
    }

    // Verify enrolment primary keys are disjoint
    const sritEnrIds = new Set(sritEnrolments.map(e => e.id));
    for (const ntuEnr of ntuEnrolments) {
      expect(sritEnrIds.has(ntuEnr.id)).toBe(false);
    }
  });

  // 6. Batch and programme details shown for each enrolment belong to the correct institution
  it("verifies batch and programme details belong strictly to the enrolment's institution", () => {
    const allBatches = demoStore.getBatches();
    const batchMap = new Map(allBatches.map(b => [b.id, b]));

    const testInstitutions = [SRIT_ID, NTU_ID, REC_ID];

    for (const instId of testInstitutions) {
      const enrolments = demoStore.getEnrolments(instId);
      const progs = demoStore.getProgrammes(instId);
      const progIds = new Set(progs.map(p => p.id));

      for (const enr of enrolments) {
        // Enrolment belongs to instId
        expect(enr.institution_id).toBe(instId);

        // Programme belongs to instId
        expect(progIds.has(enr.programme_id)).toBe(true);
        if (enr.programme) {
          expect(enr.programme.institution_id).toBe(instId);
        }

        // Batch belongs to instId
        const batch = batchMap.get(enr.batch_id);
        expect(batch).toBeDefined();
        expect(batch!.institution_id).toBe(instId);
      }
    }
  });

  // 7. Search, filtering, pagination, and summary counts remain institution-specific
  it("ensures search, filtering, pagination, and summary counts remain strictly institution-specific", () => {
    const sritEnrolments = demoStore.getEnrolments(SRIT_ID);
    const ntuEnrolments = demoStore.getEnrolments(NTU_ID);

    // Summary counts
    expect(sritEnrolments.length).toBe(115);
    expect(ntuEnrolments.length).toBe(140);

    // Pagination calculations
    const sritPages = Math.ceil(sritEnrolments.length / PAGE_SIZE);
    const ntuPages = Math.ceil(ntuEnrolments.length / PAGE_SIZE);
    expect(sritPages).toBe(6); // 115 / 20 = 5.75 -> 6 pages
    expect(ntuPages).toBe(7);  // 140 / 20 = 7 pages

    // Page 1 slicing
    const sritPage1 = sritEnrolments.slice(0, PAGE_SIZE);
    const ntuPage1 = ntuEnrolments.slice(0, PAGE_SIZE);
    expect(sritPage1.length).toBe(20);
    expect(ntuPage1.length).toBe(20);
    expect(sritPage1[0].institution_student_id).toBe("SRIT2024001");
    expect(ntuPage1[0].institution_student_id).toBe("NTU2024-2024-0001");

    // Search filtering within SRIT: search for "Arjun"
    const sritArjun = sritEnrolments.filter(e =>
      (e.student?.full_name ?? "").toLowerCase().includes("arjun") ||
      (e.institution_student_id ?? "").toLowerCase().includes("arjun")
    );
    expect(sritArjun.length).toBeGreaterThan(0);
    expect(sritArjun[0].student?.full_name).toContain("Arjun");

    // Search filtering within NTU: searching for SRIT's student ID "SRIT2024001" yields 0 in NTU
    const ntuSritSearch = ntuEnrolments.filter(e =>
      (e.institution_student_id ?? "").toLowerCase().includes("srit2024001")
    );
    expect(ntuSritSearch.length).toBe(0);

    // Search filtering within SRIT: searching for NTU's student ID "NTU2024" yields 0 in SRIT
    const sritNtuSearch = sritEnrolments.filter(e =>
      (e.institution_student_id ?? "").toLowerCase().includes("ntu2024")
    );
    expect(sritNtuSearch.length).toBe(0);
  });

  // 8. An institution with no enrolments displays an appropriate empty state
  it("gracefully handles an institution with zero enrolments returning empty dataset", () => {
    const emptyEnrolments = demoStore.getEnrolments(EMPTY_INST_ID);
    expect(emptyEnrolments).toEqual([]);
    expect(emptyEnrolments.length).toBe(0);

    // Filter and pagination on empty set
    const filtered = emptyEnrolments.filter(e => (e.student?.full_name ?? "").includes("test"));
    expect(filtered.length).toBe(0);
    const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    expect(pages).toBe(1);
  });

  // 9. AICTE administrator cross-institution view continues to show the combined dataset
  it("verifies AICTE administrator cross-institution view continues to show all enrolments", () => {
    // When no institutionId is passed (AICTE cross-institution view)
    const allEnrolments = demoStore.getEnrolments();
    expect(allEnrolments.length).toBe(1200);

    // Dashboard stats reflect global totals
    const stats = demoStore.getDashboardStats();
    expect(stats.total_enrolments).toBe(1200);
    expect(stats.total_institutions).toBe(12);

    // Global enrolments contain students from every institution
    const institutionIdsInEnrolments = new Set(allEnrolments.map(e => e.institution_id));
    expect(institutionIdsInEnrolments.size).toBe(12);
    expect(institutionIdsInEnrolments.has(SRIT_ID)).toBe(true);
    expect(institutionIdsInEnrolments.has(NTU_ID)).toBe(true);
    expect(institutionIdsInEnrolments.has(REC_ID)).toBe(true);
  });
});
