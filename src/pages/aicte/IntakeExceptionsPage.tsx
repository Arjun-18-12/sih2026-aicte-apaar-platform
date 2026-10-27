import React, { useState, useEffect } from "react";
import {
  TrendingUp,
  AlertTriangle,
  ShieldCheck,
  Send,
  Clock,
  XCircle,
  CheckCircle,
  Building2,
  Calendar,
  MessageSquare
} from "lucide-react";
import Badge from "../../components/ui/Badge";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import { useAuth } from "../../contexts/AuthContext";
import { demoStore } from "../../services/demoStore";
import { IntakeException } from "../../types";
import { formatDate, formatDateTime } from "../../lib/utils";

export default function IntakeExceptionsPage() {
  const { user, isDemoMode } = useAuth();
  const [exceptions, setExceptions] = useState<IntakeException[]>([]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Request Explanation Modal State
  const [inquiryModalOpen, setInquiryModalOpen] = useState(false);
  const [selectedEx, setSelectedEx] = useState<IntakeException | null>(null);
  const [inquiryText, setInquiryText] = useState("");
  const [deadline, setDeadline] = useState("");

  // Rejection Modal State
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  const refreshData = () => {
    if (isDemoMode) {
      const list = demoStore.getIntakeExceptions();
      setExceptions(list);
    }
  };

  useEffect(() => {
    refreshData();
  }, [isDemoMode]);

  const openInquiryModal = (ex: IntakeException) => {
    setSelectedEx(ex);
    const actual = ex.enrolled ?? ex.supernumerary_enrolled ?? (ex.approved_intake + ex.excess);
    setInquiryText(
      `AICTE council inquiry: Approved capacity is ${ex.approved_intake}, but ${actual} candidates were admitted (+${ex.excess} excess). Please provide governing board authorization and explanation for excess enrolments.`
    );
    // Default deadline: 7 days from now
    const d = new Date();
    d.setDate(d.getDate() + 7);
    setDeadline(d.toISOString().slice(0, 10));
    setInquiryModalOpen(true);
  };

  const handleSendInquiry = () => {
    if (!selectedEx || !inquiryText.trim()) return;
    const res = demoStore.requestIntakeExplanation(
      selectedEx.id,
      inquiryText.trim(),
      deadline ? `${deadline}T17:00:00Z` : undefined,
      user?.email || 'aicte.admin@demo.aicte.gov.in'
    );
    if (res.success) {
      setSuccessMessage(`Explanation request successfully dispatched to ${selectedEx.institution} inbox.`);
      setInquiryModalOpen(false);
      refreshData();
      setTimeout(() => setSuccessMessage(null), 5000);
    }
  };

  const openRejectModal = (ex: IntakeException) => {
    setSelectedEx(ex);
    setRejectionReason(
      "Excess admissions exceed statutory approved intake quota without prior AICTE approval. Institution must regularize enrolments."
    );
    setRejectModalOpen(true);
  };

  const handleConfirmReject = () => {
    if (!selectedEx || !rejectionReason.trim()) return;
    const res = demoStore.rejectIntakeException(
      selectedEx.id,
      rejectionReason.trim(),
      user?.email || 'aicte.admin@demo.aicte.gov.in'
    );
    if (res.success) {
      setSuccessMessage(`Intake exception rejected. Formal notification sent to ${selectedEx.institution}.`);
      setRejectModalOpen(false);
      refreshData();
      setTimeout(() => setSuccessMessage(null), 5000);
    }
  };

  const handleApproveDispensation = (ex: IntakeException) => {
    const res = demoStore.approveIntakeDispensation(
      ex.id,
      "AICTE approved seat expansion under special council dispensation (Ref: AICTE/COUNCIL/2024/DISP).",
      user?.email || 'aicte.admin@demo.aicte.gov.in'
    );
    if (res.success) {
      setSuccessMessage(`Special intake dispensation approved for ${ex.institution}. Records updated.`);
      refreshData();
      setTimeout(() => setSuccessMessage(null), 5000);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Intake &amp; Quota Exception Review</h1>
        <p className="page-subtitle">Capacity limits, approved quotas, and supernumerary enrolment variance</p>
      </div>

      {successMessage && (
        <Alert variant="success" className="mb-4">
          <CheckCircle size={16} /> <span>{successMessage}</span>
        </Alert>
      )}

      <Alert variant="warning" className="mb-4">
        These records exceed approved institutional capacity limits. They <strong>cannot be treated as sanctioned enrolments</strong> until explicitly reviewed and approved by AICTE. Institutions must not admit students beyond approved limits without prior AICTE authorization.
      </Alert>

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {exceptions.map(ex => {
          const isResolved = ex.status === "approved" || ex.status === "resolved";
          const isRejected = ex.status === "rejected";
          const isAwaitingInst = ex.status === "awaiting_institution";
          const hasResponse = ex.status === "explanation_submitted";
          const isPendingInitial = ex.status === "pending_review";

          return (
            <div key={ex.id} className="card" style={{ borderLeft: isResolved ? "4px solid var(--color-success-500)" : isRejected ? "4px solid var(--color-danger-500)" : hasResponse ? "4px solid #3b82f6" : "4px solid #f59e0b" }}>
              <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <TrendingUp size={18} style={{ color: isResolved ? "var(--color-success-600)" : isRejected ? "var(--color-danger-600)" : "var(--color-warning-600)" }} />
                  <div>
                    <span style={{ fontWeight: 600, color: "var(--color-neutral-800)" }}>{ex.institution}</span>
                    <span style={{ color: "var(--color-neutral-400)", margin: "0 0.5rem" }}>—</span>
                    <span style={{ color: "var(--color-neutral-600)" }}>{ex.programme}</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <Badge variant={ex.type === "regular_overflow" ? "red" : "yellow"}>
                    {ex.type.replace(/_/g, " ")}
                  </Badge>
                  {isResolved && <Badge variant="green">Resolved / Approved</Badge>}
                  {isRejected && <Badge variant="red">Rejected</Badge>}
                  {isAwaitingInst && <Badge variant="yellow">Awaiting Institution Explanation</Badge>}
                  {hasResponse && <Badge variant="blue">Explanation Submitted (Under Review)</Badge>}
                  {isPendingInitial && <Badge variant="yellow">Pending Review</Badge>}
                </div>
              </div>

              <div className="card-body">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.75rem", marginBottom: "1rem" }}>
                  <div style={{ background: "var(--color-neutral-50)", padding: "0.75rem", borderRadius: "0.375rem" }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--color-neutral-500)" }}>Academic Year</div>
                    <div style={{ fontWeight: 700 }}>{ex.academic_year}</div>
                  </div>
                  <div style={{ background: "var(--color-neutral-50)", padding: "0.75rem", borderRadius: "0.375rem" }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--color-neutral-500)" }}>Approved Intake</div>
                    <div style={{ fontWeight: 700 }}>{ex.approved_intake}</div>
                  </div>
                  <div style={{ background: "var(--color-neutral-50)", padding: "0.75rem", borderRadius: "0.375rem" }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--color-neutral-500)" }}>
                      {ex.type === "supernumerary_overflow" ? "Supernumerary Enrolled" : "Actual Enrolled"}
                    </div>
                    <div style={{ fontWeight: 700, color: "var(--color-danger-600)" }}>
                      {ex.type === "supernumerary_overflow"
                        ? `${ex.supernumerary_enrolled ?? (ex.approved_intake + ex.excess)} enrolled (cap: ${ex.supernumerary_capacity ?? 6})`
                        : (ex.enrolled ?? (ex.approved_intake + ex.excess))}
                    </div>
                  </div>
                  <div style={{ background: "var(--color-danger-50)", padding: "0.75rem", borderRadius: "0.375rem", border: "1px solid var(--color-danger-200)" }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--color-danger-600)" }}>Excess Enrolment</div>
                    <div style={{ fontWeight: 800, color: "var(--color-danger-700)", fontSize: "1.25rem" }}>+${ex.excess}</div>
                  </div>
                </div>

                <div className="alert alert-warning" style={{ marginBottom: "0.75rem" }}>
                  <AlertTriangle size={16} /><span>{ex.detection_note}</span>
                </div>

                {/* Display inquiry details if dispatched */}
                {(isAwaitingInst || hasResponse) && ex.inquiry_text && (
                  <div style={{ background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: "0.375rem", padding: "0.875rem", marginBottom: "0.75rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.375rem" }}>
                      <span style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "#475569" }}>
                        AICTE Council Inquiry Dispatched
                      </span>
                      {ex.inquiry_deadline && (
                        <span style={{ fontSize: "0.75rem", color: "#e11d48", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                          <Clock size={12} /> Deadline: {formatDate(ex.inquiry_deadline)}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: "0.875rem", color: "#1e293b", fontStyle: "italic" }}>
                      "{ex.inquiry_text}"
                    </div>
                  </div>
                )}

                {/* Display Institution Response if submitted */}
                {hasResponse && ex.institution_response && (
                  <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "0.375rem", padding: "0.875rem", marginBottom: "0.75rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.375rem" }}>
                      <span style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "#1d4ed8", display: "flex", alignItems: "center", gap: "0.375rem" }}>
                        <MessageSquare size={14} /> Official Institution Explanation Received
                      </span>
                      {ex.responded_at && (
                        <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                          {formatDateTime(ex.responded_at)}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: "0.875rem", color: "#1e3a8a", fontWeight: 500, whiteSpace: "pre-wrap" }}>
                      {ex.institution_response}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "#475569", marginTop: "0.5rem" }}>
                      Submitted by: {ex.responded_by || "Institution Administrator"} | Status: Pending AICTE Final Council Adjudication
                    </div>
                  </div>
                )}

                {/* Display Resolution or Rejection note */}
                {ex.resolution && (
                  <div className={isRejected ? "alert alert-danger" : "alert alert-success"} style={{ marginTop: "0.75rem" }}>
                    <ShieldCheck size={16} /><span><strong>Resolution / Decision:</strong> {ex.resolution}</span>
                  </div>
                )}

                {/* Action Controls for AICTE Reviewer */}
                {(!isResolved && !isRejected) && (
                  <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", flexWrap: "wrap" }}>
                    <Button size="sm" variant="danger" onClick={() => openRejectModal(ex)}>
                      Reject Excess Records
                    </Button>
                    {!hasResponse && !isAwaitingInst && (
                      <Button size="sm" variant="secondary" onClick={() => openInquiryModal(ex)}>
                        Request Explanation
                      </Button>
                    )}
                    {isAwaitingInst && (
                      <Button size="sm" variant="secondary" onClick={() => openInquiryModal(ex)}>
                        Update Inquiry / Deadline
                      </Button>
                    )}
                    <Button size="sm" variant="primary" onClick={() => handleApproveDispensation(ex)}>
                      Approve Under Dispensation
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal: Request Explanation from Institution */}
      <Modal
        open={inquiryModalOpen}
        onClose={() => setInquiryModalOpen(false)}
        title="Request Explanation from Institution"
      >
        {selectedEx && (
          <div>
            <div style={{ background: "#f8fafc", padding: "0.875rem", borderRadius: "0.375rem", marginBottom: "1rem" }}>
              <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "#1e293b" }}>{selectedEx.institution}</div>
              <div style={{ fontSize: "0.8125rem", color: "#64748b" }}>
                {selectedEx.programme} ({selectedEx.academic_year})
              </div>
              <div style={{ marginTop: "0.5rem", fontSize: "0.8125rem", display: "flex", gap: "1rem" }}>
                <span>Approved: <strong>{selectedEx.approved_intake}</strong></span>
                <span>Enrolled: <strong>{selectedEx.enrolled ?? selectedEx.supernumerary_enrolled}</strong></span>
                <span style={{ color: "#dc2626" }}>Excess: <strong>+{selectedEx.excess}</strong></span>
              </div>
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.375rem" }}>
                AICTE Official Inquiry Question / Clarification Request *
              </label>
              <textarea
                rows={4}
                value={inquiryText}
                onChange={e => setInquiryText(e.target.value)}
                placeholder="Enter specific question, governing body sanction inquiry, or instructions..."
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  borderRadius: "0.375rem",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.875rem",
                  fontFamily: "inherit"
                }}
              />
            </div>

            <div style={{ marginBottom: "1.25rem" }}>
              <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.375rem" }}>
                Institutional Response Deadline
              </label>
              <input
                type="date"
                value={deadline}
                onChange={e => setDeadline(e.target.value)}
                style={{
                  padding: "0.5rem",
                  borderRadius: "0.375rem",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.875rem"
                }}
              />
              <span style={{ display: "block", fontSize: "0.75rem", color: "#64748b", marginTop: "0.25rem" }}>
                The institution will see this deadline prominently in their inbox.
              </span>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
              <Button variant="secondary" onClick={() => setInquiryModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSendInquiry} disabled={!inquiryText.trim()}>
                <Send size={14} style={{ marginRight: "0.375rem" }} /> Send Request to Institution Inbox
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal: Reject Excess Records */}
      <Modal
        open={rejectModalOpen}
        onClose={() => setRejectModalOpen(false)}
        title="Reject Excess Intake Enrolments"
      >
        {selectedEx && (
          <div>
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", padding: "0.875rem", borderRadius: "0.375rem", marginBottom: "1rem" }}>
              <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "#991b1b" }}>
                Rejecting Intake Exception: {selectedEx.programme}
              </div>
              <div style={{ fontSize: "0.8125rem", color: "#b91c1c", marginTop: "0.25rem" }}>
                Institution: {selectedEx.institution} (+{selectedEx.excess} excess enrolments)
              </div>
            </div>

            <div style={{ marginBottom: "1.25rem" }}>
              <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.375rem" }}>
                Rejection Reason &amp; Corrective Instruction *
              </label>
              <textarea
                rows={4}
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                placeholder="State the regulatory grounds for rejection and mandated remedial actions..."
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  borderRadius: "0.375rem",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.875rem",
                  fontFamily: "inherit"
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
              <Button variant="secondary" onClick={() => setRejectModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleConfirmReject} disabled={!rejectionReason.trim()}>
                <XCircle size={14} style={{ marginRight: "0.375rem" }} /> Confirm Rejection &amp; Notify Institution
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
