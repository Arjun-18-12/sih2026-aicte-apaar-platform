import React, { useEffect, useState, useMemo } from 'react';
import {
  ClipboardCheck,
  AlertTriangle,
  CheckCircle,
  Clock,
  RotateCcw,
  Search,
  Eye,
  Plus,
  User,
  Filter,
  X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { demoStore } from '../../services/demoStore';
import {
  CorrectionRequest,
  CorrectionRequestStatus,
  CorrectionCategory,
  CorrectionRequestPriority,
  Institution,
  Enrolment,
} from '../../types';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import { formatDate, formatDateTime } from '../../lib/utils';
import { maskSensitiveData } from '../../services/enrolmentService';

export default function CorrectionRequestsPage() {
  const { user, isDemoMode } = useAuth();

  const [requests, setRequests] = useState<CorrectionRequest[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [selectedReq, setSelectedReq] = useState<CorrectionRequest | null>(null);
  const [inspectModalOpen, setInspectModalOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Filters
  const [selectedInstFilter, setSelectedInstFilter] = useState<string>('all');
  const [statusTab, setStatusTab] = useState<'all' | 'awaiting_institution' | 'submitted_for_review' | 'returned_for_correction' | 'resolved' | 'closed'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // AICTE Decision form state
  const [reviewerNotes, setReviewerNotes] = useState('');
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [decisionSuccess, setDecisionSuccess] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  // New Request Form state
  const [newInstId, setNewInstId] = useState('');
  const [newEnrolmentId, setNewEnrolmentId] = useState('');
  const [newCategory, setNewCategory] = useState<CorrectionCategory>('missing_apaar');
  const [newPriority, setNewPriority] = useState<CorrectionRequestPriority>('medium');
  const [newIssueDesc, setNewIssueDesc] = useState('');
  const [newReqApaar, setNewReqApaar] = useState(true);
  const [newReqName, setNewReqName] = useState(false);
  const [availableEnrolments, setAvailableEnrolments] = useState<Enrolment[]>([]);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  const loadData = () => {
    if (isDemoMode) {
      const insts = demoStore.getInstitutions();
      setInstitutions(insts);
      const allReqs = demoStore.getCorrectionRequests();
      setRequests(allReqs);
    }
  };

  useEffect(() => {
    loadData();
    const handleFocus = () => loadData();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [isDemoMode]);

  // When newInstId changes in creation modal, load its enrolments
  useEffect(() => {
    if (newInstId && isDemoMode) {
      const enrs = demoStore.getEnrolments(newInstId);
      setAvailableEnrolments(enrs);
      if (enrs.length > 0 && !newEnrolmentId) {
        setNewEnrolmentId(enrs[0].id);
      }
    } else {
      setAvailableEnrolments([]);
      setNewEnrolmentId('');
    }
  }, [newInstId, isDemoMode]);

  const stats = useMemo(() => {
    const list = selectedInstFilter === 'all'
      ? requests
      : requests.filter((r) => r.institution_id === selectedInstFilter);

    return {
      total: list.length,
      awaiting_institution: list.filter(
        (r) => r.status === 'awaiting_institution' || r.status === 'open'
      ).length,
      submitted_for_review: list.filter((r) => r.status === 'submitted_for_review').length,
      returned: list.filter((r) => r.status === 'returned_for_correction').length,
      resolved: list.filter((r) => r.status === 'resolved').length,
      closed: list.filter((r) => r.status === 'closed').length,
    };
  }, [requests, selectedInstFilter]);

  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      // Institution filter
      if (selectedInstFilter !== 'all' && r.institution_id !== selectedInstFilter) {
        return false;
      }

      // Status filter
      if (statusTab === 'awaiting_institution') {
        if (r.status !== 'awaiting_institution' && r.status !== 'open') return false;
      } else if (statusTab === 'submitted_for_review') {
        if (r.status !== 'submitted_for_review') return false;
      } else if (statusTab === 'returned_for_correction') {
        if (r.status !== 'returned_for_correction') return false;
      } else if (statusTab === 'resolved') {
        if (r.status !== 'resolved') return false;
      } else if (statusTab === 'closed') {
        if (r.status !== 'closed') return false;
      }

      // Category filter
      if (categoryFilter !== 'all' && r.category !== categoryFilter) {
        return false;
      }

      // Priority filter
      if (priorityFilter !== 'all' && r.priority !== priorityFilter) {
        return false;
      }

      // Search term
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchesId = r.id.toLowerCase().includes(q);
        const matchesName = r.student?.full_name?.toLowerCase().includes(q);
        const matchesInst = r.institution?.name?.toLowerCase().includes(q);
        const matchesDesc = r.issue_description.toLowerCase().includes(q);
        const matchesStudentId = r.student_id.toLowerCase().includes(q);
        if (!matchesId && !matchesName && !matchesInst && !matchesDesc && !matchesStudentId) {
          return false;
        }
      }

      return true;
    });
  }, [requests, selectedInstFilter, statusTab, categoryFilter, priorityFilter, searchTerm]);

  const openInspectModal = (req: CorrectionRequest) => {
    setSelectedReq(req);
    setReviewerNotes('');
    setDecisionError(null);
    setDecisionSuccess(null);
    setInspectModalOpen(true);
  };

  const handleResolve = async (decision: 'accept' | 'return' | 'close') => {
    if (!selectedReq) return;
    if (decision !== 'accept' && !reviewerNotes.trim()) {
      setDecisionError(`Please provide reviewer notes explaining why this request was ${decision === 'return' ? 'returned' : 'closed'}.`);
      return;
    }

    setResolving(true);
    setDecisionError(null);

    try {
      const res = demoStore.resolveCorrectionRequest(
        selectedReq.id,
        decision,
        reviewerNotes.trim() || 'Correction verified and approved by AICTE review board.',
        user?.email || 'aicte.admin@demo.aicte.gov.in'
      );

      if (res.success && res.data) {
        setDecisionSuccess(
          decision === 'accept'
            ? 'Correction accepted and approved student records updated successfully.'
            : decision === 'return'
            ? 'Request returned to institution for further correction.'
            : 'Request closed.'
        );
        setSelectedReq(res.data);
        loadData();
      } else {
        setDecisionError(res.error || 'Failed to resolve request.');
      }
    } catch (err: any) {
      setDecisionError(err.message || 'An error occurred while resolving.');
    } finally {
      setResolving(false);
    }
  };

  const handleCreateRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEnrolmentId) {
      setCreateError('Please select an enrolment record.');
      return;
    }
    if (!newIssueDesc.trim()) {
      setCreateError('Please provide an issue description.');
      return;
    }

    const fields: string[] = [];
    if (newReqApaar) fields.push('apaar_id');
    if (newReqName) fields.push('full_name');
    if (fields.length === 0) fields.push('apaar_id');

    const res = demoStore.createCorrectionRequest(
      {
        enrolment_id: newEnrolmentId,
        category: newCategory,
        issue_description: newIssueDesc.trim(),
        requested_fields: fields,
        priority: newPriority,
      },
      user?.email || 'aicte.admin@demo.aicte.gov.in'
    );

    if (res.success && res.data) {
      setCreateSuccess(`Correction request ${res.data.id} created and dispatched to institution.`);
      loadData();
      setTimeout(() => {
        setCreateModalOpen(false);
        setCreateSuccess(null);
        setNewIssueDesc('');
      }, 1200);
    } else {
      setCreateError(res.error || 'Failed to create correction request.');
    }
  };

  const getStatusBadge = (status: CorrectionRequestStatus) => {
    switch (status) {
      case 'open':
      case 'awaiting_institution':
        return <Badge variant="yellow">Awaiting Institution</Badge>;
      case 'submitted_for_review':
        return <Badge variant="blue">Submitted for Review</Badge>;
      case 'returned_for_correction':
        return <Badge variant="red">Returned for Changes</Badge>;
      case 'resolved':
        return <Badge variant="green">Resolved</Badge>;
      case 'closed':
        return <Badge variant="gray">Closed</Badge>;
      default:
        return <Badge variant="gray">{status}</Badge>;
    }
  };

  const getPriorityBadge = (priority: CorrectionRequestPriority) => {
    switch (priority) {
      case 'high':
        return <Badge variant="red">High</Badge>;
      case 'medium':
        return <Badge variant="yellow">Medium</Badge>;
      case 'low':
        return <Badge variant="gray">Low</Badge>;
      default:
        return <Badge variant="gray">{priority}</Badge>;
    }
  };

  const getCategoryLabel = (category: CorrectionCategory) => {
    switch (category) {
      case 'apaar_entry_error':
        return 'APAAR Entry Error';
      case 'missing_apaar':
        return 'Missing APAAR ID';
      case 'invalid_apaar_format':
        return 'Invalid APAAR Format';
      case 'demographic_review':
        return 'Demographic Variance';
      case 'enrolment_data_correction':
        return 'Enrolment Data Error';
      case 'supporting_info_required':
        return 'Supporting Documents Required';
      case 'other':
        return 'Other Clerical Issue';
      default:
        return String(category).replace(/_/g, ' ');
    }
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="page-title">Institution Correction Requests</h1>
          <p className="page-subtitle">
            Issue and track student-specific data correction requests directed to affiliated institutions.
          </p>
        </div>
        <Button
          variant="primary"
          icon={<Plus size={16} />}
          onClick={() => {
            if (institutions.length > 0 && !newInstId) {
              setNewInstId(institutions[0].id);
            }
            setCreateError(null);
            setCreateSuccess(null);
            setCreateModalOpen(true);
          }}
        >
          New Correction Request
        </Button>
      </div>

      {/* Stats Summary Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <div className="stat-card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: '0.75rem',
              background: '#dbeafe',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Clock size={22} style={{ color: '#2563eb' }} />
          </div>
          <div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1d4ed8' }}>{stats.submitted_for_review}</div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--color-neutral-500)' }}>Awaiting AICTE Review</div>
          </div>
        </div>

        <div className="stat-card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: '0.75rem',
              background: '#fef3c7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AlertTriangle size={22} style={{ color: '#d97706' }} />
          </div>
          <div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#b45309' }}>{stats.awaiting_institution}</div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--color-neutral-500)' }}>Awaiting Institution</div>
          </div>
        </div>

        <div className="stat-card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: '0.75rem',
              background: '#dcfce7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CheckCircle size={22} style={{ color: '#16a34a' }} />
          </div>
          <div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#15803d' }}>{stats.resolved}</div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--color-neutral-500)' }}>Resolved Corrections</div>
          </div>
        </div>

        <div className="stat-card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: '0.75rem',
              background: 'var(--color-neutral-100)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ClipboardCheck size={22} style={{ color: 'var(--color-neutral-600)' }} />
          </div>
          <div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-neutral-900)' }}>{stats.total}</div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--color-neutral-500)' }}>Total Requests</div>
          </div>
        </div>
      </div>

      {/* Filter and Search Panel */}
      <div className="card mb-6">
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--color-neutral-200)',
          }}
        >
          {/* Status Tabs */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              className={`btn btn-sm ${statusTab === 'all' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setStatusTab('all')}
            >
              All ({stats.total})
            </button>
            <button
              className={`btn btn-sm ${statusTab === 'submitted_for_review' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setStatusTab('submitted_for_review')}
            >
              Needs AICTE Review ({stats.submitted_for_review})
            </button>
            <button
              className={`btn btn-sm ${statusTab === 'awaiting_institution' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setStatusTab('awaiting_institution')}
            >
              Awaiting Institution ({stats.awaiting_institution})
            </button>
            <button
              className={`btn btn-sm ${statusTab === 'returned_for_correction' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setStatusTab('returned_for_correction')}
            >
              Returned ({stats.returned})
            </button>
            <button
              className={`btn btn-sm ${statusTab === 'resolved' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setStatusTab('resolved')}
            >
              Resolved ({stats.resolved})
            </button>
            <button
              className={`btn btn-sm ${statusTab === 'closed' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setStatusTab('closed')}
            >
              Closed ({stats.closed})
            </button>
          </div>

          {/* Search bar */}
          <div style={{ position: 'relative', width: 260 }}>
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: '0.75rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--color-neutral-400)',
              }}
            />
            <input
              type="text"
              className="form-input"
              style={{ paddingLeft: '2.25rem', fontSize: '0.8125rem', width: '100%' }}
              placeholder="Search requests, records..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Secondary Filter Bar */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '1rem',
            padding: '0.75rem 1.25rem',
            background: 'var(--color-neutral-50)',
            borderBottom: '1px solid var(--color-neutral-200)',
            fontSize: '0.8125rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <Filter size={14} style={{ color: 'var(--color-neutral-500)' }} />
            <span style={{ fontWeight: 600, color: 'var(--color-neutral-700)' }}>Filter by:</span>
          </div>

          {/* Institution Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <label htmlFor="inst-filter" style={{ color: 'var(--color-neutral-500)' }}>Institution:</label>
            <select
              id="inst-filter"
              className="form-input"
              style={{ fontSize: '0.8125rem', padding: '0.2rem 0.5rem', height: 30, width: 220 }}
              value={selectedInstFilter}
              onChange={(e) => setSelectedInstFilter(e.target.value)}
            >
              <option value="all">All Institutions ({institutions.length})</option>
              {institutions.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name.replace(' (DEMO)', '')}
                </option>
              ))}
            </select>
          </div>

          {/* Category Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <label htmlFor="cat-filter" style={{ color: 'var(--color-neutral-500)' }}>Category:</label>
            <select
              id="cat-filter"
              className="form-input"
              style={{ fontSize: '0.8125rem', padding: '0.2rem 0.5rem', height: 30 }}
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="all">All Categories</option>
              <option value="missing_apaar">Missing APAAR</option>
              <option value="invalid_apaar_format">Invalid APAAR Format</option>
              <option value="demographic_review">Demographic Variance</option>
              <option value="apaar_entry_error">APAAR Entry Error</option>
              <option value="enrolment_data_correction">Enrolment Data Error</option>
              <option value="supporting_info_required">Supporting Docs Required</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Priority Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <label htmlFor="prio-filter" style={{ color: 'var(--color-neutral-500)' }}>Priority:</label>
            <select
              id="prio-filter"
              className="form-input"
              style={{ fontSize: '0.8125rem', padding: '0.2rem 0.5rem', height: 30 }}
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
            >
              <option value="all">All Priorities</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>

        {/* Requests Table */}
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Request ID</th>
                <th>Target Institution</th>
                <th>Affected Student</th>
                <th>Category</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Created</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--color-neutral-500)' }}>
                    <ClipboardCheck size={32} style={{ margin: '0 auto 0.75rem', opacity: 0.4 }} />
                    <p style={{ fontWeight: 600, fontSize: '0.9375rem' }}>No correction requests found</p>
                    <p style={{ fontSize: '0.8125rem', marginTop: '0.25rem' }}>
                      Try selecting a different filter or institution.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredRequests.map((req) => (
                  <tr key={req.id}>
                    <td>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--color-primary-700)' }}>
                        {req.id}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--color-neutral-900)' }}>
                        {req.institution?.name?.replace(' (DEMO)', '') || 'Target Institution'}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-neutral-500)' }}>
                        AICTE ID: {req.institution?.aicte_id || 'N/A'}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--color-neutral-800)' }}>
                        {req.student?.full_name || 'Student Record'}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-neutral-500)' }}>
                        ID: {req.student_id} • APAAR: {req.student?.apaar_id ? maskSensitiveData(req.student.apaar_id) : 'Absent'}
                      </div>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.8125rem' }}>{getCategoryLabel(req.category)}</span>
                    </td>
                    <td>{getPriorityBadge(req.priority)}</td>
                    <td>{getStatusBadge(req.status)}</td>
                    <td style={{ fontSize: '0.8125rem', color: 'var(--color-neutral-600)' }}>
                      {formatDate(req.created_at)}
                    </td>
                    <td>
                      <Button
                        variant={req.status === 'submitted_for_review' ? 'primary' : 'secondary'}
                        size="sm"
                        icon={<Eye size={14} />}
                        onClick={() => openInspectModal(req)}
                      >
                        {req.status === 'submitted_for_review' ? 'Review & Resolve' : 'Inspect'}
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Inspect & Resolve Modal */}
      {selectedReq && (
        <Modal
          open={inspectModalOpen}
          onClose={() => setInspectModalOpen(false)}
          title={`Correction Request Review — ${selectedReq.id}`}
          size="lg"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Header info */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.75rem',
                padding: '0.75rem 1rem',
                background: 'var(--color-neutral-50)',
                borderRadius: '0.5rem',
                border: '1px solid var(--color-neutral-200)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.8125rem', color: 'var(--color-neutral-500)' }}>Status:</span>
                {getStatusBadge(selectedReq.status)}
                <span style={{ fontSize: '0.8125rem', color: 'var(--color-neutral-500)', marginLeft: '0.5rem' }}>
                  Priority:
                </span>
                {getPriorityBadge(selectedReq.priority)}
                <span style={{ fontSize: '0.8125rem', color: 'var(--color-neutral-500)', marginLeft: '0.5rem' }}>
                  Category:
                </span>
                <span style={{ fontWeight: 600, fontSize: '0.8125rem' }}>{getCategoryLabel(selectedReq.category)}</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-neutral-500)' }}>
                Target: <strong>{selectedReq.institution?.name?.replace(' (DEMO)', '')}</strong>
              </div>
            </div>

            {/* AICTE Issue notice */}
            <div style={{ background: '#f8fafc', padding: '0.875rem 1rem', borderRadius: '0.5rem', border: '1px solid #cbd5e1' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
                Original AICTE Issue Description
              </div>
              <p style={{ marginTop: '0.25rem', fontSize: '0.875rem', color: '#0f172a' }}>
                {selectedReq.issue_description}
              </p>
              <div style={{ marginTop: '0.375rem', fontSize: '0.75rem', color: '#64748b' }}>
                Requested correction fields: <strong>{selectedReq.requested_fields.join(', ')}</strong>
              </div>
            </div>

            {/* Affected Record Details */}
            <div
              style={{
                border: '1px solid var(--color-neutral-200)',
                borderRadius: '0.5rem',
                padding: '1rem',
                background: '#ffffff',
              }}
            >
              <div
                style={{
                  fontSize: '0.8125rem',
                  fontWeight: 700,
                  color: 'var(--color-neutral-600)',
                  marginBottom: '0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                }}
              >
                <User size={16} /> AFFECTED ENROLMENT RECORD (AUTHORITATIVE SYSTEM RECORD)
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '0.75rem',
                  fontSize: '0.875rem',
                }}
              >
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-neutral-500)', display: 'block' }}>
                    Current Enrolled Name
                  </span>
                  <strong>{selectedReq.student?.full_name || 'N/A'}</strong>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-neutral-500)', display: 'block' }}>
                    Current APAAR ID
                  </span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                    {selectedReq.student?.apaar_id ? maskSensitiveData(selectedReq.student.apaar_id) : 'Not Provided'}
                  </span>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-neutral-500)', display: 'block' }}>
                    Enrolment / Student ID
                  </span>
                  <code style={{ fontSize: '0.75rem' }}>{selectedReq.student_id}</code>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-neutral-500)', display: 'block' }}>
                    Programme & Year
                  </span>
                  <span>
                    {selectedReq.enrolment?.programme?.name || 'Programme'} (
                    {selectedReq.enrolment?.academic_year || '2024-25'})
                  </span>
                </div>
              </div>
            </div>

            {/* Institution Response & Proposed Corrections (if present) */}
            {selectedReq.institution_response ? (
              <div
                style={{
                  border: '1px solid #bfdbfe',
                  borderRadius: '0.5rem',
                  padding: '1rem',
                  background: '#eff6ff',
                }}
              >
                <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#1e40af', marginBottom: '0.5rem' }}>
                  INSTITUTION RESPONSE & PROPOSED CORRECTIONS
                </div>
                <p style={{ fontSize: '0.875rem', color: '#1e3a8a', lineHeight: 1.5 }}>
                  {selectedReq.institution_response}
                </p>

                {selectedReq.proposed_changes && Object.keys(selectedReq.proposed_changes).length > 0 && (
                  <div
                    style={{
                      marginTop: '0.75rem',
                      padding: '0.75rem',
                      background: '#ffffff',
                      borderRadius: '0.375rem',
                      border: '1px solid #93c5fd',
                    }}
                  >
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#1d4ed8', marginBottom: '0.375rem' }}>
                      PROPOSED DATA MODIFICATIONS (PENDING APPROVAL):
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.5rem', fontSize: '0.8125rem' }}>
                      {selectedReq.proposed_changes.apaar_id && (
                        <div>
                          <span style={{ color: '#64748b' }}>Proposed APAAR ID: </span>
                          <strong style={{ fontFamily: 'monospace', color: '#047857' }}>
                            {selectedReq.proposed_changes.apaar_id}
                          </strong>
                        </div>
                      )}
                      {selectedReq.proposed_changes.full_name && (
                        <div>
                          <span style={{ color: '#64748b' }}>Proposed Full Name: </span>
                          <strong style={{ color: '#047857' }}>{selectedReq.proposed_changes.full_name}</strong>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div
                style={{
                  padding: '0.75rem 1rem',
                  background: '#fffbeb',
                  borderRadius: '0.5rem',
                  border: '1px solid #fde68a',
                  color: '#92400e',
                  fontSize: '0.8125rem',
                }}
              >
                The institution has not submitted a response yet. The request remains pending at the institution inbox.
              </div>
            )}

            {/* AICTE Decision Panel */}
            {selectedReq.status === 'submitted_for_review' ? (
              <div
                style={{
                  border: '2px solid var(--color-primary-300)',
                  borderRadius: '0.5rem',
                  padding: '1rem',
                  background: '#ffffff',
                }}
              >
                <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-primary-900)', marginBottom: '0.5rem' }}>
                  AICTE Review Board Resolution
                </div>

                {decisionError && <Alert variant="error" className="mb-3">{decisionError}</Alert>}
                {decisionSuccess && <Alert variant="success" className="mb-3">{decisionSuccess}</Alert>}

                <div style={{ marginBottom: '1rem' }}>
                  <label htmlFor="rev-notes" style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Reviewer Decision Notes / Justification
                  </label>
                  <textarea
                    id="rev-notes"
                    className="form-input"
                    rows={2}
                    style={{ width: '100%' }}
                    placeholder="Provide justification for approval, or specific directions if returning for further correction..."
                    value={reviewerNotes}
                    onChange={(e) => setReviewerNotes(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'flex-end' }}>
                  <Button
                    variant="ghost"
                    onClick={() => handleResolve('close')}
                    disabled={resolving}
                    icon={<X size={15} />}
                  >
                    Close Without Changes
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => handleResolve('return')}
                    disabled={resolving}
                    icon={<RotateCcw size={15} />}
                  >
                    Return for Further Correction
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => handleResolve('accept')}
                    disabled={resolving}
                    icon={<CheckCircle size={15} />}
                  >
                    Accept &amp; Apply Correction
                  </Button>
                </div>
              </div>
            ) : selectedReq.status === 'awaiting_institution' || selectedReq.status === 'returned_for_correction' ? (
              <div
                style={{
                  padding: '0.75rem 1rem',
                  background: 'var(--color-neutral-50)',
                  borderRadius: '0.5rem',
                  border: '1px solid var(--color-neutral-200)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: '0.8125rem', color: 'var(--color-neutral-600)' }}>
                  Awaiting institution correction response. You may close this request if it was resolved externally or determined to be a false positive.
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const reason = window.prompt('Enter reason for closing this request early:');
                    if (reason && reason.trim()) {
                      demoStore.resolveCorrectionRequest(selectedReq.id, 'close', reason.trim(), user?.email || 'aicte.admin@demo.aicte.gov.in');
                      loadData();
                      setInspectModalOpen(false);
                    }
                  }}
                >
                  Close Request Early
                </Button>
              </div>
            ) : (
              <div
                style={{
                  padding: '0.875rem 1rem',
                  background: selectedReq.status === 'resolved' ? '#f0fdf4' : 'var(--color-neutral-100)',
                  borderRadius: '0.5rem',
                  border: `1px solid ${selectedReq.status === 'resolved' ? '#bbf7d0' : 'var(--color-neutral-300)'}`,
                  fontSize: '0.8125rem',
                }}
              >
                <strong>Request is in terminal state: {selectedReq.status.toUpperCase()}</strong>
                {selectedReq.resolution_notes && (
                  <p style={{ marginTop: '0.25rem', color: 'var(--color-neutral-700)' }}>
                    Resolution Notes: {selectedReq.resolution_notes}
                  </p>
                )}
                <div style={{ marginTop: '0.25rem', color: 'var(--color-neutral-500)', fontSize: '0.75rem' }}>
                  Resolved by {selectedReq.resolved_by || 'AICTE'} on {selectedReq.resolved_at ? formatDateTime(selectedReq.resolved_at) : 'N/A'}
                </div>
              </div>
            )}

            {/* Audit & Timeline History */}
            <div>
              <div
                style={{
                  fontSize: '0.8125rem',
                  fontWeight: 700,
                  color: 'var(--color-neutral-600)',
                  marginBottom: '0.5rem',
                }}
              >
                REQUEST AUDIT TIMELINE
              </div>
              <div
                style={{
                  border: '1px solid var(--color-neutral-200)',
                  borderRadius: '0.5rem',
                  padding: '0.75rem',
                  maxHeight: 180,
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                }}
              >
                {selectedReq.history.map((h) => (
                  <div
                    key={h.id}
                    style={{
                      fontSize: '0.8125rem',
                      padding: '0.375rem 0.5rem',
                      borderLeft: '3px solid var(--color-primary-400)',
                      background: 'var(--color-neutral-50)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-neutral-500)', fontSize: '0.75rem' }}>
                      <span>
                        <strong>{h.actor_role === 'aicte_admin' ? 'AICTE Reviewer' : 'Institution Administrator'}</strong> ({h.actor_email})
                      </span>
                      <span>{formatDateTime(h.created_at)}</span>
                    </div>
                    <div style={{ marginTop: '0.125rem', color: 'var(--color-neutral-800)' }}>
                      <span style={{ fontWeight: 600 }}>Action: {h.action.replace(/_/g, ' ')}</span> — {h.comment}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* New Correction Request Creation Modal */}
      <Modal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Create Institution Correction Request"
        size="md"
      >
        <form onSubmit={handleCreateRequest} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-neutral-600)' }}>
            Direct a formal correction notice to an affiliated institution regarding a specific enrolment or APAAR issue.
          </p>

          {createError && <Alert variant="error">{createError}</Alert>}
          {createSuccess && <Alert variant="success">{createSuccess}</Alert>}

          {/* Institution Selection */}
          <div>
            <label htmlFor="new-inst" style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.25rem' }}>
              Target Institution <span style={{ color: 'var(--color-danger-600)' }}>*</span>
            </label>
            <select
              id="new-inst"
              className="form-input"
              style={{ width: '100%' }}
              value={newInstId}
              onChange={(e) => setNewInstId(e.target.value)}
              required
            >
              {institutions.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name.replace(' (DEMO)', '')} ({i.city}, {i.state})
                </option>
              ))}
            </select>
          </div>

          {/* Enrolment Selection */}
          <div>
            <label htmlFor="new-enr" style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.25rem' }}>
              Target Student Enrolment Record <span style={{ color: 'var(--color-danger-600)' }}>*</span>
            </label>
            <select
              id="new-enr"
              className="form-input"
              style={{ width: '100%' }}
              value={newEnrolmentId}
              onChange={(e) => setNewEnrolmentId(e.target.value)}
              required
            >
              {availableEnrolments.length === 0 ? (
                <option value="">No enrolments found for this institution</option>
              ) : (
                availableEnrolments.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.student?.full_name || 'Student'} ({e.student_id}) — APAAR:{' '}
                    {e.student?.apaar_id ? maskSensitiveData(e.student.apaar_id) : 'Absent'}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Category & Priority */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label htmlFor="new-cat" style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                Correction Category <span style={{ color: 'var(--color-danger-600)' }}>*</span>
              </label>
              <select
                id="new-cat"
                className="form-input"
                style={{ width: '100%' }}
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as CorrectionCategory)}
              >
                <option value="missing_apaar">Missing APAAR ID</option>
                <option value="invalid_apaar_format">Invalid APAAR Format</option>
                <option value="apaar_entry_error">Possible APAAR Data-Entry Error</option>
                <option value="demographic_review">Name or Demographic Review</option>
                <option value="enrolment_data_correction">Enrolment Information Correction</option>
                <option value="supporting_info_required">Supporting Information Required</option>
                <option value="other">Other Clerical Issue</option>
              </select>
            </div>

            <div>
              <label htmlFor="new-prio" style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                Priority
              </label>
              <select
                id="new-prio"
                className="form-input"
                style={{ width: '100%' }}
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value as CorrectionRequestPriority)}
              >
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          {/* Requested Fields */}
          <div>
            <span style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.25rem' }}>
              Requested Fields to Address:
            </span>
            <div style={{ display: 'flex', gap: '1.25rem', fontSize: '0.8125rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={newReqApaar}
                  onChange={(e) => setNewReqApaar(e.target.checked)}
                />
                12-Digit APAAR ID
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={newReqName}
                  onChange={(e) => setNewReqName(e.target.checked)}
                />
                Student Full Name
              </label>
            </div>
          </div>

          {/* Issue Description */}
          <div>
            <label htmlFor="new-desc" style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.25rem' }}>
              Issue Description &amp; Instructions to Institution <span style={{ color: 'var(--color-danger-600)' }}>*</span>
            </label>
            <textarea
              id="new-desc"
              className="form-input"
              rows={3}
              style={{ width: '100%' }}
              placeholder="Explain the detected issue, reason for clerical review, and specific evidence required from the institution..."
              value={newIssueDesc}
              onChange={(e) => setNewIssueDesc(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
            <Button variant="secondary" type="button" onClick={() => setCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" icon={<ClipboardCheck size={16} />}>
              Create &amp; Dispatch Request
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
