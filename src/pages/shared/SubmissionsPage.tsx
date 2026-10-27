import React, { useEffect, useState } from "react";
import { CheckCircle, XCircle, RotateCcw, Eye, Clock, AlertTriangle, ShieldCheck, FileText } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { demoStore } from "../../services/demoStore";
import Badge from "../../components/ui/Badge";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import Spinner from "../../components/ui/Spinner";
import Alert from "../../components/ui/Alert";
import EmptyState from "../../components/ui/EmptyState";
import { formatDateTime } from "../../lib/utils";
import { SubmissionBatch, BatchStatus, BatchEnrolmentRowResult, Enrolment } from "../../types";

const DEMO_BATCHES = [
  { id: "b1", institution: { name: "Shri Ram Institute of Technology" }, academic_year: "2024-25", status: "submitted" as BatchStatus, total_records: 120, valid_records: 115, error_records: 5, submitted_at: "2024-08-15T10:30:00Z", created_at: "2024-08-14T09:00:00Z", updated_at: "2024-08-15T10:30:00Z" },
  { id: "b2", institution: { name: "National Technical University" }, academic_year: "2024-25", status: "approved" as BatchStatus, total_records: 240, valid_records: 238, error_records: 2, submitted_at: "2024-08-10T14:00:00Z", reviewed_at: "2024-08-20T11:00:00Z", reviewer_notes: "Approved after review of minor discrepancies.", created_at: "2024-08-09T09:00:00Z", updated_at: "2024-08-20T11:00:00Z" },
  { id: "b3", institution: { name: "Regional Engineering College" }, academic_year: "2024-25", status: "returned_for_correction" as BatchStatus, total_records: 80, valid_records: 65, error_records: 15, submitted_at: "2024-09-01T09:00:00Z", reviewed_at: "2024-09-05T15:00:00Z", reviewer_notes: "15 records have missing APAAR IDs. Please obtain and resubmit.", created_at: "2024-09-01T08:00:00Z", updated_at: "2024-09-05T15:00:00Z" },
  { id: "b4", institution: { name: "Institute of Business Management" }, academic_year: "2024-25", status: "under_review" as BatchStatus, total_records: 60, valid_records: 60, error_records: 0, submitted_at: "2024-09-10T10:00:00Z", created_at: "2024-09-10T09:00:00Z", updated_at: "2024-09-10T10:00:00Z" },
];

const statusBadge: Record<BatchStatus, "green" | "blue" | "yellow" | "red" | "gray"> = {
  approved: "green", submitted: "blue", under_review: "blue", draft: "gray",
  processing: "yellow", validation_complete: "yellow",
  validation_failed: "red", rejected: "red", returned_for_correction: "yellow"
};

function ReviewModal({
  batch,
  open,
  onClose,
  onAction,
  role,
}: {
  batch: any;
  open: boolean;
  onClose: () => void;
  onAction: (action: "approve" | "reject" | "return", notes: string) => void;
  role: "aicte" | "institution";
}) {
  const { isDemoMode } = useAuth();
  const [notes, setNotes] = useState(batch?.reviewer_notes ?? "");
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState<{
    rowResults: BatchEnrolmentRowResult[];
    enrolments: Enrolment[];
  }>({ rowResults: [], enrolments: [] });
  const [loadingDetails, setLoadingDetails] = useState(true);

  useEffect(() => {
    if (!batch) return;
    setLoadingDetails(true);
    if (isDemoMode) {
      const res = demoStore.getBatchDetails(batch.id);
      setDetails({
        rowResults: res.rowResults || [],
        enrolments: res.enrolments || [],
      });
      setLoadingDetails(false);
    } else {
      (async () => {
        try {
          const { data: enrs } = await supabase
            .from("enrolments")
            .select("*, student:students(*), programme:programmes(*)")
            .eq("batch_id", batch.id);
          const { data: errs } = await supabase
            .from("submission_errors")
            .select("*")
            .eq("batch_id", batch.id);

          const synthesizedRowResults: BatchEnrolmentRowResult[] = [];
          (enrs || []).forEach((e: any, idx: number) => {
            synthesizedRowResults.push({
              row_number: idx + 1,
              institution_student_id: e.institution_student_id,
              status: "accepted",
              student_id: e.student_id,
              enrolment_id: e.id,
            });
          });
          (errs || []).forEach((err: any) => {
            synthesizedRowResults.push({
              row_number: err.row_number || 0,
              institution_student_id: "-",
              status: err.error_type === "duplicate" ? "duplicate" : "rejected",
              error_type: err.error_type,
              error_message: err.error_message,
            });
          });

          setDetails({
            rowResults: synthesizedRowResults,
            enrolments: enrs || [],
          });
        } catch {
          setDetails({ rowResults: [], enrolments: [] });
        } finally {
          setLoadingDetails(false);
        }
      })();
    }
  }, [batch, isDemoMode]);

  const act = async (action: "approve" | "reject" | "return") => {
    setLoading(true);
    await onAction(action, notes);
    setLoading(false);
    onClose();
  };

  const isAicte = role === "aicte";
  const canAct = isAicte && (batch?.status === "submitted" || batch?.status === "under_review");

  const validRowsCount = details.rowResults.filter((r) => r.status === "accepted").length;
  const duplicateRowsCount = details.rowResults.filter((r) => r.status === "duplicate").length;
  const rejectedRowsCount = details.rowResults.filter((r) => r.status === "rejected").length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isAicte ? `AICTE Batch Validation Review — ${batch?.id}` : `Batch Details — ${batch?.id}`}
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {canAct ? "Cancel" : "Close"}
          </Button>
          {canAct && (
            <>
              <Button variant="ghost" onClick={() => act("return")} loading={loading} icon={<RotateCcw size={16} />}>
                Return for Correction
              </Button>
              <Button variant="danger" onClick={() => act("reject")} loading={loading}>
                Reject
              </Button>
              <Button onClick={() => act("approve")} loading={loading} icon={<CheckCircle size={16} />}>
                Approve Batch
              </Button>
            </>
          )}
        </>
      }
    >
      {/* Batch Metadata Header */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.75rem", marginBottom: "1.25rem" }}>
        {[
          ["Institution", batch?.institution?.name ?? "-"],
          ["Academic Year", batch?.academic_year],
          ["Total Records", batch?.total_records],
          ["Submitted At", formatDateTime(batch?.submitted_at)],
          ["Batch Status", <Badge variant={statusBadge[batch?.status as BatchStatus] ?? "gray"}>{batch?.status?.replace(/_/g, " ")}</Badge>],
        ].map(([label, value], i) => (
          <div key={i} style={{ background: "var(--color-neutral-50)", padding: "0.75rem", borderRadius: "0.375rem" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--color-neutral-500)", marginBottom: "0.125rem" }}>{label}</div>
            <div style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--color-neutral-800)" }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Reviewer Feedback Alert if exists */}
      {batch?.reviewer_notes && (
        <div style={{ marginBottom: "1.25rem" }}>
          <Alert variant={batch.status === "approved" ? "success" : "warning"}>
            <div>
              <strong>AICTE Reviewer Feedback:</strong> {batch.reviewer_notes}
            </div>
          </Alert>
        </div>
      )}

      {/* AICTE Central Validation Findings */}
      {isAicte && (
        <div style={{ marginBottom: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
            <h3 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--color-neutral-800)", margin: 0 }}>
              AICTE Central Validation Findings
            </h3>
            <span style={{ fontSize: "0.75rem", color: "var(--color-neutral-500)" }}>
              Evaluated against approved intake, supernumerary quotas &amp; APAAR registry
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "0.75rem", marginBottom: "1rem" }}>
            <div className="stat-card" style={{ padding: "0.75rem", textAlign: "center" }}>
              <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--color-neutral-800)" }}>
                {batch?.total_records || details.rowResults.length}
              </div>
              <div style={{ fontSize: "0.6875rem", color: "var(--color-neutral-500)", textTransform: "uppercase" }}>
                Total Records
              </div>
            </div>

            <div className="stat-card" style={{ padding: "0.75rem", textAlign: "center" }}>
              <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--color-success-600)" }}>
                {validRowsCount}
              </div>
              <div style={{ fontSize: "0.6875rem", color: "var(--color-neutral-500)", textTransform: "uppercase" }}>
                Valid Enrolments
              </div>
            </div>

            <div className="stat-card" style={{ padding: "0.75rem", textAlign: "center" }}>
              <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--color-warning-600)" }}>
                {duplicateRowsCount}
              </div>
              <div style={{ fontSize: "0.6875rem", color: "var(--color-neutral-500)", textTransform: "uppercase" }}>
                Duplicates Flagged
              </div>
            </div>

            <div className="stat-card" style={{ padding: "0.75rem", textAlign: "center" }}>
              <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--color-danger-600)" }}>
                {rejectedRowsCount}
              </div>
              <div style={{ fontSize: "0.6875rem", color: "var(--color-neutral-500)", textTransform: "uppercase" }}>
                Errors / Exceeded
              </div>
            </div>
          </div>

          {/* Validation Details Table */}
          <div className="table-wrapper" style={{ maxHeight: 280, overflowY: "auto", border: "1px solid var(--color-neutral-200)", borderRadius: "0.375rem" }}>
            {loadingDetails ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "2rem" }}>
                <Spinner size={24} />
              </div>
            ) : details.rowResults.length === 0 ? (
              <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--color-neutral-500)", fontSize: "0.875rem" }}>
                No record-level validation items found for this batch.
              </div>
            ) : (
              <table className="data-table" style={{ fontSize: "0.8125rem" }}>
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Student ID</th>
                    <th>Candidate Name</th>
                    <th>Programme</th>
                    <th>Quota / Category</th>
                    <th>APAAR Status</th>
                    <th>AICTE Status</th>
                    <th>Validation Finding</th>
                  </tr>
                </thead>
                <tbody>
                  {details.rowResults.map((r, idx) => {
                    const enr = details.enrolments.find(
                      (e) => e.institution_student_id === r.institution_student_id || e.id === r.enrolment_id
                    );
                    const name = enr?.student?.full_name || (r as any).full_name || "-";
                    const prog = (enr?.programme as any)?.code || (r as any).programme_code || "BTECH-CS";
                    const isSuper = enr?.supernumerary_classification && enr.supernumerary_classification !== "none";
                    const quota = isSuper
                      ? `${enr?.supernumerary_classification?.toUpperCase()} (Supernumerary)`
                      : enr?.admission_category || "Regular";
                    const apaarStatus = enr?.student?.apaar_verification_status || (enr?.student?.apaar_id ? "verified" : "unverified");

                    return (
                      <tr key={idx}>
                        <td>#{r.row_number}</td>
                        <td><code>{r.institution_student_id}</code></td>
                        <td style={{ fontWeight: 500 }}>{name}</td>
                        <td>{prog}</td>
                        <td>
                          {isSuper ? <Badge variant="yellow">{quota}</Badge> : <span>{quota}</span>}
                        </td>
                        <td>
                          <Badge variant={apaarStatus === "verified" ? "green" : String(apaarStatus) === "flagged_demographic_divergence" || String(apaarStatus) === "invalid" ? "red" : "gray"}>
                            {apaarStatus}
                          </Badge>
                        </td>
                        <td>
                          {r.status === "accepted" ? (
                            <Badge variant="green">Valid</Badge>
                          ) : r.status === "duplicate" ? (
                            <Badge variant="yellow">Duplicate</Badge>
                          ) : r.error_type === "supernumerary_exceeded" ? (
                            <Badge variant="red">Quota Exceeded</Badge>
                          ) : r.error_type === "intake_exceeded" ? (
                            <Badge variant="red">Intake Exceeded</Badge>
                          ) : (
                            <Badge variant="red">Format Error</Badge>
                          )}
                        </td>
                        <td style={{ fontSize: "0.75rem", color: r.status === "accepted" ? "var(--color-success-700)" : "var(--color-danger-700)" }}>
                          {r.status === "accepted"
                            ? isSuper
                              ? "Supernumerary quota verified within approved limit"
                              : "Verified: valid enrolment within approved intake"
                            : r.error_message || "Validation check failed"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Review Notes Input */}
      {canAct && (
        <div style={{ marginTop: "1rem" }}>
          <label className="form-label">Review Notes (required for Return / Reject, optional for Approve)</label>
          <textarea
            className="form-input"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Provide clear reasons for your decision or specific instructions for corrections."
            style={{ resize: "vertical" }}
          />
        </div>
      )}
    </Modal>
  );
}

export default function SubmissionsPage({ role }: { role: "aicte" | "institution" }) {
  const { user, isDemoMode } = useAuth();
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewBatch, setReviewBatch] = useState<any | null>(null);

  const loadBatches = async () => {
    setLoading(true);
    const activeInstId =
      user?.profile?.institution_id ||
      (isDemoMode && role === "institution"
        ? (typeof window !== "undefined" && window.sessionStorage?.getItem("aicte_synthetic_demo_inst_id")) ||
          "11111111-1111-1111-1111-111111111111"
        : undefined);

    if (isDemoMode) {
      const demoData = demoStore.getBatches(role === "institution" ? activeInstId : undefined);
      setBatches(demoData);
      setLoading(false);
      return;
    }
    let query = supabase.from("submission_batches").select("*, institution:institutions(name)").order("created_at", { ascending: false });
    if (role === "institution" && activeInstId) {
      query = query.eq("institution_id", activeInstId);
    }
    const { data, error } = await query;
    if (error) {
      setBatches([]);
    } else {
      setBatches(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadBatches();
  }, [isDemoMode, user, role]);

  const handleAction = async (action: "approve" | "reject" | "return", notes: string) => {
    if (!reviewBatch) return;
    const statusMap = {
      approve: "approved",
      reject: "rejected",
      return: "returned_for_correction",
    } as const;

    if (isDemoMode) {
      demoStore.updateBatchStatus(reviewBatch.id, statusMap[action] as any, notes);
      await loadBatches();
      return;
    }

    await supabase
      .from("submission_batches")
      .update({
        status: statusMap[action],
        reviewer_notes: notes,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", reviewBatch.id);

    await loadBatches();
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">{role === "aicte" ? "Submission Review" : "My Submissions"}</h1>
        <p className="page-subtitle">
          {role === "aicte"
            ? "Review, validate, and approve institution batch submissions"
            : "Track your submission batches and their verification status"}
        </p>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}>
            <Spinner size={32} />
          </div>
        ) : batches.length === 0 ? (
          <EmptyState
            title="No submissions found"
            description={
              role === "institution"
                ? "Use CSV Upload to create your first submission."
                : "No institutions have submitted batches yet."
            }
          />
        ) : (
          <div className="table-wrapper" style={{ border: "none", borderRadius: 0 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Batch ID</th>
                  {role === "aicte" && <th>Institution</th>}
                  <th>Academic Year</th>
                  <th>Records</th>
                  <th>Valid / Errors</th>
                  <th>Submitted</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b: any) => (
                  <tr key={b.id}>
                    <td><code style={{ fontSize: "0.8125rem" }}>{b.id.slice(0, 14)}</code></td>
                    {role === "aicte" && <td style={{ fontWeight: 500 }}>{b.institution?.name ?? "-"}</td>}
                    <td>{b.academic_year}</td>
                    <td>{b.total_records}</td>
                    <td>
                      <span style={{ color: "var(--color-success-600)", fontWeight: 600 }}>{b.valid_records}</span>
                      {" / "}
                      <span style={{ color: b.error_records > 0 ? "var(--color-danger-600)" : "var(--color-neutral-400)", fontWeight: 600 }}>
                        {b.error_records}
                      </span>
                    </td>
                    <td style={{ color: "var(--color-neutral-500)" }}>{b.submitted_at ? formatDateTime(b.submitted_at) : "-"}</td>
                    <td><Badge variant={statusBadge[b.status as BatchStatus] ?? "gray"}>{b.status.replace(/_/g, " ")}</Badge></td>
                    <td>
                      {role === "aicte" && (b.status === "submitted" || b.status === "under_review") ? (
                        <Button size="sm" icon={<Eye size={14} />} onClick={() => setReviewBatch(b)}>
                          Review
                        </Button>
                      ) : (
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => setReviewBatch(b)}
                          title="View Batch Details"
                        >
                          <Eye size={14} /> Details
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {reviewBatch && (
        <ReviewModal
          batch={reviewBatch}
          open={!!reviewBatch}
          onClose={() => setReviewBatch(null)}
          onAction={handleAction}
          role={role}
        />
      )}
    </div>
  );
}
