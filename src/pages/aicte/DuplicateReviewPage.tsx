import React, { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle, XCircle, ShieldAlert, Building2, User, ClipboardCheck, Send } from "lucide-react";
import { supabase } from "../../lib/supabase";
import Badge from "../../components/ui/Badge";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import Spinner from "../../components/ui/Spinner";
import EmptyState from "../../components/ui/EmptyState";
import Alert from "../../components/ui/Alert";
import { formatDate } from "../../lib/utils";
import { useAuth } from "../../contexts/AuthContext";
import { demoStore } from "../../services/demoStore";
import { maskSensitiveData } from "../../services/enrolmentService";

const DEMO_CASES = [
  {
    id: "d1",
    case_type: "cross_institution_duplicate",
    severity: "high",
    student_id_1: "s1",
    student_id_2: "s2",
    detection_reason: "Same APAAR ID (XXXXXXXX9012) found in two active enrolments across distinct institutions for academic year 2024-25.",
    review_status: "pending",
    created_at: "2024-09-01T10:00:00Z",
    verification_source: "Simulated Central APAAR Allocation Index",
    verification_status: "verified_cross_institution_match",
    student_1: { full_name: "Arjun Sharma", apaar_id: "123456789012" },
    student_2: { full_name: "Arjun V. Sharma", apaar_id: "123456789012" },
    enrolment_1: { institution: { name: "SRIT Mumbai" }, programme: { name: "B.Tech CS" } },
    enrolment_2: { institution: { name: "NTU Delhi" }, programme: { name: "B.Tech CS" } }
  },
  {
    id: "d2",
    case_type: "demographic_divergence",
    severity: "medium",
    student_id_1: "s3",
    student_id_2: "s4",
    detection_reason: "Demographic name divergence: Verified APAAR register identity differs from admission record for APAAR ID XXXXXXXX0123.",
    review_status: "pending",
    created_at: "2024-09-03T12:00:00Z",
    verification_source: "Simulated APAAR Identity Register (Sandbox)",
    verification_status: "flagged_demographic_divergence",
    student_1: { full_name: "Priya Mehta", apaar_id: "234567890123" },
    student_2: { full_name: "Priya R. Mehta", apaar_id: "234567890123" },
    enrolment_1: { institution: { name: "SRIT Mumbai" }, programme: { name: "MBA" } },
  },
  {
    id: "d3",
    case_type: "missing_apaar",
    severity: "medium",
    student_id_1: "s5",
    detection_reason: "Missing APAAR ID: Enrolment record has no APAAR identifier provided. Verification cannot be performed.",
    review_status: "pending",
    created_at: "2024-09-05T09:00:00Z",
    verification_source: "Admission Intake Record Validation",
    verification_status: "verification_unavailable_missing_id",
    student_1: { full_name: "Siddharth Bhattacharya", apaar_id: "" },
    enrolment_1: { institution: { name: "National Technical University" }, programme: { name: "B.Tech Electronics & Communication" } }
  },
];

function CaseTypeBadge({ type }: { type?: string }) {
  switch (type) {
    case "cross_institution_duplicate":
      return <Badge variant="red">Cross-Institution Duplicate</Badge>;
    case "demographic_divergence":
      return <Badge variant="yellow">Name Divergence</Badge>;
    case "missing_apaar":
      return <Badge variant="gray">Missing APAAR ID</Badge>;
    case "invalid_apaar":
      return <Badge variant="yellow">Invalid APAAR Format</Badge>;
    default:
      return <Badge variant="blue">{type ? type.replace(/_/g, " ") : "Potential Duplicate"}</Badge>;
  }
}

function SeverityBadge({ severity }: { severity?: string }) {
  switch (severity) {
    case "high":
      return <span style={{ color: "var(--color-danger-700)", fontWeight: 700, fontSize: "0.75rem", textTransform: "uppercase" }}>High</span>;
    case "medium":
      return <span style={{ color: "var(--color-warning-700)", fontWeight: 700, fontSize: "0.75rem", textTransform: "uppercase" }}>Medium</span>;
    case "low":
      return <span style={{ color: "var(--color-neutral-600)", fontWeight: 700, fontSize: "0.75rem", textTransform: "uppercase" }}>Low</span>;
    default:
      return null;
  }
}

function CaseModal({ cas, open, onClose, onResolve }: { cas: any; open: boolean; onClose: () => void; onResolve: (status: string, notes: string) => void }) {
  const [notes, setNotes] = useState(cas?.reviewer_notes ?? "");
  const [_loading, setLoading] = useState(false);
  const resolve = async (s: string) => { setLoading(true); await onResolve(s, notes); setLoading(false); onClose(); };

  const [showCorrectionForm, setShowCorrectionForm] = useState(false);
  const [targetRecordIdx, setTargetRecordIdx] = useState(1);
  const [crCategory, setCrCategory] = useState<string>(
    cas?.case_type === "missing_apaar"
      ? "missing_apaar"
      : cas?.case_type === "invalid_apaar"
      ? "invalid_apaar_format"
      : cas?.case_type === "demographic_divergence"
      ? "demographic_review"
      : "apaar_entry_error"
  );
  const [crDescription, setCrDescription] = useState<string>(
    cas?.detection_reason || "Please verify candidate identity and submit corrected enrolment data."
  );
  const [crSuccess, setCrSuccess] = useState<string | null>(null);
  const [crError, setCrError] = useState<string | null>(null);

  const isSingleRecord = !cas?.student_2 || cas?.case_type === "missing_apaar" || cas?.case_type === "invalid_apaar";
  const isDemographic = cas?.case_type === "demographic_divergence";
  const s1 = cas?.student_1;
  const s2 = cas?.student_2;
  const e1 = cas?.enrolment_1;
  const e2 = cas?.enrolment_2;

  return (
    <Modal open={open} onClose={onClose} title="Review Queue Investigation Case" size="lg"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="ghost" onClick={() => resolve("dismissed")}>Dismiss Case</Button>
        {isSingleRecord ? (
          <Button variant="primary" onClick={() => resolve("reviewed")} icon={<CheckCircle size={16} />}>
            Acknowledge &amp; Request ID
          </Button>
        ) : (
          <Button variant="primary" onClick={() => resolve("legitimate")} icon={<CheckCircle size={16} />}>
            Mark as Legitimate / Transfer
          </Button>
        )}
        <Button variant="danger" onClick={() => resolve("confirmed_duplicate")} icon={<XCircle size={16} />}>
          {isSingleRecord ? "Flag as Non-Compliant" : "Confirm Duplicate"}
        </Button>
      </>}
    >
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.75rem" }}>
        <CaseTypeBadge type={cas?.case_type} />
        {cas?.severity && <span style={{ fontSize: "0.8125rem", color: "var(--color-neutral-500)" }}>Severity: <SeverityBadge severity={cas.severity} /></span>}
        <Badge variant={cas?.review_status === "pending" ? "red" : "green"}>{cas?.review_status?.replace(/_/g, " ")}</Badge>
      </div>

      <Alert variant="warning" className="mb-4">
        <strong>Evidence-Based Detection Reason:</strong> {cas?.detection_reason}
      </Alert>

      {/* Case Evidence Metadata Panel */}
      <div style={{ background: "var(--color-neutral-50)", padding: "0.75rem 1rem", borderRadius: "0.5rem", border: "1px solid var(--color-neutral-200)", marginBottom: "1.25rem", fontSize: "0.8125rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.75rem" }}>
          <div>
            <span style={{ color: "var(--color-neutral-500)", display: "block" }}>Evidence Source:</span>
            <strong>{cas?.verification_source || "Admission Intake Verification"}</strong>
          </div>
          <div>
            <span style={{ color: "var(--color-neutral-500)", display: "block" }}>Verification Status:</span>
            <span style={{ color: "var(--color-primary-700)", fontWeight: 600 }}>{cas?.verification_status?.replace(/_/g, " ") || "Verification checked"}</span>
          </div>
          <div>
            <span style={{ color: "var(--color-neutral-500)", display: "block" }}>Verification Timestamp:</span>
            <span>{cas?.verification_timestamp ? formatDate(cas.verification_timestamp) : (cas?.created_at ? formatDate(cas.created_at) : "N/A")}</span>
          </div>
          <div>
            <span style={{ color: "var(--color-neutral-500)", display: "block" }}>Simulation Label:</span>
            <span style={{ color: "#b45309", fontWeight: 600 }}>Simulated Demo Engine (Sandbox)</span>
          </div>
        </div>
        {cas?.evidence_summary && (
          <div style={{ marginTop: "0.5rem", paddingTop: "0.5rem", borderTop: "1px dashed var(--color-neutral-200)" }}>
            <span style={{ color: "var(--color-neutral-500)" }}>Evidence Summary: </span>
            <span>{cas.evidence_summary}</span>
          </div>
        )}
      </div>

      {/* Affected Records Section */}
      {isSingleRecord ? (
        /* SINGLE RECORD EXCEPTION VIEW (e.g. Missing APAAR ID or Invalid Format) */
        <div style={{ marginBottom: "1.25rem" }}>
          <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-neutral-600)", marginBottom: "0.5rem" }}>
            Affected Admission Record (Single-Record Issue — No conflicting student associated)
          </div>
          <div style={{ background: "#ffffff", padding: "1.25rem", borderRadius: "0.5rem", border: "1px solid var(--color-neutral-200)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", fontSize: "0.875rem" }}>
              <div>
                <div style={{ color: "var(--color-neutral-500)", fontSize: "0.75rem" }}>STUDENT FULL NAME</div>
                <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--color-neutral-900)" }}>{s1?.full_name || "Unknown"}</div>
              </div>
              <div>
                <div style={{ color: "var(--color-neutral-500)", fontSize: "0.75rem" }}>APAAR ID STATUS</div>
                <div style={{ fontWeight: 600, color: s1?.apaar_id ? "var(--color-danger-700)" : "var(--color-warning-700)" }}>
                  {s1?.apaar_id ? `${s1.apaar_id} (Invalid Format)` : "Not Provided / Absent"}
                </div>
              </div>
              <div>
                <div style={{ color: "var(--color-neutral-500)", fontSize: "0.75rem" }}>INSTITUTION</div>
                <div style={{ fontWeight: 600 }}>{e1?.institution?.name || "Institution not specified"}</div>
              </div>
              <div>
                <div style={{ color: "var(--color-neutral-500)", fontSize: "0.75rem" }}>PROGRAMME &amp; ACADEMIC YEAR</div>
                <div>{e1?.programme?.name || "Programme not specified"} ({e1?.academic_year || "2024-25"})</div>
              </div>
              <div>
                <div style={{ color: "var(--color-neutral-500)", fontSize: "0.75rem" }}>STABLE RECORD IDENTIFIER</div>
                <code style={{ fontSize: "0.75rem" }}>{s1?.id || cas?.student_id_1}</code>
              </div>
              <div>
                <div style={{ color: "var(--color-neutral-500)", fontSize: "0.75rem" }}>VERIFICATION ATTEMPT</div>
                <div style={{ color: "var(--color-neutral-600)", fontStyle: "italic" }}>
                  {cas?.case_type === "missing_apaar" ? "Not performed (ID absent)" : "Failed format validation"}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : isDemographic ? (
        /* DEMOGRAPHIC DIVERGENCE VIEW (Admission Record vs Simulated APAAR Directory) */
        <div style={{ marginBottom: "1.25rem" }}>
          <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-neutral-600)", marginBottom: "0.5rem" }}>
            Identity Comparison (Admission Record vs Verified APAAR Directory Register)
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div style={{ background: "#ffffff", padding: "1rem", borderRadius: "0.5rem", border: "1px solid var(--color-neutral-200)" }}>
              <div style={{ fontWeight: 700, fontSize: "0.875rem", color: "var(--color-primary-700)", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.375rem" }}>
                <User size={16} /> Admission Enrolment Record
              </div>
              <div style={{ fontSize: "0.875rem", display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                <div><strong>Enrolled Name:</strong> <span style={{ color: "var(--color-danger-700)", fontWeight: 700 }}>{s1?.full_name}</span></div>
                <div><strong>APAAR ID:</strong> {s1?.apaar_id ? maskSensitiveData(s1.apaar_id) : "Not provided"}</div>
                <div><strong>Institution:</strong> {e1?.institution?.name || "Institution"}</div>
                <div><strong>Programme:</strong> {e1?.programme?.name || "Programme"} ({e1?.academic_year || "2024-25"})</div>
                <div style={{ fontSize: "0.75rem", color: "var(--color-neutral-500)" }}>Record ID: {s1?.id}</div>
              </div>
            </div>
            <div style={{ background: "#f8fafc", padding: "1rem", borderRadius: "0.5rem", border: "1px solid #cbd5e1" }}>
              <div style={{ fontWeight: 700, fontSize: "0.875rem", color: "#0369a1", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.375rem" }}>
                <ShieldAlert size={16} /> Simulated APAAR Register Identity
              </div>
              <div style={{ fontSize: "0.875rem", display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                <div><strong>Register Name:</strong> <span style={{ color: "#0369a1", fontWeight: 700 }}>{s2?.full_name}</span></div>
                <div><strong>APAAR ID:</strong> {s2?.apaar_id ? maskSensitiveData(s2.apaar_id) : "Not provided"}</div>
                <div><strong>Evidence Authority:</strong> Simulated APAAR Registry</div>
                <div><strong>Match Condition:</strong> Same APAAR ID, Name Variance</div>
                <div style={{ fontSize: "0.75rem", color: "var(--color-neutral-500)" }}>Verification ID: {s2?.id}</div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* CROSS-INSTITUTION DUPLICATE VIEW (Record 1 vs Record 2) */
        <div style={{ marginBottom: "1.25rem" }}>
          <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-neutral-600)", marginBottom: "0.5rem" }}>
            Cross-Institution Dual Enrolments (Same APAAR ID at Distinct Institutions)
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            {[1, 2].map(n => {
              const s = n === 1 ? s1 : s2;
              const e = n === 1 ? e1 : e2;
              return (
                <div key={n} style={{ background: "#ffffff", padding: "1rem", borderRadius: "0.5rem", border: "1px solid var(--color-neutral-200)" }}>
                  <div style={{ fontWeight: 700, fontSize: "0.875rem", color: "var(--color-primary-700)", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.375rem" }}>
                    <Building2 size={16} /> Enrolment Record {n}
                  </div>
                  <div style={{ fontSize: "0.875rem", display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                    <div><strong>Name:</strong> {s?.full_name}</div>
                    <div><strong>APAAR ID:</strong> <span style={{ fontFamily: "monospace", fontWeight: 600 }}>{s?.apaar_id ? maskSensitiveData(s.apaar_id) : "Not provided"}</span></div>
                    <div><strong>Institution:</strong> {e?.institution?.name || "Institution " + n}</div>
                    <div><strong>Programme:</strong> {e?.programme?.name || "Programme"} ({e?.academic_year || "2024-25"})</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--color-neutral-500)" }}>Record ID: {s?.id}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <label className="form-label" style={{ fontWeight: 600 }}>Reviewer Assessment &amp; Notes</label>
        <textarea className="form-input" rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Document verification findings, transfer proof, or corrective instructions..." style={{ resize: "vertical" }} />
      </div>

      
      {/* AICTE Institution Correction Request Workflow */}
      <div style={{ marginTop: "1rem", marginBottom: "0.75rem", border: "1px solid #cbd5e1", borderRadius: "0.5rem", overflow: "hidden" }}>
        <div
          style={{
            background: "#f1f5f9",
            padding: "0.625rem 0.875rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            cursor: "pointer",
          }}
          onClick={() => setShowCorrectionForm(!showCorrectionForm)}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 700, fontSize: "0.8125rem", color: "#1e293b" }}>
            <ClipboardCheck size={16} style={{ color: "var(--color-primary-600)" }} />
            <span>Send Formal Correction Request to Institution</span>
          </div>
          <Button variant="secondary" size="sm" type="button" onClick={(e) => { e.stopPropagation(); setShowCorrectionForm(!showCorrectionForm); }}>
            {showCorrectionForm ? "Hide Form" : "Create Request"}
          </Button>
        </div>

        {showCorrectionForm && (
          <div style={{ padding: "0.875rem", background: "#ffffff" }}>
            {crSuccess && (
              <Alert variant="success" className="mb-3">
                {crSuccess}
              </Alert>
            )}
            {crError && (
              <Alert variant="error" className="mb-3">
                {crError}
              </Alert>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--color-neutral-700)", marginBottom: "0.25rem" }}>
                  Target Institution & Record
                </label>
                <select
                  className="form-input"
                  style={{ width: "100%", fontSize: "0.8125rem" }}
                  value={targetRecordIdx}
                  onChange={(e) => setTargetRecordIdx(Number(e.target.value))}
                >
                  <option value={1}>
                    Record 1: {e1?.institution?.name || "Institution 1"} ({s1?.full_name})
                  </option>
                  {!isSingleRecord && e2 && (
                    <option value={2}>
                      Record 2: {e2?.institution?.name || "Institution 2"} ({s2?.full_name})
                    </option>
                  )}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--color-neutral-700)", marginBottom: "0.25rem" }}>
                  Correction Category
                </label>
                <select
                  className="form-input"
                  style={{ width: "100%", fontSize: "0.8125rem" }}
                  value={crCategory}
                  onChange={(e) => setCrCategory(e.target.value)}
                >
                  <option value="missing_apaar">Missing APAAR ID</option>
                  <option value="invalid_apaar_format">Invalid APAAR Format</option>
                  <option value="apaar_entry_error">Possible APAAR Data-Entry Error</option>
                  <option value="demographic_review">Name or Demographic Review</option>
                  <option value="enrolment_data_correction">Enrolment Data Correction</option>
                  <option value="supporting_info_required">Supporting Information Required</option>
                  <option value="other">Other Clerical Issue</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: "0.75rem" }}>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--color-neutral-700)", marginBottom: "0.25rem" }}>
                Issue Description &amp; Specific Action Required
              </label>
              <textarea
                className="form-input"
                rows={2}
                style={{ width: "100%", fontSize: "0.8125rem" }}
                value={crDescription}
                onChange={(e) => setCrDescription(e.target.value)}
                placeholder="Explain the detected discrepancy and what the institution needs to verify..."
              />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", gap: "1rem", fontSize: "0.75rem", color: "var(--color-neutral-600)" }}>
                <span>Requested Fields: <strong>APAAR ID</strong>, <strong>Full Name</strong></span>
              </div>
              <Button
                variant="primary"
                size="sm"
                icon={<Send size={14} />}
                onClick={() => {
                  const targetEnr = targetRecordIdx === 1 ? e1 : e2;
                  const enrId = targetEnr?.id || (targetRecordIdx === 1 ? cas?.enrolment_id_1 : cas?.enrolment_id_2);
                  if (!enrId) {
                    setCrError("Unable to identify target enrolment record for request.");
                    return;
                  }
                  if (!crDescription.trim()) {
                    setCrError("Please enter an issue description.");
                    return;
                  }

                  const res = demoStore.createCorrectionRequest({
                    enrolment_id: enrId,
                    case_id: cas.id,
                    category: crCategory as any,
                    issue_description: crDescription.trim(),
                    requested_fields: ["apaar_id", "full_name"],
                    priority: "high",
                  });

                  if (res.success && res.data) {
                    setCrSuccess(`Correction request ${res.data.id} sent to ${targetEnr?.institution?.name || "Institution"}!`);
                    setCrError(null);
                  } else {
                    setCrError(res.error || "Failed to create request.");
                  }
                }}
              >
                Send Request to Institution
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="alert alert-info" style={{ marginTop: "0.75rem", fontSize: "0.8125rem" }}>
        <AlertTriangle size={16} />
        <span>
          <strong>Due Process Note:</strong> All findings reflect synthetic sandbox checks. A student may have legitimate reasons for dual records (e.g. approved institutional transfer, simultaneous diploma, or data correction). Do not infer misconduct without formal inquiry.
        </span>
      </div>
    </Modal>
  );
}

export default function DuplicateReviewPage() {
  const { user, isDemoMode } = useAuth();
  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<string>("all");

  const loadCases = async () => {
    setLoading(true);
    if (isDemoMode) {
      const demoCases = demoStore.getDuplicateCases();
      setCases(demoCases);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase.from("duplicate_review_cases").select("*, student_1:students!duplicate_review_cases_student_id_1_fkey(*), student_2:students!duplicate_review_cases_student_id_2_fkey(*)").order("created_at", { ascending: false });
    if (error || !data?.length) { setCases(DEMO_CASES); } else { setCases(data); }
    setLoading(false);
  };

  useEffect(() => { loadCases(); }, [isDemoMode]);

  const handleResolve = async (status: string, notes: string) => {
    if (!selected) return;
    if (isDemoMode) {
      demoStore.resolveDuplicateCase(selected.id, status as any, notes, user?.email);
      await loadCases();
      return;
    }
    await supabase.from("duplicate_review_cases").update({ review_status: status, reviewer_notes: notes, reviewed_at: new Date().toISOString() }).eq("id", selected.id);
    await loadCases();
  };

  const badgeMap: Record<string, "red" | "green" | "gray" | "yellow"> = {
    pending: "red", confirmed_duplicate: "red", legitimate: "green", dismissed: "gray", reviewed: "gray"
  };

  // Filter cases based on active tab
  const filteredCases = cases.filter(c => {
    if (activeTab === "pending") return c.review_status === "pending";
    if (activeTab === "cross_institution") return c.case_type === "cross_institution_duplicate";
    if (activeTab === "demographic") return c.case_type === "demographic_divergence";
    if (activeTab === "missing_invalid") return c.case_type === "missing_apaar" || c.case_type === "invalid_apaar";
    if (activeTab === "resolved") return c.review_status !== "pending";
    return true; // "all"
  });

  const pendingCount = cases.filter(c => c.review_status === "pending").length;
  const crossInstCount = cases.filter(c => c.case_type === "cross_institution_duplicate").length;
  const demographicCount = cases.filter(c => c.case_type === "demographic_divergence").length;
  const missingCount = cases.filter(c => c.case_type === "missing_apaar" || c.case_type === "invalid_apaar").length;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Duplicate &amp; Exception Review Queue</h1>
        <p className="page-subtitle">Evidence-based audit of potential duplicates, identity divergence, and intake format exceptions</p>
      </div>

      

      {/* Filter Tabs */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <button
          className={`btn btn-sm ${activeTab === "all" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setActiveTab("all")}
        >
          All Cases ({cases.length})
        </button>
        <button
          className={`btn btn-sm ${activeTab === "pending" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setActiveTab("pending")}
        >
          Pending Review ({pendingCount})
        </button>
        <button
          className={`btn btn-sm ${activeTab === "cross_institution" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setActiveTab("cross_institution")}
        >
          Cross-Institution ({crossInstCount})
        </button>
        <button
          className={`btn btn-sm ${activeTab === "demographic" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setActiveTab("demographic")}
        >
          Name Divergence ({demographicCount})
        </button>
        <button
          className={`btn btn-sm ${activeTab === "missing_invalid" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setActiveTab("missing_invalid")}
        >
          Missing / Invalid APAAR ({missingCount})
        </button>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}><Spinner size={32} /></div>
        ) : filteredCases.length === 0 ? (
          <EmptyState title="No matching cases" description="No cases found matching the selected filter." icon={<CheckCircle size={48} strokeWidth={1} style={{ color: "var(--color-success-500)" }} />} />
        ) : (
          <div className="table-wrapper" style={{ border: "none", borderRadius: 0 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Case ID</th>
                  <th>Exception Type</th>
                  <th>Affected Record(s)</th>
                  <th>Detection Reason</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>Detected</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredCases.map((c: any) => {
                  const isSingle = !c.student_2 || c.case_type === "missing_apaar" || c.case_type === "invalid_apaar";
                  return (
                    <tr key={c.id}>
                      <td><code style={{ fontSize: "0.8125rem", fontWeight: 700 }}>{c.id}</code></td>
                      <td><CaseTypeBadge type={c.case_type} /></td>
                      <td style={{ fontSize: "0.8125rem" }}>
                        <div><strong>1:</strong> {c.student_1?.full_name ?? "—"}</div>
                        {isSingle ? (
                          <div style={{ color: "var(--color-neutral-400)", fontSize: "0.75rem", fontStyle: "italic" }}>Single-record exception</div>
                        ) : (
                          <div>
                            <strong>{c.case_type === "demographic_divergence" ? "Reg:" : "2:"}</strong>{" "}
                            {c.student_2?.full_name ?? "—"}
                          </div>
                        )}
                      </td>
                      <td style={{ maxWidth: 280, fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>
                        {c.detection_reason?.length > 75 ? c.detection_reason.slice(0, 75) + "…" : c.detection_reason}
                      </td>
                      <td><SeverityBadge severity={c.severity} /></td>
                      <td><Badge variant={badgeMap[c.review_status] ?? "gray"}>{c.review_status?.replace(/_/g, " ")}</Badge></td>
                      <td style={{ color: "var(--color-neutral-500)", fontSize: "0.8125rem" }}>{formatDate(c.created_at)}</td>
                      <td>
                        <Button size="sm" variant={c.review_status === "pending" ? "primary" : "secondary"} onClick={() => setSelected(c)}>
                          {c.review_status === "pending" ? "Review" : "View"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && <CaseModal cas={selected} open={!!selected} onClose={() => setSelected(null)} onResolve={handleResolve} />}
    </div>
  );
}
