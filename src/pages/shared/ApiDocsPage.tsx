import React, { useState } from "react";
import { Download, Terminal, Shield, CheckCircle, FileCode, Layers } from "lucide-react";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";

const ENDPOINTS = [
  {
    method: "GET",
    path: "/api/v1/institutions/{institution_id}/programmes",
    title: "Lookup Approved Programmes & Intakes",
    desc: "Returns approved academic programmes, approved intake capacities, and supernumerary quotas for an institution.",
    headers: ["Authorization: Bearer <token>"],
    response: `{
  "institution_id": "11111111-1111-1111-1111-111111111111",
  "programmes": [
    {
      "id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "code": "BTECH-CS",
      "name": "B.Tech Computer Science (DEMO)",
      "approved_intake": 120,
      "supernumerary_nri": 3,
      "supernumerary_oci": 2,
      "supernumerary_fn": 1,
      "academic_year": "2024-25"
    }
  ]
}`
  },
  {
    method: "POST",
    path: "/api/v1/batches/submit",
    title: "Submit Student Enrolment Batch",
    desc: "Idempotent batch submission of student admission records. Retrying with the same X-Idempotency-Key returns the previous processing status without duplicate insertion.",
    headers: [
      "Authorization: Bearer <token>",
      "X-Idempotency-Key: <unique-uuid>",
      "Content-Type: application/json"
    ],
    request: `{
  "institution_id": "11111111-1111-1111-1111-111111111111",
  "academic_year": "2024-25",
  "records": [
    {
      "institution_student_id": "SRIT-2024-001",
      "full_name": "Aarav Rajesh Sharma",
      "apaar_id": "123456789012",
      "programme_code": "BTECH-CS",
      "admission_date": "2024-07-15",
      "admission_category": "general",
      "supernumerary_classification": "none"
    }
  ]
}`,
    response: `{
  "batch_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "status": "validation_complete",
  "total_records": 1,
  "valid_records": 1,
  "error_records": 0,
  "submitted_at": "2026-10-23T15:45:00Z"
}`
  },
  {
    method: "GET",
    path: "/api/v1/verification/apaar/{apaar_id}",
    title: "APAAR Identity Verification (SIMULATED)",
    desc: "Checks APAAR ID format and simulated authoritative identity verification status. Clearly identifies prototype simulation results.",
    headers: ["Authorization: Bearer <token>"],
    response: `{
  "apaar_id": "123456789012",
  "outcome": "verified",
  "is_simulated": true,
  "provider": "MOCK_SIMULATED_PROVIDER",
  "message": "[SIMULATED] APAAR ID format valid. Identity verification simulated as VERIFIED.",
  "verified_at": "2026-10-23T15:45:02Z",
  "request_reference": "MOCK-1729698302000-XYZ123"
}`
  }
];

export default function ApiDocsPage() {
  const [selectedEndpoint, setSelectedEndpoint] = useState(0);

  const ep = ENDPOINTS[selectedEndpoint];

  return (
    <div className="space-y-6">
      <div className="page-header flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="page-title text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <Terminal size={26} className="text-primary-700" />
            AICTE-APAAR Platform API Specification
          </h1>
          <p className="page-subtitle text-neutral-600 mt-1">
            RESTful API specification for Institution ERP systems and centralized AICTE data exchange.
          </p>
        </div>
        <div>
          <a href="/docs/openapi.yaml" download="openapi.yaml">
            <Button variant="secondary" icon={<Download size={16} />}>
              Download OpenAPI YAML
            </Button>
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-4 flex items-center gap-3">
          <div className="p-3 bg-blue-50 text-blue-700 rounded-lg">
            <Shield size={24} />
          </div>
          <div>
            <div className="font-semibold text-neutral-800">Security & Roles</div>
            <div className="text-xs text-neutral-500">JWT Bearer auth with RLS database isolation</div>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="p-3 bg-green-50 text-green-700 rounded-lg">
            <CheckCircle size={24} />
          </div>
          <div>
            <div className="font-semibold text-neutral-800">Idempotent Submissions</div>
            <div className="text-xs text-neutral-500">X-Idempotency-Key prevents duplicate enrolments</div>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="p-3 bg-amber-50 text-amber-700 rounded-lg">
            <Layers size={24} />
          </div>
          <div>
            <div className="font-semibold text-neutral-800">Simulated APAAR Adapter</div>
            <div className="text-xs text-neutral-500">Extensible adapter ready for official APAAR gateway</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Endpoint navigation */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Available Endpoints</div>
          {ENDPOINTS.map((e, idx) => (
            <button
              key={idx}
              onClick={() => setSelectedEndpoint(idx)}
              className={`w-full text-left p-3 rounded-lg border transition-all ${
                selectedEndpoint === idx
                  ? "bg-primary-50 border-primary-500 text-primary-900 shadow-sm"
                  : "bg-white border-neutral-200 hover:bg-neutral-50 text-neutral-700"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Badge variant={e.method === "GET" ? "blue" : "green"}>{e.method}</Badge>
                <span className="text-xs font-mono font-medium truncate">{e.path}</span>
              </div>
              <div className="text-xs text-neutral-600 font-medium">{e.title}</div>
            </button>
          ))}
        </div>

        {/* Endpoint details */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card p-5">
            <div className="flex items-center gap-3 mb-3">
              <Badge variant={ep.method === "GET" ? "blue" : "green"}>{ep.method}</Badge>
              <span className="font-mono text-sm font-bold text-neutral-800">{ep.path}</span>
            </div>
            <p className="text-sm text-neutral-600 mb-4">{ep.desc}</p>

            <div className="space-y-3">
              <div>
                <div className="text-xs font-semibold text-neutral-600 uppercase mb-1">Required Headers</div>
                <div className="bg-neutral-900 text-neutral-100 p-3 rounded-md font-mono text-xs space-y-1">
                  {ep.headers.map((h, i) => (
                    <div key={i}>{h}</div>
                  ))}
                </div>
              </div>

              {ep.request && (
                <div>
                  <div className="text-xs font-semibold text-neutral-600 uppercase mb-1">Request Payload</div>
                  <pre className="bg-neutral-900 text-green-300 p-3 rounded-md font-mono text-xs overflow-x-auto">
                    {ep.request}
                  </pre>
                </div>
              )}

              <div>
                <div className="text-xs font-semibold text-neutral-600 uppercase mb-1">Example Response (200 OK / 202 Accepted)</div>
                <pre className="bg-neutral-900 text-blue-300 p-3 rounded-md font-mono text-xs overflow-x-auto">
                  {ep.response}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}