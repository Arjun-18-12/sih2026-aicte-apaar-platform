import React, { useEffect } from "react";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}

const sizeMap = { sm: "360px", md: "560px", lg: "768px", xl: "960px" };

export default function Modal({ open, onClose, title, children, footer, size = "md" }: ModalProps) {
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ maxWidth: sizeMap[size] }}>
        <div className="modal-header">
          <h3 style={{ fontSize: "1.0625rem", fontWeight: 600, color: "var(--color-neutral-900)" }}>{title}</h3>
          <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ padding: "0.25rem" }}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
