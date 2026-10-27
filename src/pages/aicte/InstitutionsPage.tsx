import React, { useEffect, useState } from "react";
import { Plus, Search, Edit2, Eye } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { demoStore } from "../../services/demoStore";
import { Institution, InstitutionType, ApprovalStatus } from "../../types";
import Badge from "../../components/ui/Badge";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import Spinner from "../../components/ui/Spinner";
import EmptyState from "../../components/ui/EmptyState";
import Pagination from "../../components/ui/Pagination";
import { formatDate } from "../../lib/utils";

const PAGE_SIZE = 15;

const statusVariant: Record<ApprovalStatus, "green" | "red" | "yellow"> = {
  active: "green", suspended: "red", pending_approval: "yellow"
};
const typeLabels: Record<InstitutionType, string> = {
  university: "University",
  autonomous_college: "Autonomous College",
  affiliated_college: "Affiliated College",
  deemed_university: "Deemed University",
  institute_of_national_importance: "INI",
  polytechnic: "Polytechnic",
};

const DEMO_INSTITUTIONS: Institution[] = [
  { id: "1", aicte_id: "1-123456", name: "Shri Ram Institute of Technology", type: "autonomous_college", approval_status: "active", state: "Maharashtra", city: "Mumbai", created_at: "2024-01-15T00:00:00Z", updated_at: "2024-01-15T00:00:00Z" },
  { id: "2", aicte_id: "1-234567", name: "National Technical University", type: "university", approval_status: "active", state: "Delhi", city: "New Delhi", created_at: "2024-01-20T00:00:00Z", updated_at: "2024-01-20T00:00:00Z" },
  { id: "3", aicte_id: "1-345678", name: "Regional Engineering College", type: "affiliated_college", approval_status: "pending_approval", state: "Tamil Nadu", city: "Chennai", created_at: "2024-02-05T00:00:00Z", updated_at: "2024-02-05T00:00:00Z" },
  { id: "4", aicte_id: "1-456789", name: "Institute of Business Management", type: "autonomous_college", approval_status: "active", state: "Karnataka", city: "Bangalore", created_at: "2024-02-10T00:00:00Z", updated_at: "2024-02-10T00:00:00Z" },
  { id: "5", aicte_id: "1-567890", name: "Apex Polytechnic Institute", type: "polytechnic", approval_status: "suspended", state: "Gujarat", city: "Ahmedabad", created_at: "2024-03-01T00:00:00Z", updated_at: "2024-03-01T00:00:00Z" },
];

function InstitutionFormModal({ open, onClose, institution, onSaved }: { open: boolean; onClose: () => void; institution?: Institution | null; onSaved: () => void }) {
  const [form, setForm] = useState({
    aicte_id: institution?.aicte_id ?? "",
    name: institution?.name ?? "",
    type: institution?.type ?? "affiliated_college" as InstitutionType,
    approval_status: institution?.approval_status ?? "pending_approval" as ApprovalStatus,
    state: institution?.state ?? "",
    city: institution?.city ?? "",
    email: institution?.email ?? "",
    phone: institution?.phone ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!form.aicte_id || !form.name) { setError("AICTE ID and Name are required."); return; }
    setSaving(true);
    try {
      if (institution) {
        await supabase.from("institutions").update({ ...form, updated_at: new Date().toISOString() }).eq("id", institution.id);
      } else {
        await supabase.from("institutions").insert({ ...form });
      }
      onSaved();
      onClose();
    } catch (e) { setError("Failed to save institution."); }
    setSaving(false);
  };

  return (
    <Modal open={open} onClose={onClose} title={institution ? "Edit Institution" : "Add Institution"} size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={handleSave} loading={saving}>{institution ? "Save Changes" : "Add Institution"}</Button></>}>
      {error && <div className="alert alert-error" style={{ marginBottom: "1rem" }}>{error}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        {[
          { label: "AICTE Institution ID", field: "aicte_id", placeholder: "e.g. 1-123456" },
          { label: "Institution Name", field: "name", placeholder: "Full official name" },
          { label: "State", field: "state", placeholder: "e.g. Maharashtra" },
          { label: "City", field: "city", placeholder: "e.g. Mumbai" },
          { label: "Email", field: "email", placeholder: "official@institution.edu.in" },
          { label: "Phone", field: "phone", placeholder: "Office phone number" },
        ].map(({ label, field, placeholder }) => (
          <div key={field}>
            <label className="form-label">{label}</label>
            <input className="form-input" placeholder={placeholder} value={(form as any)[field]} onChange={e => setForm({ ...form, [field]: e.target.value })} />
          </div>
        ))}
        <div>
          <label className="form-label">Institution Type</label>
          <select className="form-input" value={form.type} onChange={e => setForm({ ...form, type: e.target.value as InstitutionType })}>
            {Object.entries(typeLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Approval Status</label>
          <select className="form-input" value={form.approval_status} onChange={e => setForm({ ...form, approval_status: e.target.value as ApprovalStatus })}>
            <option value="pending_approval">Pending Approval</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
      </div>
    </Modal>
  );
}

export default function InstitutionsPage() {
  const { isDemoMode } = useAuth();
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editInst, setEditInst] = useState<Institution | null | undefined>(undefined);
  const [showForm, setShowForm] = useState(false);

  const loadInstitutions = async () => {
    setLoading(true);
    if (isDemoMode) {
      setInstitutions(demoStore.getInstitutions());
      setLoading(false);
      return;
    }
    const { data, error } = await supabase.from("institutions").select("*").order("name");
    if (error || !data?.length) {
      setInstitutions(DEMO_INSTITUTIONS);
    } else {
      setInstitutions(data as Institution[]);
    }
    setLoading(false);
  };

  useEffect(() => { loadInstitutions(); }, [isDemoMode]);

  const filtered = institutions.filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    i.aicte_id.toLowerCase().includes(search.toLowerCase()) ||
    (i.state ?? "").toLowerCase().includes(search.toLowerCase())
  );
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">Institution Management</h1>
          <p className="page-subtitle">Manage AICTE-approved participating institutions</p>
        </div>
        <Button icon={<Plus size={16} />} onClick={() => { setEditInst(null); setShowForm(true); }}>Add Institution</Button>
      </div>

      <div className="card">
        <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="search-input-wrap" style={{ width: 320 }}>
            <Search size={16} />
            <input className="form-input" style={{ paddingLeft: "2.25rem" }} placeholder="Search by name, AICTE ID, state…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <span style={{ fontSize: "0.875rem", color: "var(--color-neutral-500)" }}>{filtered.length} institution{filtered.length !== 1 ? "s" : ""}</span>
        </div>

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}><Spinner size={32} /></div>
        ) : paged.length === 0 ? (
          <EmptyState title="No institutions found" description="Try adjusting your search or add a new institution." />
        ) : (
          <>
            <div className="table-wrapper" style={{ border: "none", borderRadius: 0 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>AICTE ID</th>
                    <th>Institution Name</th>
                    <th>Type</th>
                    <th>State</th>
                    <th>Status</th>
                    <th>Added</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map(inst => (
                    <tr key={inst.id}>
                      <td><code style={{ fontSize: "0.8125rem", background: "var(--color-neutral-100)", padding: "0.125rem 0.375rem", borderRadius: "0.25rem" }}>{inst.aicte_id}</code></td>
                      <td><span style={{ fontWeight: 500 }}>{inst.name}</span></td>
                      <td>{typeLabels[inst.type] ?? inst.type}</td>
                      <td>{inst.state ?? "—"}</td>
                      <td><Badge variant={statusVariant[inst.approval_status]}>{inst.approval_status.replace("_", " ")}</Badge></td>
                      <td style={{ color: "var(--color-neutral-500)" }}>{formatDate(inst.created_at)}</td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={() => { setEditInst(inst); setShowForm(true); }}><Edit2 size={15} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} totalPages={Math.ceil(filtered.length / PAGE_SIZE)} onPageChange={setPage} totalItems={filtered.length} pageSize={PAGE_SIZE} />
          </>
        )}
      </div>

      <InstitutionFormModal open={showForm} onClose={() => setShowForm(false)} institution={editInst} onSaved={loadInstitutions} />
    </div>
  );
}
