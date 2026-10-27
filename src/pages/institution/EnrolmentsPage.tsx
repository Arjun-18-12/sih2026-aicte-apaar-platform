import React, { useEffect, useState, useMemo } from "react";
import { Search } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { demoStore, DEMO_INSTITUTION_ID } from "../../services/demoStore";
import Badge from "../../components/ui/Badge";
import Spinner from "../../components/ui/Spinner";
import EmptyState from "../../components/ui/EmptyState";
import Pagination from "../../components/ui/Pagination";
import { formatDate, maskApaarId } from "../../lib/utils";
import { Enrolment } from "../../types";

const PAGE_SIZE = 20;

const statusBadge: Record<string, "green" | "blue" | "yellow" | "red" | "gray"> = {
  approved: "green",
  submitted: "blue",
  under_review: "blue",
  draft: "gray",
  validation_failed: "red",
  rejected: "red",
  returned_for_correction: "yellow",
  active: "green",
};

const apaarBadge: Record<string, "green" | "yellow" | "red" | "gray"> = {
  verified: "green",
  pending: "yellow",
  invalid: "red",
  unverified: "gray",
  unavailable: "gray",
};

export default function EnrolmentsPage() {
  const { user, isDemoMode, switchDemoInstitution } = useAuth();

  // Stable institution ID: prefer active user profile institution_id, fallback to demo session storage or default demo institution
  const institutionId =
    user?.profile?.institution_id ||
    (isDemoMode
      ? (typeof window !== "undefined" && window.sessionStorage?.getItem("aicte_synthetic_demo_inst_id")) ||
        DEMO_INSTITUTION_ID
      : undefined);

  const [institutionName, setInstitutionName] = useState("Your Institution");
  const [enrolments, setEnrolments] = useState<Enrolment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const allInstitutions = useMemo(() => {
    return isDemoMode ? demoStore.getInstitutions() : [];
  }, [isDemoMode]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);

      if (isDemoMode) {
        const activeId = institutionId || DEMO_INSTITUTION_ID;
        const inst = demoStore.getInstitution(activeId);
        if (inst && !cancelled) {
          setInstitutionName(inst.name);
        }
        const demoData = demoStore.getEnrolments(activeId);
        if (!cancelled) {
          setEnrolments(demoData || []);
          setLoading(false);
        }
        return;
      }

      // Supabase mode (production / non-demo)
      if (institutionId) {
        try {
          const [instRes, enrolRes] = await Promise.all([
            supabase.from("institutions").select("name").eq("id", institutionId).single(),
            supabase
              .from("enrolments")
              .select("*, student:students(*), programme:programmes(name, code)")
              .eq("institution_id", institutionId)
              .order("created_at", { ascending: false }),
          ]);

          if (!cancelled) {
            if (!instRes.error && instRes.data) {
              setInstitutionName(instRes.data.name);
            }
            if (!enrolRes.error && enrolRes.data) {
              setEnrolments(enrolRes.data as Enrolment[]);
              setLoading(false);
              return;
            }
          }
        } catch (err) {
          console.warn("Failed to load enrolments from Supabase:", err);
        }
      }

      if (!cancelled) {
        setEnrolments([]);
        setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [institutionId, isDemoMode]);

  const handleSwitchInstitution = (newInstId: string) => {
    if (switchDemoInstitution) {
      switchDemoInstitution(newInstId);
    }
    setSearch("");
    setPage(1);
  };

  const handleSearchChange = (val: string) => {
    setSearch(val);
    setPage(1);
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return enrolments;
    const query = search.toLowerCase().trim();
    return enrolments.filter(
      (e) =>
        (e.student?.full_name ?? "").toLowerCase().includes(query) ||
        (e.institution_student_id ?? "").toLowerCase().includes(query) ||
        (e.programme?.name ?? "").toLowerCase().includes(query) ||
        (e.programme?.code ?? "").toLowerCase().includes(query)
    );
  }, [enrolments, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">Student Enrolments</h1>
          <p className="page-subtitle">{institutionName} — All enrolment records for Academic Year 2024-25</p>
        </div>
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
            <label htmlFor="inst-demo-switch-select" style={{ fontSize: "0.75rem", fontWeight: 600 }}>
              Switch Institution:
            </label>
            <select
              id="inst-demo-switch-select"
              className="form-input"
              style={{ fontSize: "0.8125rem", padding: "0.2rem 0.5rem", height: 32, width: 280 }}
              value={institutionId}
              onChange={(e) => handleSwitchInstitution(e.target.value)}
            >
              {allInstitutions.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  {inst.name} ({inst.city}, {inst.state})
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="search-input-wrap" style={{ width: 320 }}>
            <Search size={16} />
            <input
              className="form-input"
              style={{ paddingLeft: "2.25rem" }}
              placeholder="Search by name, student ID, or programme…"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </div>
          <span style={{ fontSize: "0.875rem", color: "var(--color-neutral-500)" }}>
            {filtered.length} record{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}>
            <Spinner size={32} />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No enrolments found"
            description={
              search
                ? "No student enrolments match your search query."
                : "No student enrolments registered for this institution yet."
            }
          />
        ) : (
          <>
            <div className="table-wrapper" style={{ border: "none", borderRadius: 0 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Student ID</th>
                    <th>Name</th>
                    <th>Programme</th>
                    <th>AY</th>
                    <th>Admission Date</th>
                    <th>Category</th>
                    <th>APAAR</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((e: any) => (
                    <tr key={e.id}>
                      <td>
                        <code style={{ fontSize: "0.8125rem" }}>{e.institution_student_id}</code>
                      </td>
                      <td style={{ fontWeight: 500 }}>{e.student?.full_name ?? "—"}</td>
                      <td style={{ color: "var(--color-neutral-600)", fontSize: "0.875rem" }}>
                        {e.programme?.name ?? e.programme?.code ?? "—"}
                      </td>
                      <td>{e.academic_year}</td>
                      <td style={{ color: "var(--color-neutral-500)" }}>{formatDate(e.admission_date)}</td>
                      <td>
                        <Badge variant="gray">{e.admission_category}</Badge>
                      </td>
                      <td>
                        <Badge variant={apaarBadge[e.student?.apaar_verification_status ?? "unverified"]}>
                          {e.student?.apaar_verification_status ?? "unverified"}
                        </Badge>
                        {e.student?.apaar_id && (
                          <div style={{ fontSize: "0.75rem", color: "var(--color-neutral-400)", marginTop: "0.125rem" }}>
                            {maskApaarId(e.student.apaar_id)}
                          </div>
                        )}
                      </td>
                      <td>
                        <Badge variant={statusBadge[e.submission_status] ?? "gray"}>
                          {e.submission_status?.replace(/_/g, " ")}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filtered.length > PAGE_SIZE && (
              <Pagination
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
                totalItems={filtered.length}
                pageSize={PAGE_SIZE}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
