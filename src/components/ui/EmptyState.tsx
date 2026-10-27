import React from "react";
import { InboxIcon } from "lucide-react";

interface EmptyStateProps { title?: string; description?: string; icon?: React.ReactNode; action?: React.ReactNode; }

export default function EmptyState({ title = "No records found", description, icon, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div>{icon || <InboxIcon size={48} strokeWidth={1} />}</div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action && <div style={{ marginTop: "1rem" }}>{action}</div>}
    </div>
  );
}
