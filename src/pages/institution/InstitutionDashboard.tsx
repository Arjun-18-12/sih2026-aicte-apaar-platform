import React, { useEffect, useState, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Users, BookOpen, FileCheck, AlertCircle, CheckCircle, Clock, Inbox } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { demoStore, DEMO_INSTITUTION_ID } from "../../services/demoStore";

function StatCard({ label, value, icon: Icon, color, sub }: { label: string; value: string | number; icon: React.ElementType; color: string; sub?: string }) {
  return (
    <div className="stat-card" style={{ display: "flex", alignItems: "flex-start", gap: "1rem" }}>
      <div style={{ width: 44, height: 44, borderRadius: "0.75rem", background: color + "18", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={22} style={{ color }} />
      </div>
      <div>
        <div style={{ fontSize: "1.625rem", fontWeight: 800, color: "var(--color-neutral-900)", lineHeight: 1 }}>{typeof value === "number" ? value.toLocaleString("en-IN") : value}</div>
        <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-500)", marginTop: "0.25rem" }}>{label}</div>
        {sub && <div style={{ fontSize: "0.75rem", color: "var(--color-neutral-400)", marginTop: "0.125rem" }}>{sub}</div>}
      </div>
    </div>
  );
}

export default function InstitutionDashboard() {
  const { user, isDemoMode, switchDemoInstitution } = useAuth();
  const institutionId = user?.profile?.institution_id || (isDemoMode ? DEMO_INSTITUTION_ID : undefined);
  const [institutionName, setInstitutionName] = useState("Your Institution");
  const [enrolmentCount, setEnrolmentCount] = useState(0);
  const [submissionCount, setSubmissionCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [approvedCount, setApprovedCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [correctionCount, setCorrectionCount] = useState(0);
  const [programmeCount, setProgrammeCount] = useState(0);
  const [programmeData, setProgrammeData] = useState<{ name: string; approved: number; enrolled: number }[]>([]);

  const loadData = useCallback(async () => {
    if (!institutionId) return;

    if (isDemoMode) {
      // 1. Fetch institution details from demoStore
      const inst = demoStore.getInstitution(institutionId);
      setInstitutionName(inst?.name || "Shri Ram Institute of Technology (DEMO)");

      // 2. Fetch enrolments and batches from demoStore
      const instEnrolments = demoStore.getEnrolments(institutionId);
      const instBatches = demoStore.getBatches(institutionId);

      setEnrolmentCount(instEnrolments.length);
      setSubmissionCount(instBatches.length);
      setPendingCount(instBatches.filter(b => b.status === "submitted" || b.status === "under_review").length);
      setApprovedCount(instBatches.filter(b => b.status === "approved").length);
      setErrorCount(instBatches.reduce((sum, b) => sum + (b.error_records || 0), 0));
      const crStats = demoStore.getCorrectionRequestStats(institutionId);
      setCorrectionCount(crStats.awaiting_institution);

      // 3. Programmes and chart data from demoStore
      const instProgs = demoStore.getProgrammes(institutionId);
      setProgrammeCount(instProgs.length);

      const chartRows = instProgs.map((p: any) => {
        const intake = p.approved_intakes?.find(i => i.academic_year === "2024-25" && i.status === "active")
          ?? p.approved_intakes?.[0];
        const enrolled = instEnrolments.filter(e => e.programme_id === p.id && e.enrolment_status === "active").length;
        const displayName = p.code.replace("BTECH-", "B.Tech ");
        return {
          name: displayName,
          approved: intake?.approved_intake ?? 0,
          enrolled,
        };
      });
      setProgrammeData(chartRows);
      return;
    }

    // Supabase mode (production / non-demo)
    try {
      const [instRes, enrolRes, batchRes, pendingRes, approvedRes, progsRes] = await Promise.all([
        supabase.from("institutions").select("name").eq("id", institutionId).single(),
        supabase.from("enrolments").select("id", { count: "exact", head: true }).eq("institution_id", institutionId),
        supabase.from("submission_batches").select("id, error_records", { count: "exact" }).eq("institution_id", institutionId),
        supabase.from("submission_batches").select("id", { count: "exact", head: true }).eq("institution_id", institutionId).in("status", ["submitted", "under_review"]),
        supabase.from("submission_batches").select("id", { count: "exact", head: true }).eq("institution_id", institutionId).eq("status", "approved"),
        supabase.from("programmes").select("id, code, name, approved_intakes(*)").eq("institution_id", institutionId),
      ]);

      if (!instRes.error && instRes.data) setInstitutionName(instRes.data.name);
      if (!enrolRes.error) setEnrolmentCount(enrolRes.count ?? 0);
      if (!batchRes.error) {
        setSubmissionCount(batchRes.count ?? 0);
        const totalErrors = (batchRes.data ?? []).reduce((sum: number, b: any) => sum + (b.error_records || 0), 0);
        setErrorCount(totalErrors);
      }
      if (!pendingRes.error) setPendingCount(pendingRes.count ?? 0);
      if (!approvedRes.error) setApprovedCount(approvedRes.count ?? 0);
      if (!progsRes.error && progsRes.data) {
        setProgrammeCount(progsRes.data.length);
        const chartRows = progsRes.data.map((p: any) => {
          const ai = (p.approved_intakes as any[])?.find((i: any) => i.academic_year === "2024-25" && i.status === "active");
          return {
            name: p.code?.replace("BTECH-", "B.Tech ") || p.name,
            approved: ai?.approved_intake ?? 0,
            enrolled: 0,
          };
        });
        setProgrammeData(chartRows);
      }
    } catch (err) {
      console.warn("Failed to load institution dashboard data from Supabase:", err);
    }
  }, [institutionId, isDemoMode]);

  useEffect(() => {
    loadData();
    const handleFocus = () => loadData();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [loadData]);

  const allInstitutions = isDemoMode ? demoStore.getInstitutions() : [];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Institution Dashboard</h1>
        <p className="page-subtitle">{institutionName} — Academic Year 2024-25</p>
      </div>

      {isDemoMode && switchDemoInstitution && allInstitutions.length > 0 && (
        <div
          id="institution-demo-selector-banner"
          style={{
            marginBottom: "1.25rem",
            padding: "0.75rem 1rem",
            background: "#ecfdf5",
            border: "1px solid #a7f3d0",
            borderRadius: "0.5rem",
            fontSize: "0.8125rem",
            color: "#065f46",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "0.75rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#059669" }} />
            <span>Institutional Workspace • Scoped View</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <label htmlFor="inst-demo-switch-select" style={{ fontSize: "0.75rem", fontWeight: 600 }}>Switch Institution:</label>
            <select
              id="inst-demo-switch-select"
              className="form-input"
              style={{ fontSize: "0.8125rem", padding: "0.2rem 0.5rem", height: 32, width: 280 }}
              value={institutionId}
              onChange={e => switchDemoInstitution(e.target.value)}
            >
              {allInstitutions.map(inst => (
                <option key={inst.id} value={inst.id}>
                  {inst.name} ({inst.city}, {inst.state})
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      
      {correctionCount > 0 && (
        <div
          style={{
            marginBottom: "1.25rem",
            padding: "0.75rem 1rem",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "0.5rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.5rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#991b1b", fontSize: "0.875rem", fontWeight: 600 }}>
            <AlertCircle size={18} />
            <span>You have {correctionCount} student correction request(s) awaiting your institution's response.</span>
          </div>
          <Link to="/institution/corrections" className="btn btn-sm btn-primary" style={{ textDecoration: "none" }}>
            Open Correction Inbox
          </Link>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "1.75rem" }}>
        <StatCard label="Total Enrolments" value={enrolmentCount} icon={Users} color="var(--color-primary-600)" />
        <StatCard label="Total Submissions" value={submissionCount} icon={FileCheck} color="#7c3aed" />
        <StatCard label="Pending AICTE Review" value={pendingCount} icon={Clock} color="var(--color-warning-600)" />
        <Link to="/institution/corrections" style={{ textDecoration: "none" }}>
          <StatCard
            label="Correction Requests"
            value={correctionCount}
            icon={Inbox}
            color={correctionCount > 0 ? "var(--color-danger-600)" : "var(--color-neutral-600)"}
            sub={correctionCount > 0 ? "Action Required" : "Inbox Clear"}
          />
        </Link>
        <StatCard label="Approved Batches" value={approvedCount} icon={CheckCircle} color="var(--color-success-600)" />
        <StatCard label="Validation Errors" value={errorCount} icon={AlertCircle} color="var(--color-danger-600)" sub={errorCount > 0 ? "Require Correction" : undefined} />
        <StatCard label="Programmes" value={programmeCount} icon={BookOpen} color="#0891b2" />
      </div>

      <div className="card">
        <div className="card-header">
          <h2 style={{ fontWeight: 600, fontSize: "0.9375rem", color: "var(--color-neutral-800)" }}>
            Programme-wise Enrolment vs Approved Intake
          </h2>
        </div>
        <div className="card-body" style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={programmeData} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-neutral-100)" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="approved" fill="var(--color-neutral-200)" name="Approved Intake" radius={[2, 2, 0, 0]} />
              <Bar dataKey="enrolled" fill="var(--color-primary-500)" name="Enrolled" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
