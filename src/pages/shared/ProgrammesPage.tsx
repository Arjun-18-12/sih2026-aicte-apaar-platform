import React, { useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { demoStore, DEMO_INSTITUTION_ID } from "../../services/demoStore";
import Badge from "../../components/ui/Badge";
import Spinner from "../../components/ui/Spinner";
import EmptyState from "../../components/ui/EmptyState";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";

const DEMO_PROGRAMMES = [
  { id: "p1", name: "B.Tech Computer Science", code: "BTECH-CS", level: "UG", duration_years: 4, programme_status: "approved", approved_intake: [{ academic_year: "2024-25", approved_intake: 120, total_supernumerary: 12 }] },
  { id: "p2", name: "B.Tech Electronics & Communication", code: "BTECH-EC", level: "UG", duration_years: 4, programme_status: "approved", approved_intake: [{ academic_year: "2024-25", approved_intake: 60, total_supernumerary: 6 }] },
  { id: "p3", name: "Master of Business Administration", code: "MBA", level: "PG", duration_years: 2, programme_status: "approved", approved_intake: [{ academic_year: "2024-25", approved_intake: 60, total_supernumerary: 6 }] },
  { id: "p4", name: "Master of Computer Applications", code: "MCA", level: "PG", duration_years: 3, programme_status: "approved", approved_intake: [{ academic_year: "2024-25", approved_intake: 60, total_supernumerary: 6 }] },
];

export default function ProgrammesPage({ role }: { role: "aicte" | "institution" }) {
  const { user, isDemoMode } = useAuth();
  const [programmes, setProgrammes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      if (isDemoMode) {
        if (role === "institution") {
          setProgrammes(demoStore.getProgrammes(user?.profile?.institution_id ?? DEMO_INSTITUTION_ID));
        } else {
          setProgrammes(demoStore.getProgrammes());
        }
        setLoading(false);
        return;
      }
      let query = supabase.from("programmes").select("*, approved_intakes(*)").order("name");
      if (role === "institution" && user?.profile?.institution_id) {
        query = query.eq("institution_id", user.profile.institution_id);
      }
      const { data, error } = await query;
      if (error || !data?.length) { setProgrammes(DEMO_PROGRAMMES); } else { setProgrammes(data); }
      setLoading(false);
    };
    load();
  }, [isDemoMode, role, user]);

  const filtered = programmes.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.code.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Programmes & Approved Intake</h1>
        <p className="page-subtitle">View approved programmes and their intake allocations</p>
      </div>
      <div className="card">
        <div className="card-header">
          <div className="search-input-wrap" style={{ width: 300 }}>
            <Search size={16} />
            <input className="form-input" style={{ paddingLeft: "2.25rem" }} placeholder="Search programmes…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}><Spinner size={32} /></div>
        ) : filtered.length === 0 ? (
          <EmptyState title="No programmes found" />
        ) : (
          <div className="table-wrapper" style={{ border: "none", borderRadius: 0 }}>
            <table className="data-table">
              <thead>
                <tr><th>Code</th><th>Programme Name</th><th>Level</th><th>Duration</th><th>Approved Intake (2024-25)</th><th>Supernumerary Capacity</th><th>Status</th></tr>
              </thead>
              <tbody>
                {filtered.map((p: any) => {
                  const ai = (p.approved_intakes ?? p.approved_intake ?? [{ academic_year: "2024-25", approved_intake: "—", total_supernumerary: "—" }])[0] ?? {};
                  return (
                    <tr key={p.id}>
                      <td><code style={{ fontSize: "0.8125rem" }}>{p.code}</code></td>
                      <td style={{ fontWeight: 500 }}>{p.name}</td>
                      <td><Badge variant="blue">{p.level}</Badge></td>
                      <td>{p.duration_years} year{p.duration_years > 1 ? "s" : ""}</td>
                      <td style={{ fontWeight: 600 }}>{ai.approved_intake ?? "—"}</td>
                      <td>{ai.total_supernumerary ?? "—"}</td>
                      <td><Badge variant={p.programme_status === "approved" ? "green" : "yellow"}>{p.programme_status}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {role === "aicte" && (
        <div className="alert alert-info" style={{ marginTop: "1rem" }}>
          Approved intake limits are set by AICTE and cannot be modified by institutions. Changes require a formal approval process.
        </div>
      )}
    </div>
  );
}
