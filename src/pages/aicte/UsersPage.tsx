import React, { useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import { supabase } from "../../lib/supabase";
import Badge from "../../components/ui/Badge";
import Spinner from "../../components/ui/Spinner";
import EmptyState from "../../components/ui/EmptyState";
import { formatDate } from "../../lib/utils";

const DEMO_USERS = [
  { id: "u1", email: "aicte.admin@demo.gov.in", full_name: "AICTE Administrator", role: "aicte_admin", is_active: true, created_at: "2024-01-01T00:00:00Z" },
  { id: "u2", email: "inst.admin@demo.edu.in", full_name: "SRIT Institution Admin", role: "institution_admin", is_active: true, created_at: "2024-01-15T00:00:00Z", institution: { name: "Shri Ram Institute of Technology" } },
  { id: "u3", email: "ntu.admin@demo.edu.in", full_name: "NTU Admin", role: "institution_admin", is_active: true, created_at: "2024-01-20T00:00:00Z", institution: { name: "National Technical University" } },
];

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase.from("profiles").select("*, institution:institutions(name)").order("created_at");
      if (error || !data?.length) { setUsers(DEMO_USERS); } else { setUsers(data); }
      setLoading(false);
    };
    load();
  }, []);

  const filtered = users.filter(u => (u.full_name ?? "").toLowerCase().includes(search.toLowerCase()) || (u.email ?? "").includes(search));

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between" }}>
        <div>
          <h1 className="page-title">User Management</h1>
          <p className="page-subtitle">Manage AICTE and institution administrator accounts</p>
        </div>
      </div>
      <div className="alert alert-warning" style={{ marginBottom: "1.25rem" }}>
        New administrator accounts must be provisioned through Supabase Authentication. Institution admins cannot create their own AICTE-level accounts.
        To create a user: go to your Supabase Dashboard â†’ Authentication â†’ Users â†’ Invite User.
      </div>
      <div className="card">
        <div className="card-header">
          <div className="search-input-wrap" style={{ width: 300 }}>
            <Search size={16} />
            <input className="form-input" style={{ paddingLeft: "2.25rem" }} placeholder="Search users…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}><Spinner size={32} /></div>
        ) : filtered.length === 0 ? (
          <EmptyState title="No users found" />
        ) : (
          <div className="table-wrapper" style={{ border: "none", borderRadius: 0 }}>
            <table className="data-table">
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Institution</th><th>Active</th><th>Created</th></tr></thead>
              <tbody>
                {filtered.map((u: any) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 500 }}>{u.full_name}</td>
                    <td style={{ color: "var(--color-neutral-500)" }}>{u.email}</td>
                    <td><Badge variant={u.role === "aicte_admin" ? "blue" : "gray"}>{u.role?.replace(/_/g, " ")}</Badge></td>
                    <td>{u.institution?.name ?? "—"}</td>
                    <td><Badge variant={u.is_active ? "green" : "red"}>{u.is_active ? "Active" : "Inactive"}</Badge></td>
                    <td style={{ color: "var(--color-neutral-500)" }}>{formatDate(u.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
