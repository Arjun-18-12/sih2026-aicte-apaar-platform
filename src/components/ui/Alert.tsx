import React from "react";
import { AlertCircle, CheckCircle, Info, AlertTriangle } from "lucide-react";
import { cn } from "../../lib/utils";

type AlertVariant = "info" | "success" | "warning" | "error";
interface AlertProps { variant?: AlertVariant; children: React.ReactNode; className?: string; }

const icons = { info: Info, success: CheckCircle, warning: AlertTriangle, error: AlertCircle };

export default function Alert({ variant = "info", children, className }: AlertProps) {
  const Icon = icons[variant];
  return (
    <div className={cn("alert", `alert-${variant}`, className)}>
      <Icon size={18} style={{ flexShrink: 0, marginTop: 1 }} />
      <div>{children}</div>
    </div>
  );
}
