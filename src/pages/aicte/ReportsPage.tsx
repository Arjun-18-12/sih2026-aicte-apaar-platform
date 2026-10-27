import React, { useState } from "react";
import { Download, BarChart3, Users, Building2, ShieldCheck } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import { downloadCSV, objectsToCSV } from "../../lib/utils";
import { useAuth } from "../../contexts/AuthContext";
import { demoStore } from "../../services/demoStore";

const DEMO_INST_ENROLMENTS = [
  { institution: "SRIT Mumbai", programme: "B.Tech CS", approved_intake: 120, enrolled: 112, supernumerary: 5, nri: 2, oci: 1, fn: 0 },
  { institution: "SRIT Mumbai", programme: "MBA", approved_intake: 60, enrolled: 58, supernumerary: 2, nri: 1, oci: 0, fn: 0 },
  { institution: "NTU Delhi", programme: "B.Tech CS", approved_intake: 240, enrolled: 238, supernumerary: 10, nri: 5, oci: 2, fn: 1 },
  { institution: "IBM Bangalore", programme: "MBA", approved_intake: 60, enrolled: 55, supernumerary: 3, nri: 1, oci: 1, fn: 0 },
  { institution: "REC Chennai", programme: "B.Tech EC", approved_intake: 60, enrolled: 47, supernumerary: 0, nri: 0, oci: 0, fn: 0 },
];

const PIE_DATA = [
  { name: "Approved", value: 3845, color: "#22c55e" },
  { name: "Pending", value: 289, color: "#f59e0b" },
  { name: "Rejected", value: 34, color: "#ef4444" },
  { name: "Draft", value: 112, color: "#94a3b8" },
];

export default function ReportsPage() {
  const { isDemoMode } = useAuth();
  const [activeReport, setActiveReport] = useState("enrolment");

  const reportsData = isDemoMode ? demoStore.getReportsData() : { instEnrolments: DEMO_INST_ENROLMENTS, pieData: PIE_DATA };
  const currentInstEnrolments = reportsData.instEnrolments;
  const currentPieData = reportsData.pieData;

  const exportReport = () => {
    downloadCSV(objectsToCSV(currentInstEnrolments), `aicte_enrolment_report_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">Reports & Analytics</h1>
          <p className="page-subtitle">Institution-wise and programme-wise enrolment analysis</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <Button icon={<Download size={16} />} onClick={exportReport} variant="secondary">Export CSV</Button>
        </div>
      </div>

      <div className="tabs-list" style={{ marginBottom: "1.5rem" }}>
        {[
          { key: "enrolment", label: "Enrolment Summary" },
          { key: "apaar", label: "APAAR Coverage" },
          { key: "submissions", label: "Submission Status" },
        ].map(t => (
          <button key={t.key} className={`tab-btn ${activeReport === t.key ? "active" : ""}`} onClick={() => setActiveReport(t.key)}>{t.label}</button>
        ))}
      </div>

      {activeReport === "enrolment" && (
        <div>
          <div className="card" style={{ marginBottom: "1.25rem" }}>
            <div className="card-header"><h2 style={{ fontWeight: 600, fontSize: "0.9375rem" }}>Institution & Programme Enrolment vs Approved Intake</h2></div>
            <div className="card-body" style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={currentInstEnrolments}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-neutral-100)" />
                  <XAxis dataKey="programme" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="approved_intake" fill="var(--color-neutral-200)" name="Approved" radius={[2,2,0,0]} />
                  <Bar dataKey="enrolled" fill="var(--color-primary-500)" name="Enrolled" radius={[2,2,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><h2 style={{ fontWeight: 600, fontSize: "0.9375rem" }}>Detailed Enrolment Table</h2></div>
            <div className="table-wrapper" style={{ border: "none", borderRadius: 0 }}>
              <table className="data-table">
                <thead>
                  <tr><th>Institution</th><th>Programme</th><th>Approved</th><th>Enrolled</th><th>Supernumerary</th><th>NRI</th><th>OCI</th><th>FN</th><th>Utilization</th></tr>
                </thead>
                <tbody>
                  {currentInstEnrolments.map((r, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 500 }}>{r.institution}</td>
                      <td>{r.programme}</td>
                      <td>{r.approved_intake}</td>
                      <td style={{ fontWeight: 600 }}>{r.enrolled}</td>
                      <td>{r.supernumerary}</td>
                      <td>{r.nri}</td>
                      <td>{r.oci}</td>
                      <td>{r.fn}</td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <div style={{ flex: 1, height: 6, background: "var(--color-neutral-100)", borderRadius: 9999 }}>
                            <div style={{ width: `${Math.min(100, Math.round(r.enrolled / r.approved_intake * 100))}%`, height: "100%", background: r.enrolled / r.approved_intake > 1 ? "var(--color-danger-500)" : "var(--color-primary-500)", borderRadius: 9999 }} />
                          </div>
                          <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-neutral-700)" }}>{Math.round(r.enrolled / r.approved_intake * 100)}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeReport === "apaar" && (
        <div className="card">
          <div className="card-header"><h2 style={{ fontWeight: 600, fontSize: "0.9375rem" }}>APAAR Verification Coverage</h2></div>
          <div className="card-body" style={{ display: "flex", alignItems: "center", gap: "2rem" }}>
            <div style={{ width: 280, height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={[{name:"Verified",value:3512,color:"#22c55e"},{name:"Pending",value:398,color:"#f59e0b"},{name:"Invalid",value:102,color:"#ef4444"},{name:"Not Provided",value:268,color:"#94a3b8"}]} cx="50%" cy="50%" innerRadius={70} outerRadius={110} paddingAngle={3} dataKey="value">
                    {[{color:"#22c55e"},{color:"#f59e0b"},{color:"#ef4444"},{color:"#94a3b8"}].map((c, i) => <Cell key={i} fill={c.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div>
              {[{label:"APAAR Verified",value:3512,color:"var(--color-success-600)"},{label:"Pending Verification",value:398,color:"var(--color-warning-600)"},{label:"Invalid APAAR ID",value:102,color:"var(--color-danger-600)"},{label:"APAAR Not Provided",value:268,color:"var(--color-neutral-500)"}].map(item => (
                <div key={item.label} style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
                  <div style={{ width: 12, height: 12, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
                  <span style={{ fontSize: "0.9375rem", color: "var(--color-neutral-700)" }}>{item.label}</span>
                  <span style={{ fontWeight: 700, color: item.color, marginLeft: "auto" }}>{item.value.toLocaleString("en-IN")}</span>
                </div>
              ))}
              <div className="sim-badge" style={{ marginTop: "1rem" }}>⚠ VERIFICATION DATA IS SIMULATED</div>
            </div>
          </div>
        </div>
      )}

      {activeReport === "submissions" && (
        <div className="card">
          <div className="card-header"><h2 style={{ fontWeight: 600, fontSize: "0.9375rem" }}>Submission Status Summary</h2></div>
          <div className="card-body">
            {(isDemoMode ? currentPieData : PIE_DATA).map(item => (
              <div key={item.name} style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.75rem 0", borderBottom: "1px solid var(--color-neutral-100)" }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
                <span style={{ flex: 1, color: "var(--color-neutral-700)" }}>{item.name}</span>
                <div style={{ width: 200, height: 8, background: "var(--color-neutral-100)", borderRadius: 9999 }}>
                  <div style={{ width: `${Math.round(item.value / 4280 * 100)}%`, height: "100%", background: item.color, borderRadius: 9999 }} />
                </div>
                <span style={{ fontWeight: 700, color: "var(--color-neutral-800)", minWidth: 60, textAlign: "right" }}>{item.value.toLocaleString("en-IN")}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
