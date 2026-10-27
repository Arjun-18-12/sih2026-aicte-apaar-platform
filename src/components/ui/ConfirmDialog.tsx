import React from "react";
import Modal from "./Modal";
import Button from "./Button";
import { AlertTriangle } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean; onClose: () => void; onConfirm: () => void;
  title: string; message: string; confirmLabel?: string; cancelLabel?: string;
  variant?: "danger" | "primary"; loading?: boolean;
}

export default function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = "Confirm", cancelLabel = "Cancel", variant = "danger", loading }: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>{cancelLabel}</Button>
          <Button variant={variant} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
        </>
      }
    >
      <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
        <AlertTriangle size={24} style={{ color: "var(--color-warning-500)", flexShrink: 0, marginTop: 2 }} />
        <p style={{ color: "var(--color-neutral-700)", lineHeight: 1.6 }}>{message}</p>
      </div>
    </Modal>
  );
}
