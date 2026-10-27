import React, { useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Upload,
  CheckCircle,
  Download,
  ArrowRight,
  FileText,
  Clock,
  Layers,
} from "lucide-react";
import Papa from "papaparse";
import { validateCSVHeaders, parseCSVToRows } from "../../services/validationEngine";
import { createSubmissionBatch, submitEnrolmentBatch, formatCSVRowToRpcInput } from "../../services/enrolmentService";
import { demoStore, DEMO_INSTITUTION_ID } from "../../services/demoStore";
import { useAuth } from "../../contexts/AuthContext";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import Alert from "../../components/ui/Alert";
import Spinner from "../../components/ui/Spinner";
import { downloadCSV } from "../../lib/utils";

type Step = "upload" | "submitting" | "done";

const CSV_TEMPLATE_HEADERS = [
  "institution_student_id",
  "full_name",
  "apaar_id",
  "date_of_birth",
  "gender",
  "programme_code",
  "academic_year",
  "admission_date",
  "admission_category",
  "is_nri",
  "is_oci",
  "is_foreign_national",
  "supernumerary_classification",
  "remarks",
];

export default function CSVUploadPage() {
  const { user, isDemoMode } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [academicYear, setAcademicYear] = useState("2024-25");
  const [error, setError] = useState("");
  const [submissionOutcome, setSubmissionOutcome] = useState<{
    batchId: string;
    totalRecords: number;
    academicYear: string;
  } | null>(null);

  const loadSample = async (samplePath: string, fileName: string) => {
    try {
      setError("");
      const res = await fetch(samplePath);
      if (!res.ok) throw new Error(`Failed to fetch ${fileName}`);
      const text = await res.text();
      const blob = new Blob([text], { type: "text/csv" });
      const sampleFile = new File([blob], fileName, { type: "text/csv" });
      setFile(sampleFile);
    } catch (e: any) {
      setError("Unable to load sample CSV: " + (e?.message || "File could not be fetched"));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setError("");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && (f.name.endsWith(".csv") || f.name.endsWith(".xlsx"))) {
      setFile(f);
      setError("");
    } else {
      setError("Please upload a .csv file.");
    }
  };

  const downloadTemplate = () => {
    downloadCSV(CSV_TEMPLATE_HEADERS.join(",") + "\n", "aicte_enrolment_template.csv");
  };

  const handleUploadAndSubmit = () => {
    if (!file) return;
    setError("");
    setStep("submitting");

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (parsed) => {
        const rawRows = parsed.data as Record<string, string>[];
        const headers = parsed.meta.fields ?? [];

        // Header format validation only (columns presence)
        const { valid: headersValid, missing } = validateCSVHeaders(headers);
        if (!headersValid) {
          setError(`CSV is missing required columns: ${missing.join(", ")}`);
          setStep("upload");
          return;
        }

        if (rawRows.length === 0) {
          setError("The uploaded CSV file contains no student data rows.");
          setStep("upload");
          return;
        }

        const institutionId = user?.profile?.institution_id || DEMO_INSTITUTION_ID;
        const rows = parseCSVToRows(rawRows);
        const rpcRows = rows.map((r) => formatCSVRowToRpcInput(r));

        try {
          let batchId: string | null = null;
          let submitErr: string | null = null;

          if (isDemoMode) {
            const draftRes = demoStore.createDraftBatch(academicYear, rpcRows.length, institutionId);
            if (draftRes.error || !draftRes.batchId) {
              throw new Error(draftRes.error || "Unable to provision submission batch.");
            }
            batchId = draftRes.batchId;

            const submitRes = demoStore.submitBatch(batchId, institutionId, academicYear, rpcRows);
            if (submitRes.error) {
              submitErr = submitRes.error;
            }
          } else {
            const draftRes = await createSubmissionBatch(academicYear, rpcRows.length);
            if (draftRes.error || !draftRes.batchId) {
              throw new Error(draftRes.error || "Unable to provision submission batch.");
            }
            batchId = draftRes.batchId;

            const submitRes = await submitEnrolmentBatch(batchId, rpcRows);
            if (submitRes.error) {
              submitErr = submitRes.error;
            }
          }

          if (submitErr) {
            setError(submitErr);
            setStep("upload");
            return;
          }

          setSubmissionOutcome({
            batchId: batchId!,
            totalRecords: rpcRows.length,
            academicYear,
          });
          setStep("done");
        } catch (e: any) {
          setError(e?.message || "An unexpected error occurred during batch submission.");
          setStep("upload");
        }
      },
      error: (err) => {
        setError("Failed to parse CSV file: " + err.message);
        setStep("upload");
      },
    });
  };

  const handleReset = () => {
    setFile(null);
    setError("");
    setSubmissionOutcome(null);
    setStep("upload");
  };

  if (step === "submitting") {
    return (
      <div className="card">
        <div className="card-body" style={{ textAlign: "center", padding: "4rem 2rem" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "1.5rem" }}>
            <Spinner size={48} />
          </div>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--color-neutral-900)", marginBottom: "0.5rem" }}>
            Uploading &amp; Submitting Batch to AICTE...
          </h2>
          <p style={{ color: "var(--color-neutral-500)", fontSize: "0.875rem", maxWidth: 500, margin: "0 auto" }}>
            Transmitting student data records to the AICTE central repository for administrative review and verification.
          </p>
        </div>
      </div>
    );
  }

  if (step === "done" && submissionOutcome) {
    return (
      <div>
        <h1 className="page-title" style={{ marginBottom: "1.5rem" }}>
          Submission Confirmation
        </h1>

        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <div
            className="card"
            style={{
              padding: "2.5rem",
              textAlign: "center",
              marginBottom: "1.5rem",
              borderTop: "4px solid var(--color-primary-500)",
            }}
          >
            <CheckCircle size={56} style={{ color: "var(--color-primary-600)", margin: "0 auto 1rem" }} />

            <h2 style={{ fontSize: "1.375rem", fontWeight: 700, color: "var(--color-neutral-900)", marginBottom: "0.5rem" }}>
              Batch Successfully Submitted for AICTE Review
            </h2>

            <p style={{ color: "var(--color-neutral-600)", marginBottom: "1.75rem", fontSize: "0.9375rem" }}>
              Batch ID: <code>{submissionOutcome.batchId}</code> • Academic Year: <strong>{submissionOutcome.academicYear}</strong>
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "1rem",
                marginBottom: "2rem",
              }}
            >
              <div className="stat-card" style={{ textAlign: "center", padding: "1.25rem" }}>
                <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--color-primary-700)" }}>
                  {submissionOutcome.totalRecords}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--color-neutral-500)", textTransform: "uppercase", marginTop: "0.25rem" }}>
                  Records Submitted
                </div>
              </div>

              <div className="stat-card" style={{ textAlign: "center", padding: "1.25rem" }}>
                <div style={{ marginTop: "0.375rem" }}>
                  <Badge variant="blue">Submitted (Pending AICTE Review)</Badge>
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--color-neutral-500)", textTransform: "uppercase", marginTop: "0.5rem" }}>
                  Submission Status
                </div>
              </div>
            </div>

            <div style={{ textAlign: "left", marginBottom: "1.5rem" }}><Alert variant="info">
              <div>
                <strong>Central Review Workflow:</strong> All student-record validation, APAAR verification, duplicate
                detection against previous approved submissions, and approved intake compliance will be evaluated by
                AICTE administrators during batch review.
              </div>
            </Alert></div>

            <div style={{ display: "flex", justifyContent: "center", gap: "1rem" }}>
              <Button icon={<ArrowRight size={16} />} onClick={() => navigate("/institution/submissions")}>
                View in My Submissions
              </Button>
              <Button variant="secondary" onClick={handleReset}>
                Upload Another File
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">Student Enrolment Upload</h1>
          <p className="page-subtitle">Upload student enrolment data files for AICTE review and verification</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="btn btn-secondary btn-sm" onClick={downloadTemplate}>
            <Download size={15} /> Download Template (.csv)
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          {error && (
            <Alert variant="error" className="mb-4">
              {error}
            </Alert>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "1rem",
              marginBottom: "1.5rem",
            }}
          >
            <div>
              <label className="form-label">Academic Year</label>
              <select className="form-select" value={academicYear} onChange={(e) => setAcademicYear(e.target.value)}>
                <option value="2024-25">2024-25 (Current)</option>
                <option value="2023-24">2023-24</option>
                <option value="2025-26">2025-26</option>
              </select>
            </div>
          </div>

          {/* Drop Zone */}
          <div
            className={`dropzone ${file ? "has-file" : ""}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            style={{
              border: "2px dashed var(--color-neutral-300)",
              borderRadius: "0.75rem",
              padding: "3rem 2rem",
              textAlign: "center",
              cursor: "pointer",
              background: "var(--color-neutral-50)",
              transition: "all 0.2s",
            }}
          >
            <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleFileSelect} />
            <Upload size={40} style={{ color: "var(--color-primary-400)", margin: "0 auto 1rem" }} />
            {file ? (
              <>
                <p style={{ fontWeight: 600, color: "var(--color-primary-700)" }}>Selected: {file.name}</p>
                <p style={{ fontSize: "0.875rem", color: "var(--color-neutral-500)", marginTop: "0.25rem" }}>
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              </>
            ) : (
              <>
                <p style={{ fontWeight: 600, color: "var(--color-neutral-700)" }}>
                  Drag &amp; drop a CSV file, or click to browse
                </p>
                <p style={{ fontSize: "0.875rem", color: "var(--color-neutral-400)", marginTop: "0.5rem" }}>
                  Supported format: .csv (max 10MB). Download template to review required columns.
                </p>
              </>
            )}
          </div>

          {/* Quick-Samples */}
          <div
            style={{
              marginTop: "1.25rem",
              padding: "1rem",
              background: "var(--color-neutral-50)",
              border: "1px solid var(--color-neutral-200)",
              borderRadius: "0.5rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.625rem" }}>
              <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--color-primary-900)" }}>
                Evaluation Quick-Samples
              </span>
              <span style={{ fontSize: "0.6875rem", color: "var(--color-neutral-500)" }}>
                Click to select sample file for upload
              </span>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button
                type="button"
                id="sample-btn-valid"
                className="btn btn-outline btn-sm"
                onClick={() => loadSample("/samples/valid_enrolments_sample.csv", "valid_enrolments_sample.csv")}
              >
                Valid Enrolments (5 rows)
              </button>
              <button
                type="button"
                id="sample-btn-supernumerary"
                className="btn btn-outline btn-sm"
                onClick={() => loadSample("/samples/supernumerary_sample.csv", "supernumerary_sample.csv")}
              >
                Supernumerary Quotas (3 rows)
              </button>
              <button
                type="button"
                id="sample-btn-errors"
                className="btn btn-outline btn-sm"
                onClick={() => loadSample("/samples/duplicates_and_format_errors_sample.csv", "duplicates_and_format_errors_sample.csv")}
              >
                Errors &amp; Duplicates (5 rows)
              </button>
            </div>
          </div>

          <div style={{ marginTop: "1.25rem" }}>
            <Alert variant="info">
              <div>
                <strong>Institution Upload Architecture:</strong> Student data files are uploaded directly to AICTE.
                All validations, including APAAR verification, duplicate detection against previous approved submissions,
                and approved intake quota checks, are conducted centrally by AICTE administrators upon batch review.
              </div>
            </Alert>
          </div>
        </div>
        <div className="card-footer" style={{ justifyContent: "flex-end", display: "flex" }}>
          <Button onClick={handleUploadAndSubmit} disabled={!file} icon={<Upload size={16} />}>
            Upload &amp; Submit Batch
          </Button>
        </div>
      </div>
    </div>
  );
}
