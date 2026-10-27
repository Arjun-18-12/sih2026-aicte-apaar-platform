import React, { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { Building2, Users, AlertTriangle, ShieldCheck, TrendingUp, Clock, CheckCircle, RotateCcw, ClipboardCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { demoStore, DEMO_INSTITUTION_ID } from "../../services/demoStore";

interface Stats {
  total_institutions: number;
  total_enrolments: number;
  approved_enrolments: number;
  pending_submissions: number;
  apaar_verified: number;
  apaar_missing: number;
  potential_duplicates: number;
  intake_exceptions: number;
}

const DEMO_STATS: Stats = {
  total_institutions: 12,
  total_enrolments: 1200,
  approved_enrolments: 697,
  pending_submissions: 11,
  apaar_verified: 942,
  apaar_missing: 150,
  potential_duplicates: 22,
  intake_exceptions: 0,
};

const DEMO_ENROLMENT_TREND = [
  { month: "May", enrolments: 45 },
  { month: "Jun", enrolments: 140 },
  { month: "Jul", enrolments: 320 },
  { month: "Aug", enrolments: 380 },
  { month: "Sep", enrolments: 215 },
  { month: "Oct", enrolments: 100 },
];

const DEMO_APAAR_PIE = [
  { name: "Verified", value: 942, color: "#22c55e" },
  { name: "Pending", value: 144, color: "#f59e0b" },
  { name: "Invalid", value: 58, color: "#ef4444" },
  { name: "Not Provided", value: 56, color: "#94a3b8" },
];

const DEMO_PROGRAMME_BARS = [
  { name: "B.Tech CS", approved: 1560, enrolled: 480 },
  { name: "B.Tech EC", approved: 720, enrolled: 240 },
  { name: "B.Tech ME", approved: 600, enrolled: 210 },
  { name: "MBA", approved: 360, enrolled: 150 },
  { name: "MCA", approved: 300, enrolled: 120 },
];

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

export default function AICTEDashboard() {
  const { isDemoMode } = useAuth();
  const [stats, setStats] = useState<Stats>(DEMO_STATS);
  const [apaarPie, setApaarPie] = useState<any[]>(DEMO_APAAR_PIE);
  const [programmeBars, setProgrammeBars] = useState<any[]>(DEMO_PROGRAMME_BARS);
  const [selectedInstId, setSelectedInstId] = useState<string>(DEMO_INSTITUTION_ID);
  const [instSummary, setInstSummary] = useState<any>(null);
  const [_loading, setLoading] = useState(true);
  const [crReviewCount, setCrReviewCount] = useState(0);

  const institutionsList = isDemoMode ? demoStore.getInstitutions() : [];

  useEffect(() => {
    async function loadStats() {
      if (isDemoMode) {
        setStats(demoStore.getDashboardStats());
        setApaarPie(demoStore.getApaarPieData());
        setProgrammeBars(demoStore.getProgrammeBarsData());
        setInstSummary(demoStore.getInstitutionSummary(selectedInstId));
        const crStats = demoStore.getCorrectionRequestStats();
        setCrReviewCount(crStats.submitted_for_review);
        setLoading(false);
        return;
      }
      try {
        const [instRes, enrolRes, batchRes, dupRes] = await Promise.all([
          supabase.from("institutions").select("id", { count: "exact", head: true }),
          supabase.from("enrolments").select("id", { count: "exact", head: true }),
          supabase.from("submission_batches").select("id", { count: "exact", head: true }).eq("status", "submitted"),
          supabase.from("duplicate_review_cases").select("id", { count: "exact", head: true }).eq("review_status", "pending"),
        ]);

        if (!instRes.error) {
          setStats(prev => ({
            ...prev,
            total_institutions: instRes.count ?? prev.total_institutions,
            total_enrolments: enrolRes.count ?? prev.total_enrolments,
            pending_submissions: batchRes.count ?? prev.pending_submissions,
            potential_duplicates: dupRes.count ?? prev.potential_duplicates,
          }));
        }
      } catch {
        // Use demo data
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, [isDemoMode, selectedInstId]);

  const handleSelectInstitution = (instId: string) => {
    setSelectedInstId(instId);
    if (isDemoMode) {
      setInstSummary(demoStore.getInstitutionSummary(instId));
    }
  };

  const handleResetStore = () => {
    if (window.confirm("Reset dataset back to canonical seed? Any newly uploaded batches will be reset.")) {
      demoStore.reset();
      setStats(demoStore.getDashboardStats());
      setApaarPie(demoStore.getApaarPieData());
      setProgrammeBars(demoStore.getProgrammeBarsData());
      setInstSummary(demoStore.getInstitutionSummary(selectedInstId));
    }
  };

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 className="page-title">AICTE Dashboard</h1>
          <p className="page-subtitle">National Enrolment Overview — Academic Year 2024-25</p>
        </div>
        {isDemoMode && (
          <button
            className="btn btn-secondary btn-sm"
            style={{ fontSize: "0.75rem", padding: "0.35rem 0.75rem", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
            onClick={handleResetStore}
            title="Reset dataset back to canonical seed"
          >
            <RotateCcw size={14} />
            Reseed Dataset
          </button>
        )}
      </div>

      

      {/* Stat Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem", marginBottom: "1.75rem" }}>
        <StatCard label="Participating Institutions" value={stats.total_institutions} icon={Building2} color="var(--color-primary-600)" />
        <StatCard label="Total Enrolments" value={stats.total_enrolments} icon={Users} color="#7c3aed" />
        <StatCard label="Approved Enrolments" value={stats.approved_enrolments} icon={CheckCircle} color="var(--color-success-600)" />
        <StatCard label="Pending Submissions" value={stats.pending_submissions} icon={Clock} color="var(--color-warning-600)" />
        <StatCard label="APAAR Verified" value={stats.apaar_verified} icon={ShieldCheck} color="var(--color-success-600)" />
        <StatCard label="APAAR Missing / Invalid" value={stats.apaar_missing} icon={AlertTriangle} color="var(--color-danger-600)" />
        <StatCard label="Potential Duplicates" value={stats.potential_duplicates} icon={AlertTriangle} color="#d97706" sub="Require Review" />
        <StatCard label="Intake Exceptions" value={stats.intake_exceptions} icon={TrendingUp} color="var(--color-danger-600)" sub="Require Review" />
      </div>

      {/* Institution Summary Card with Selector */}
      {isDemoMode && instSummary && (
        <div className="card" style={{ marginBottom: "1.5rem", padding: "1.25rem", borderLeft: "4px solid var(--color-primary-600)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.75rem" }}>
            <div>
              <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--color-primary-700)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Participating Institution Profile
              </div>
              <div style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--color-neutral-900)" }}>
                {instSummary.institutionName} <span style={{ fontSize: "0.8125rem", color: "var(--color-neutral-500)", fontWeight: 400 }}>({instSummary.aicteId})</span>
              </div>
              <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-500)" }}>
                {instSummary.city}, {instSummary.state} &bull; {instSummary.type}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                <label htmlFor="inspect-institution-select" style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", fontWeight: 600 }}>Inspect Institution:</label>
                <select
                  id="inspect-institution-select"
                  className="form-input"
                  style={{ fontSize: "0.8125rem", padding: "0.25rem 0.5rem", height: 32, width: 280 }}
                  value={selectedInstId}
                  onChange={e => handleSelectInstitution(e.target.value)}
                >
                  {institutionsList.map(inst => (
                    <option key={inst.id} value={inst.id}>
                      {inst.name} ({inst.state})
                    </option>
                  ))}
                </select>
              </div>
              <span style={{ fontSize: "0.75rem", fontWeight: 600, background: "#dcfce7", color: "#166534", padding: "0.25rem 0.5rem", borderRadius: "9999px", whiteSpace: "nowrap" }}>
                Active AICTE Approval
              </span>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem", marginTop: "0.5rem" }}>
            <div style={{ background: "var(--color-neutral-50)", padding: "0.75rem", borderRadius: "0.375rem" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--color-neutral-500)" }}>Enrolments Persisted</div>
              <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--color-neutral-900)" }}>{instSummary.totalEnrolments}</div>
              <div style={{ fontSize: "0.6875rem", color: "var(--color-neutral-400)" }}>{instSummary.verifiedCount} APAAR verified ({instSummary.verifiedPct}%)</div>
            </div>
            <div style={{ background: "var(--color-neutral-50)", padding: "0.75rem", borderRadius: "0.375rem" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--color-neutral-500)" }}>Submission Batches</div>
              <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--color-neutral-900)" }}>{instSummary.totalBatches}</div>
              <div style={{ fontSize: "0.6875rem", color: "var(--color-neutral-400)" }}>{instSummary.submittedBatches} pending &bull; {instSummary.approvedBatches} approved</div>
            </div>
            <div style={{ background: "var(--color-neutral-50)", padding: "0.75rem", borderRadius: "0.375rem" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--color-neutral-500)" }}>{instSummary.csProgrammeName || "Engineering"} Intake</div>
              <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--color-neutral-900)" }}>{instSummary.csEnrolled} / {instSummary.csApproved}</div>
              <div style={{ fontSize: "0.6875rem", color: "var(--color-neutral-400)" }}>+{instSummary.csSupernumerary} supernumerary used</div>
            </div>
            <div style={{ background: "var(--color-neutral-50)", padding: "0.75rem", borderRadius: "0.375rem" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--color-neutral-500)" }}>{instSummary.secondProgrammeName || "Management"} Intake</div>
              <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--color-neutral-900)" }}>{instSummary.secondEnrolled} / {instSummary.secondApproved}</div>
              <div style={{ fontSize: "0.6875rem", color: "var(--color-neutral-400)" }}>Approved capacity: {instSummary.secondApproved}</div>
            </div>
          </div>
        </div>
      )}

      {/* Charts Row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem", marginBottom: "1.25rem" }}>
        {/* Enrolment Trend */}
        <div className="card">
          <div className="card-header">
            <h2 style={{ fontWeight: 600, fontSize: "0.9375rem", color: "var(--color-neutral-800)" }}>Submission Trend (2024-25)</h2>
          </div>
          <div className="card-body" style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={DEMO_ENROLMENT_TREND} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-neutral-100)" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="enrolments" fill="var(--color-primary-500)" radius={[4, 4, 0, 0]} name="Enrolments" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* APAAR Coverage */}
        <div className="card">
          <div className="card-header">
            <h2 style={{ fontWeight: 600, fontSize: "0.9375rem", color: "var(--color-neutral-800)" }}>APAAR Verification Coverage</h2>
          </div>
          <div className="card-body" style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={isDemoMode ? apaarPie : DEMO_APAAR_PIE} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={3} dataKey="value">
                  {(isDemoMode ? apaarPie : DEMO_APAAR_PIE).map((entry, index) => <Cell key={index} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(v: number) => v.toLocaleString("en-IN")} />
                <Legend iconType="circle" iconSize={10} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Programme vs Intake */}
      <div className="card">
        <div className="card-header">
          <h2 style={{ fontWeight: 600, fontSize: "0.9375rem", color: "var(--color-neutral-800)" }}>Programme-wise Enrolment vs Approved Intake</h2>
        </div>
        <div className="card-body" style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={isDemoMode ? programmeBars : DEMO_PROGRAMME_BARS} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-neutral-100)" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="approved" fill="var(--color-neutral-200)" name="Approved Intake" radius={[2, 2, 0, 0]} />
              <Bar dataKey="enrolled" fill="var(--color-primary-500)" name="Actual Enrolments" radius={[2, 2, 0, 0]} />
              <Legend />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
