import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  page: number; totalPages: number; onPageChange: (p: number) => void; totalItems?: number; pageSize?: number;
}

export default function Pagination({ page, totalPages, onPageChange, totalItems, pageSize }: PaginationProps) {
  if (totalPages <= 1) return null;
  const start = totalItems && pageSize ? (page - 1) * pageSize + 1 : null;
  const end = totalItems && pageSize ? Math.min(page * pageSize, totalItems) : null;

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.875rem 1rem", borderTop: "1px solid var(--color-neutral-200)", fontSize: "0.875rem", color: "var(--color-neutral-600)" }}>
      <span>{start && end && totalItems ? `Showing ${start}â€“${end} of ${totalItems}` : `Page ${page} of ${totalPages}`}</span>
      <div style={{ display: "flex", gap: "0.375rem", alignItems: "center" }}>
        <button className="btn btn-secondary btn-sm" onClick={() => onPageChange(page - 1)} disabled={page <= 1}><ChevronLeft size={16} /></button>
        {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
          let p: number;
          if (totalPages <= 5) { p = i + 1; }
          else if (page <= 3) { p = i + 1; }
          else if (page >= totalPages - 2) { p = totalPages - 4 + i; }
          else { p = page - 2 + i; }
          return (
            <button key={p} className={`btn btn-sm ${p === page ? "btn-primary" : "btn-secondary"}`} onClick={() => onPageChange(p)}>{p}</button>
          );
        })}
        <button className="btn btn-secondary btn-sm" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}><ChevronRight size={16} /></button>
      </div>
    </div>
  );
}
