import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import Spinner from "../../components/ui/Spinner";
import EmptyState from "../../components/ui/EmptyState";
import Pagination from "../../components/ui/Pagination";
import Badge from "../../components/ui/Badge";
import { formatDateTime } from "../../lib/utils";
import { useAuth } from "../../contexts/AuthContext";
import { demoStore } from "../../services/demoStore";

const PAGE_SIZE = 25;
const DEMO_AUDIT = [
  { id: "a1", actor_email: "aicte.admin@demo.gov.in", actor_role: "aicte_admin", action: "BATCH_APPROVED", entity_type: "submission_batches", entity_id: "b2", created_at: "2024-08-20T11:00:00Z" },
  { id: "a2", actor_email: "inst.admin@demo.edu.in", actor_role: "institution_admin", action: "BATCH_SUBMITTED", entity_type: "submission_batches", entity_id: "b1", created_at: "2024-08-15T10:30:00Z" },
  { id: "a3", actor_email: "aicte.admin@demo.gov.in", actor_role: "aicte_admin", action: "INSTITUTION_CREATED", entity_type: "institutions", entity_id: "1", created_at: "2024-01-15T09:00:00Z" },
  { id: "a4", actor_email: "inst.admin@demo.edu.in", actor_role: "institution_admin", action: "CSV_UPLOADED", entity_type: "submission_batches", entity_id: "b1", created_at: "2024-08-14T09:00:00Z" },
  { id: "a5", actor_email: "aicte.admin@demo.gov.in", actor_role: "aicte_admin", action: "DUPLICATE_REVIEWED", entity_type: "duplicate_review_cases", entity_id: "d3", created_at: "2024-09-05T09:00:00Z" },
  { id: "a6", actor_email: "aicte.admin@demo.gov.in", actor_role: "aicte_admin", action: "BATCH_RETURNED", entity_type: "submission_batches", entity_id: "b3", created_at: "2024-09-05T15:00:00Z" },
];

export default function AuditLogPage() {
  const { isDemoMode } = useAuth();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      if (isDemoMode) {
        setLogs(demoStore.getAuditLogs());
        setLoading(false);
        return;
      }
      const { data, error } = await supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(200);
      if (error || !data?.length) { setLogs(DEMO_AUDIT); } else { setLogs(data); }
      setLoading(false);
    };
    load();
  }, [isDemoMode]);

  const filtered = logs.filter(l =>
    (l.actor_email ?? "").includes(search) ||
    (l.action ?? "").includes(search.toUpperCase()) ||
    (l.entity_type ?? "").includes(search)
  );
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Audit Log</h1>
        <p className="page-subtitle">Immutable record of all significant system actions</p>
      </div>
      <div className="alert alert-info" style={{ marginBottom: "1.25rem" }}>
        Audit log entries cannot be modified or deleted by regular users. This log is for accountability and compliance purposes.
      </div>

      <div className="card">
        <div className="card-header">
          <div className="search-input-wrap" style={{ width: 300 }}>
            <input className="form-input" style={{ paddingLeft: "2.25rem" }} placeholder="Filter by email, action, entity…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
          </div>
        </div>
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}><Spinner size={32} /></div>
        ) : paged.length === 0 ? (
          <EmptyState title="No audit logs found" />
        ) : (
          <>
            <div className="table-wrapper" style={{ border: "none", borderRadius: 0 }}>
              <table className="data-table">
                <thead>
                  <tr><th>Timestamp</th><th>Actor</th><th>Role</th><th>Action</th><th>Entity</th><th>Entity ID</th></tr>
                </thead>
                <tbody>
                  {paged.map((l: any) => (
                    <tr key={l.id}>
                      <td style={{ fontFamily: "monospace", fontSize: "0.8125rem", color: "var(--color-neutral-500)" }}>{formatDateTime(l.created_at)}</td>
                      <td style={{ fontSize: "0.875rem" }}>{l.actor_email ?? "System"}</td>
                      <td><Badge variant={l.actor_role === "aicte_admin" ? "blue" : "gray"}>{(l.actor_role ?? "system").replace(/_/g, " ")}</Badge></td>
                      <td><code style={{ fontSize: "0.8125rem", background: "var(--color-neutral-100)", padding: "0.125rem 0.375rem", borderRadius: "0.25rem" }}>{l.action}</code></td>
                      <td style={{ color: "var(--color-neutral-500)", fontSize: "0.875rem" }}>{l.entity_type}</td>
                      <td><code style={{ fontSize: "0.75rem", color: "var(--color-neutral-400)" }}>{l.entity_id?.slice(0, 8) ?? "—"}</code></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} totalPages={Math.ceil(filtered.length / PAGE_SIZE)} onPageChange={setPage} totalItems={filtered.length} pageSize={PAGE_SIZE} />
          </>
        )}
      </div>
    </div>
  );
}
