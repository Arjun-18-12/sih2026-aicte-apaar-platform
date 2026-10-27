import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Inbox,
  FileCheck,
  Copy,
  AlertTriangle,
  CheckCircle,
  Clock,
  Search,
  Eye,
  Send,
  User,
  Building2,
  TrendingUp,
  XCircle,
  ArrowRight,
  ShieldCheck,
  Filter,
  RefreshCw,
  MessageSquare,
  UploadCloud
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { demoStore, DEMO_INSTITUTION_ID } from '../../services/demoStore';
import {
  InstitutionInboxItem,
  InboxItemStatus,
  InboxItemType
} from '../../types';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import { formatDate, formatDateTime } from '../../lib/utils';
import { maskSensitiveData } from '../../services/enrolmentService';

export default function CorrectionInboxPage() {
  const { user, isDemoMode } = useAuth();
  const navigate = useNavigate();
  const institutionId = user?.profile?.institution_id || (isDemoMode ? DEMO_INSTITUTION_ID : '');

  const [inboxItems, setInboxItems] = useState<InstitutionInboxItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<InstitutionInboxItem | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'awaiting_action' | 'under_review' | 'completed'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | InboxItemType>('all');

  // Response Form States
  const [responseNote, setResponseNote] = useState('');
  const [proposedApaar, setProposedApaar] = useState('');
  const [proposedName, setProposedName] = useState('');
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load items from demo store or backend
  const loadItems = () => {
    if (isDemoMode) {
      const items = demoStore.getInboxItems(institutionId);
      setInboxItems(items);
    }
  };

  useEffect(() => {
    loadItems();
  }, [institutionId, isDemoMode]);

  // Tab counts
  const counts = useMemo(() => {
    return {
      all: inboxItems.length,
      awaiting_action: inboxItems.filter(i => i.status === 'awaiting_action').length,
      under_review: inboxItems.filter(i => i.status === 'under_review').length,
      completed: inboxItems.filter(i => i.status === 'completed').length,
      unread: inboxItems.filter(i => !i.is_read).length,
    };
  }, [inboxItems]);

  // Filtered Items
  const filteredItems = useMemo(() => {
    let result = [...inboxItems];

    // Filter by Tab
    if (activeTab !== 'all') {
      result = result.filter(i => i.status === activeTab);
    }

    // Filter by Type
    if (typeFilter !== 'all') {
      result = result.filter(i => i.type === typeFilter);
    }

    // Search Filter
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(i => {
        const titleMatch = i.title?.toLowerCase().includes(q);
        const refMatch = i.reference_id?.toLowerCase().includes(q);
        const msgMatch = i.aicte_message?.toLowerCase().includes(q);
        const metaProg = i.metadata?.programme?.toLowerCase().includes(q);
        const metaStudent = i.metadata?.student_name?.toLowerCase().includes(q);
        return titleMatch || refMatch || msgMatch || metaProg || metaStudent;
      });
    }

    return result;
  }, [inboxItems, activeTab, typeFilter, searchTerm]);

  // Open item modal & mark as read
  const handleOpenItem = (item: InstitutionInboxItem) => {
    if (!item.is_read) {
      demoStore.markInboxItemRead(item.id, institutionId);
      setInboxItems(prev => prev.map(i => i.id === item.id ? { ...i, is_read: true } : i));
    }
    setSelectedItem(item);
    setResponseNote(item.institution_response || '');
    setProposedApaar('');
    setProposedName('');
    setActionSuccess(null);
    setActionError(null);
    setModalOpen(true);
  };

  // Submit response
  const handleSubmitResponse = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    if (!responseNote.trim()) {
      setActionError('Response explanation or note is required.');
      return;
    }

    setIsSubmitting(true);
    setActionError(null);

    let proposedData: any = null;
    if (selectedItem.type === 'correction_request') {
      proposedData = {};
      if (proposedApaar.trim()) proposedData.apaar_id = proposedApaar.trim();
      if (proposedName.trim()) proposedData.full_name = proposedName.trim();
    }

    const res = demoStore.submitInboxResponse(
      selectedItem.id,
      institutionId,
      responseNote.trim(),
      proposedData,
      user?.email || 'principal@srit.ac.in'
    );

    setIsSubmitting(false);

    if (res.success && res.data) {
      setActionSuccess('Your official response has been submitted to AICTE. This record is now under AICTE review.');
      setSelectedItem(res.data);
      loadItems();
      setTimeout(() => {
        setActionSuccess(null);
      }, 6000);
    } else {
      setActionError(res.error || 'Failed to submit response.');
    }
  };

  const getTypeMeta = (type: InboxItemType) => {
    switch (type) {
      case 'submission_decision':
        return {
          label: 'Submission Decision',
          icon: FileCheck,
          badgeVariant: 'indigo' as const,
          borderColor: '#6366f1',
          bgHeader: '#eef2ff'
        };
      case 'duplicate_adjudication':
        return {
          label: 'Duplicate Review',
          icon: Copy,
          badgeVariant: 'yellow' as const,
          borderColor: '#f59e0b',
          bgHeader: '#fffbeb'
        };
      case 'intake_inquiry':
        return {
          label: 'Intake Exception',
          icon: TrendingUp,
          badgeVariant: 'orange' as const,
          borderColor: '#ea580c',
          bgHeader: '#fff7ed'
        };
      case 'correction_request':
        return {
          label: 'Record Correction',
          icon: AlertTriangle,
          badgeVariant: 'red' as const,
          borderColor: '#ef4444',
          bgHeader: '#fef2f2'
        };
      default:
        return {
          label: 'Communication',
          icon: Inbox,
          badgeVariant: 'gray' as const,
          borderColor: '#94a3b8',
          bgHeader: '#f8fafc'
        };
    }
  };

  const getStatusBadge = (status: InboxItemStatus) => {
    switch (status) {
      case 'awaiting_action':
        return <Badge variant="red">Awaiting Action</Badge>;
      case 'under_review':
        return <Badge variant="blue">Responded / Under Review</Badge>;
      case 'completed':
        return <Badge variant="green">Completed</Badge>;
      default:
        return <Badge variant="gray">{status}</Badge>;
    }
  };

  return (
    <div>
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Inbox size={24} style={{ color: "var(--color-primary-600)" }} />
              Institution Inbox &amp; Communications
            </h1>
            <p className="page-subtitle">
              Official AICTE council notifications, batch decisions, duplicate reviews, intake inquiries, and correction requests
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <Button size="sm" variant="secondary" onClick={loadItems}>
              <RefreshCw size={14} style={{ marginRight: "0.375rem" }} /> Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "0.5rem", borderBottom: "1px solid var(--color-neutral-200)", marginBottom: "1.25rem", overflowX: "auto" }}>
        <button
          onClick={() => setActiveTab('all')}
          style={{
            padding: "0.75rem 1rem",
            border: "none",
            background: "none",
            fontWeight: 600,
            fontSize: "0.875rem",
            cursor: "pointer",
            borderBottom: activeTab === 'all' ? "2px solid var(--color-primary-600)" : "2px solid transparent",
            color: activeTab === 'all' ? "var(--color-primary-700)" : "var(--color-neutral-600)",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem"
          }}
        >
          All Communications
          <span style={{ background: "var(--color-neutral-100)", padding: "0.125rem 0.5rem", borderRadius: "9999px", fontSize: "0.75rem" }}>
            {counts.all}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('awaiting_action')}
          style={{
            padding: "0.75rem 1rem",
            border: "none",
            background: "none",
            fontWeight: 600,
            fontSize: "0.875rem",
            cursor: "pointer",
            borderBottom: activeTab === 'awaiting_action' ? "2px solid var(--color-danger-600)" : "2px solid transparent",
            color: activeTab === 'awaiting_action' ? "var(--color-danger-700)" : "var(--color-neutral-600)",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem"
          }}
        >
          Awaiting Action
          <span style={{ background: counts.awaiting_action > 0 ? "var(--color-danger-100)" : "var(--color-neutral-100)", color: counts.awaiting_action > 0 ? "var(--color-danger-700)" : "inherit", padding: "0.125rem 0.5rem", borderRadius: "9999px", fontSize: "0.75rem", fontWeight: 700 }}>
            {counts.awaiting_action}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('under_review')}
          style={{
            padding: "0.75rem 1rem",
            border: "none",
            background: "none",
            fontWeight: 600,
            fontSize: "0.875rem",
            cursor: "pointer",
            borderBottom: activeTab === 'under_review' ? "2px solid var(--color-primary-600)" : "2px solid transparent",
            color: activeTab === 'under_review' ? "var(--color-primary-700)" : "var(--color-neutral-600)",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem"
          }}
        >
          Responded / Under Review
          <span style={{ background: "var(--color-neutral-100)", padding: "0.125rem 0.5rem", borderRadius: "9999px", fontSize: "0.75rem" }}>
            {counts.under_review}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('completed')}
          style={{
            padding: "0.75rem 1rem",
            border: "none",
            background: "none",
            fontWeight: 600,
            fontSize: "0.875rem",
            cursor: "pointer",
            borderBottom: activeTab === 'completed' ? "2px solid var(--color-success-600)" : "2px solid transparent",
            color: activeTab === 'completed' ? "var(--color-success-700)" : "var(--color-neutral-600)",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem"
          }}
        >
          Completed
          <span style={{ background: "var(--color-neutral-100)", padding: "0.125rem 0.5rem", borderRadius: "9999px", fontSize: "0.75rem" }}>
            {counts.completed}
          </span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.25rem", flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 300px" }}>
          <Search size={16} style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "var(--color-neutral-400)" }} />
          <input
            type="text"
            placeholder="Search communications by reference, programme, student, or message..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{
              width: "100%",
              padding: "0.5rem 0.75rem 0.5rem 2.25rem",
              borderRadius: "0.375rem",
              border: "1px solid var(--color-neutral-300)",
              fontSize: "0.875rem"
            }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Filter size={16} style={{ color: "var(--color-neutral-500)" }} />
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as any)}
            style={{
              padding: "0.5rem 0.75rem",
              borderRadius: "0.375rem",
              border: "1px solid var(--color-neutral-300)",
              fontSize: "0.875rem",
              background: "#fff"
            }}
          >
            <option value="all">All Communication Types</option>
            <option value="submission_decision">Submission Decisions</option>
            <option value="duplicate_adjudication">Duplicate Reviews</option>
            <option value="intake_inquiry">Intake Exceptions</option>
            <option value="correction_request">Record Corrections</option>
          </select>
        </div>
      </div>

      {/* Empty State */}
      {filteredItems.length === 0 && (
        <div className="card" style={{ padding: "3rem 1rem", textAlign: "center" }}>
          <Inbox size={48} style={{ color: "var(--color-neutral-300)", margin: "0 auto 1rem" }} />
          <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--color-neutral-700)", marginBottom: "0.25rem" }}>
            No communications found
          </h3>
          <p style={{ fontSize: "0.875rem", color: "var(--color-neutral-500)" }}>
            {searchTerm || typeFilter !== 'all' || activeTab !== 'all'
              ? 'No items match your active tab and filter criteria.'
              : 'Your institution inbox is clear. No communications or pending actions from AICTE.'}
          </p>
        </div>
      )}

      {/* Items List */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
        {filteredItems.map(item => {
          const typeMeta = getTypeMeta(item.type);
          const TypeIcon = typeMeta.icon;
          const isAwaitingAction = item.status === 'awaiting_action';
          const isUnread = !item.is_read;

          return (
            <div
              key={item.id}
              className="card"
              style={{
                borderLeft: `4px solid ${typeMeta.borderColor}`,
                background: isUnread ? "#fafbff" : "#fff",
                transition: "box-shadow 0.15s ease",
                cursor: "pointer"
              }}
              onClick={() => handleOpenItem(item)}
            >
              <div className="card-body" style={{ padding: "1.125rem" }}>
                {/* Top Row: Type, Reference, Status, Unread & Date */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.625rem", flexWrap: "wrap", gap: "0.5rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    {isUnread && (
                      <span
                        title="Unread message"
                        style={{
                          width: "8px",
                          height: "8px",
                          borderRadius: "50%",
                          background: "#2563eb",
                          display: "inline-block"
                        }}
                      />
                    )}
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: typeMeta.borderColor }}>
                      <TypeIcon size={14} />
                      {typeMeta.label}
                    </span>
                    <span style={{ color: "var(--color-neutral-300)" }}>•</span>
                    <span style={{ fontSize: "0.75rem", fontFamily: "monospace", fontWeight: 600, background: "var(--color-neutral-100)", padding: "0.125rem 0.375rem", borderRadius: "0.25rem" }}>
                      Ref: {item.reference_id}
                    </span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    {getStatusBadge(item.status)}
                    <span style={{ fontSize: "0.75rem", color: "var(--color-neutral-500)", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                      <Clock size={12} /> {formatDate(item.date)}
                    </span>
                  </div>
                </div>

                {/* Title */}
                <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--color-neutral-900)", marginBottom: "0.5rem" }}>
                  {item.title}
                </h3>

                {/* AICTE Message */}
                <div style={{ background: "var(--color-neutral-50)", borderLeft: "3px solid var(--color-neutral-300)", padding: "0.625rem 0.875rem", borderRadius: "0.25rem", marginBottom: "0.75rem" }}>
                  <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)", lineHeight: 1.5 }}>
                    <strong style={{ color: "var(--color-neutral-900)" }}>AICTE Remarks: </strong>
                    {item.aicte_message}
                  </div>
                </div>

                {/* Specific Metadata Preview based on Type */}
                <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", fontSize: "0.8125rem", color: "var(--color-neutral-600)", marginBottom: "0.75rem" }}>
                  {item.type === 'submission_decision' && item.metadata.decision && (
                    <>
                      <div>Decision: <strong style={{ textTransform: "uppercase", color: item.metadata.decision === 'approved' ? "var(--color-success-700)" : item.metadata.decision === 'rejected' ? "var(--color-danger-700)" : "#d97706" }}>{item.metadata.decision.replace(/_/g, ' ')}</strong></div>
                      {item.metadata.academic_year && <div>Academic Year: <strong>{item.metadata.academic_year}</strong></div>}
                    </>
                  )}

                  {item.type === 'duplicate_adjudication' && (
                    <>
                      {item.metadata.student_name && <div>Candidate: <strong>{item.metadata.student_name}</strong></div>}
                      {item.metadata.masked_student_name && (
                        <div style={{ color: "var(--color-neutral-500)", fontStyle: "italic" }}>
                          Colliding Record: <strong>{item.metadata.masked_student_name}</strong>
                        </div>
                      )}
                    </>
                  )}

                  {item.type === 'intake_inquiry' && (
                    <>
                      {item.metadata.programme && <div>Programme: <strong>{item.metadata.programme}</strong></div>}
                      {item.metadata.approved_intake !== undefined && <div>Approved: <strong>{item.metadata.approved_intake}</strong></div>}
                      {item.metadata.actual_enrolled !== undefined && <div>Enrolled: <strong>{item.metadata.actual_enrolled}</strong></div>}
                      {item.metadata.excess !== undefined && <div style={{ color: "var(--color-danger-700)", fontWeight: 700 }}>Excess: +{item.metadata.excess}</div>}
                    </>
                  )}

                  {item.type === 'correction_request' && (
                    <>
                      {item.metadata.category && <div>Category: <strong>{item.metadata.category.replace(/_/g, ' ')}</strong></div>}
                      {item.metadata.requested_fields && <div>Requested Fields: <strong>{item.metadata.requested_fields.join(', ')}</strong></div>}
                    </>
                  )}

                  {item.deadline && (
                    <div style={{ color: "#e11d48", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.25rem" }}>
                      <Clock size={13} /> Response Deadline: {formatDate(item.deadline)}
                    </div>
                  )}
                </div>

                {/* Submitted response indicator if already submitted */}
                {item.institution_response && (
                  <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "0.5rem 0.75rem", borderRadius: "0.25rem", marginBottom: "0.75rem", fontSize: "0.8125rem", color: "#166534" }}>
                    <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: "0.25rem", marginBottom: "0.25rem" }}>
                      <CheckCircle size={14} /> Response Transmitted to AICTE ({formatDate(item.responded_at || item.updated_at)})
                    </div>
                    <div style={{ fontStyle: "italic", whiteSpace: "pre-wrap" }}>
                      "{item.institution_response}"
                    </div>
                  </div>
                )}

                {/* Footer Actions */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "0.5rem", borderTop: "1px solid var(--color-neutral-100)" }}>
                  <div style={{ fontSize: "0.75rem", color: "var(--color-neutral-500)" }}>
                    {item.metadata.next_action ? (
                      <span><strong>Next Action: </strong>{item.metadata.next_action}</span>
                    ) : (
                      <span>Official AICTE Communication</span>
                    )}
                  </div>

                  <div>
                    <Button
                      size="sm"
                      variant={isAwaitingAction ? "primary" : "secondary"}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenItem(item);
                      }}
                    >
                      {isAwaitingAction ? (
                        <>
                          <Send size={13} style={{ marginRight: "0.375rem" }} /> Respond / Action
                        </>
                      ) : (
                        <>
                          <Eye size={13} style={{ marginRight: "0.375rem" }} /> View Communication
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Detail and Response Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={selectedItem ? selectedItem.title : "Communication Details"}
        size="lg"
      >
        {selectedItem && (
          <div>
            {actionSuccess && (
              <Alert variant="success" className="mb-4">
                <CheckCircle size={16} /> <span>{actionSuccess}</span>
              </Alert>
            )}

            {actionError && (
              <Alert variant="error" className="mb-4">
                <AlertTriangle size={16} /> <span>{actionError}</span>
              </Alert>
            )}

            {/* Header info bar */}
            <div style={{ background: "var(--color-neutral-50)", padding: "0.875rem", borderRadius: "0.375rem", marginBottom: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
              <div>
                <span style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "var(--color-neutral-500)", display: "block" }}>
                  Communication Reference
                </span>
                <span style={{ fontWeight: 700, fontSize: "0.9375rem" }}>
                  {selectedItem.reference_type.toUpperCase()}: {selectedItem.reference_id}
                </span>
              </div>

              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                {getStatusBadge(selectedItem.status)}
                <span style={{ fontSize: "0.8125rem", color: "var(--color-neutral-500)" }}>
                  Received: {formatDate(selectedItem.date)}
                </span>
              </div>
            </div>

            {/* AICTE Official Remarks Box */}
            <div style={{ background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: "0.375rem", padding: "1rem", marginBottom: "1rem" }}>
              <div style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "#475569", marginBottom: "0.375rem" }}>
                AICTE Official Remarks &amp; Inquiry Instructions
              </div>
              <div style={{ fontSize: "0.9375rem", color: "#0f172a", lineHeight: 1.5 }}>
                {selectedItem.aicte_message}
              </div>
              {selectedItem.deadline && (
                <div style={{ marginTop: "0.5rem", fontSize: "0.8125rem", color: "#e11d48", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.25rem" }}>
                  <Clock size={14} /> Mandatory Response Deadline: {formatDate(selectedItem.deadline)}
                </div>
              )}
            </div>

            {/* Item Specific Content */}
            {selectedItem.type === 'submission_decision' && (
              <div className="card" style={{ padding: "0.875rem", marginBottom: "1rem", background: "#fdfefe" }}>
                <h4 style={{ fontSize: "0.875rem", fontWeight: 700, color: "#1e293b", marginBottom: "0.5rem" }}>
                  Submission Batch Details
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem", fontSize: "0.8125rem" }}>
                  <div>Batch ID: <strong>{selectedItem.metadata.batch_id || selectedItem.reference_id}</strong></div>
                  <div>Decision: <strong style={{ textTransform: "uppercase", color: selectedItem.metadata.decision === 'approved' ? "var(--color-success-700)" : "var(--color-danger-700)" }}>{selectedItem.metadata.decision}</strong></div>
                  <div>Academic Year: <strong>{selectedItem.metadata.academic_year || '2024-25'}</strong></div>
                  <div>Next Action: <strong>{selectedItem.metadata.next_action || 'Review AICTE remarks'}</strong></div>
                </div>

                {selectedItem.metadata.decision === 'returned_for_correction' && (
                  <div style={{ marginTop: "1rem", padding: "0.75rem", background: "#fef3c7", borderRadius: "0.375rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
                    <div style={{ fontSize: "0.8125rem", color: "#92400e" }}>
                      You can prepare and upload a corrected student batch via CSV Upload.
                    </div>
                    <Button size="sm" variant="primary" onClick={() => navigate('/institution/upload')}>
                      <UploadCloud size={14} style={{ marginRight: "0.375rem" }} /> Go to CSV Upload
                    </Button>
                  </div>
                )}
              </div>
            )}

            {selectedItem.type === 'duplicate_adjudication' && (
              <div className="card" style={{ padding: "0.875rem", marginBottom: "1rem", background: "#fdfefe" }}>
                <h4 style={{ fontSize: "0.875rem", fontWeight: 700, color: "#1e293b", marginBottom: "0.5rem" }}>
                  Duplicate Review Finding (Privacy-Preserved)
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.75rem", fontSize: "0.8125rem", marginBottom: "0.5rem" }}>
                  <div>Your Institution's Candidate: <strong>{selectedItem.metadata.student_name || 'Enrolled Student'}</strong></div>
                  <div style={{ color: "#475569" }}>
                    Other Record: <strong style={{ color: "#0891b2" }}>{selectedItem.metadata.masked_student_name || '[Confidential Candidate - Verified Institution]'}</strong>
                  </div>
                </div>
                <Alert variant="info">
                  <ShieldCheck size={16} />
                  <span>
                    Cross-institution privacy protection is active. Sensitive personal identifiers and student names from external institutions are confidential.
                  </span>
                </Alert>
              </div>
            )}

            {selectedItem.type === 'intake_inquiry' && (
              <div className="card" style={{ padding: "0.875rem", marginBottom: "1rem", background: "#fdfefe" }}>
                <h4 style={{ fontSize: "0.875rem", fontWeight: 700, color: "#1e293b", marginBottom: "0.5rem" }}>
                  Intake Exception Figures
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.75rem", marginBottom: "0.5rem" }}>
                  <div style={{ background: "#f1f5f9", padding: "0.5rem", borderRadius: "0.25rem" }}>
                    <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Programme</div>
                    <div style={{ fontWeight: 600, fontSize: "0.8125rem" }}>{selectedItem.metadata.programme || 'Programme'}</div>
                  </div>
                  <div style={{ background: "#f1f5f9", padding: "0.5rem", borderRadius: "0.25rem" }}>
                    <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Approved Intake</div>
                    <div style={{ fontWeight: 700 }}>{selectedItem.metadata.approved_intake ?? 'N/A'}</div>
                  </div>
                  <div style={{ background: "#f1f5f9", padding: "0.5rem", borderRadius: "0.25rem" }}>
                    <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Actual Enrolled</div>
                    <div style={{ fontWeight: 700 }}>{selectedItem.metadata.actual_enrolled ?? 'N/A'}</div>
                  </div>
                  <div style={{ background: "#fef2f2", padding: "0.5rem", borderRadius: "0.25rem", border: "1px solid #fecaca" }}>
                    <div style={{ fontSize: "0.75rem", color: "#b91c1c" }}>Excess Enrolment</div>
                    <div style={{ fontWeight: 800, color: "#b91c1c" }}>+{selectedItem.metadata.excess ?? 'N/A'}</div>
                  </div>
                </div>
              </div>
            )}

            {selectedItem.type === 'correction_request' && (
              <div className="card" style={{ padding: "0.875rem", marginBottom: "1rem", background: "#fdfefe" }}>
                <h4 style={{ fontSize: "0.875rem", fontWeight: 700, color: "#1e293b", marginBottom: "0.5rem" }}>
                  Record Correction Context
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem", fontSize: "0.8125rem" }}>
                  <div>Correction ID: <strong>{selectedItem.metadata.correction_id || selectedItem.reference_id}</strong></div>
                  <div>Category: <strong>{selectedItem.metadata.category || 'Demographic Divergence'}</strong></div>
                  <div>Candidate ID: <strong>{selectedItem.metadata.student_id || 'std-record'}</strong></div>
                  <div>Requested Fields: <strong>{(selectedItem.metadata.requested_fields || []).join(', ') || 'apaar_id'}</strong></div>
                </div>
              </div>
            )}

            {/* Display submitted response if existing */}
            {selectedItem.institution_response && (
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "0.875rem", borderRadius: "0.375rem", marginBottom: "1rem" }}>
                <div style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "#166534", marginBottom: "0.25rem" }}>
                  Institution Formal Response Transmitted ({formatDateTime(selectedItem.responded_at || selectedItem.updated_at)})
                </div>
                <div style={{ fontSize: "0.875rem", color: "#14532d", whiteSpace: "pre-wrap" }}>
                  {selectedItem.institution_response}
                </div>
                <div style={{ fontSize: "0.75rem", color: "#4b5563", marginTop: "0.5rem" }}>
                  Submitted by: {selectedItem.responded_by || user?.email} | Status: Pending AICTE council review
                </div>
              </div>
            )}

            {/* Response Form if Awaiting Action */}
            {selectedItem.status === 'awaiting_action' ? (
              <form onSubmit={handleSubmitResponse} style={{ borderTop: "1px solid var(--color-neutral-200)", paddingTop: "1rem" }}>
                <h4 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--color-neutral-900)", marginBottom: "0.5rem" }}>
                  Submit Official Institutional Response
                </h4>
                <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", marginBottom: "1rem" }}>
                  Provide your governing board sanction, explanatory justification, or corrected data. Your submission will be recorded in the audit log and dispatched to the AICTE review board.
                </p>

                {/* Additional inputs for Correction Request */}
                {selectedItem.type === 'correction_request' && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                        Proposed APAAR ID (12 digits)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 123456789012"
                        value={proposedApaar}
                        onChange={e => setProposedApaar(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "0.5rem",
                          borderRadius: "0.375rem",
                          border: "1px solid var(--color-neutral-300)",
                          fontSize: "0.875rem"
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                        Corrected Full Name (as per APAAR)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Candidate Name"
                        value={proposedName}
                        onChange={e => setProposedName(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "0.5rem",
                          borderRadius: "0.375rem",
                          border: "1px solid var(--color-neutral-300)",
                          fontSize: "0.875rem"
                        }}
                      />
                    </div>
                  </div>
                )}

                <div style={{ marginBottom: "1rem" }}>
                  <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.375rem" }}>
                    Official Explanation / Clarification Text *
                  </label>
                  <textarea
                    rows={4}
                    value={responseNote}
                    onChange={e => setResponseNote(e.target.value)}
                    placeholder="Enter formal justification, governing sanction reference, or resolution summary..."
                    style={{
                      width: "100%",
                      padding: "0.5rem",
                      borderRadius: "0.375rem",
                      border: "1px solid var(--color-neutral-300)",
                      fontSize: "0.875rem",
                      fontFamily: "inherit"
                    }}
                    required
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                  <Button variant="secondary" onClick={() => setModalOpen(false)}>
                    Close
                  </Button>
                  <Button variant="primary" type="submit" disabled={isSubmitting || !responseNote.trim()}>
                    <Send size={14} style={{ marginRight: "0.375rem" }} />
                    {isSubmitting ? 'Transmitting...' : 'Submit Response to AICTE'}
                  </Button>
                </div>
              </form>
            ) : (
              <div style={{ display: "flex", justifyContent: "flex-end", borderTop: "1px solid var(--color-neutral-200)", paddingTop: "1rem" }}>
                <Button variant="secondary" onClick={() => setModalOpen(false)}>
                  Close
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
