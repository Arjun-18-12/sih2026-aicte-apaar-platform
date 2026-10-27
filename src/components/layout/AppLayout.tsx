import React, { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import {
  LayoutDashboard, Building2, BookOpen, Users, Upload, FileCheck,
  AlertTriangle, BarChart3, ClipboardList, LogOut, Menu, X,
  Shield, ChevronDown, ClipboardCheck, Inbox
} from "lucide-react";

const AICTE_NAV = [
  { to: "/aicte", label: "Dashboard", icon: LayoutDashboard },
  { to: "/aicte/institutions", label: "Institutions", icon: Building2 },
  { to: "/aicte/programmes", label: "Programmes & Intake", icon: BookOpen },
  { to: "/aicte/submissions", label: "Submissions", icon: FileCheck },
  { to: "/aicte/duplicates", label: "Duplicate Review", icon: AlertTriangle },
  { to: "/aicte/exceptions", label: "Intake Exceptions", icon: AlertTriangle },
  { to: "/aicte/corrections", label: "Correction Requests", icon: ClipboardCheck },
  { to: "/aicte/reports", label: "Reports", icon: BarChart3 },
  { to: "/aicte/users", label: "User Management", icon: Users },
  { to: "/aicte/audit", label: "Audit Logs", icon: ClipboardList },
];

const INST_NAV = [
  { to: "/institution", label: "Dashboard", icon: LayoutDashboard },
  { to: "/institution/enrolments", label: "Enrolments", icon: Users },
  { to: "/institution/upload", label: "CSV Upload", icon: Upload },
  { to: "/institution/submissions", label: "Submissions", icon: FileCheck },
  { to: "/institution/corrections", label: "Institution Inbox", icon: Inbox },
  { to: "/institution/programmes", label: "Programmes", icon: BookOpen },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, signOut, isDemoMode } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const isAicte = user?.profile?.role === "aicte_admin";
  const nav = isAicte ? AICTE_NAV : INST_NAV;

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const SidebarContent = () => (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: "white", borderRight: "1px solid var(--color-neutral-200)" }}>
      {/* Logo */}
      <div style={{ padding: "1.25rem 1.25rem 1rem", borderBottom: "1px solid var(--color-neutral-100)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div style={{ width: 36, height: 36, background: "var(--color-primary-700)", borderRadius: "0.5rem", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Shield size={20} color="white" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: "0.9375rem", color: "var(--color-primary-900)", lineHeight: 1.2 }}>AICTE–APAAR</div>
            <div style={{ fontSize: "0.6875rem", color: "var(--color-neutral-500)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Data Platform</div>
          </div>
        </div>
        <div style={{ marginTop: "0.625rem", padding: "0.375rem 0.625rem", background: isAicte ? "var(--color-primary-50)" : "var(--color-neutral-50)", borderRadius: "0.375rem", display: "inline-flex", alignItems: "center", gap: "0.375rem" }}>
          <span style={{ fontSize: "0.6875rem", fontWeight: 600, color: isAicte ? "var(--color-primary-700)" : "var(--color-neutral-600)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {isAicte ? "AICTE Administrator" : "Institution Administrator"}
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: "auto", padding: "0.75rem 0.75rem" }}>
        {nav.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === "/aicte" || to === "/institution"}
            className={({ isActive }) => "sidebar-link " + (isActive ? "active" : "")}
            style={{ marginBottom: "0.125rem" }}
            onClick={() => setSidebarOpen(false)}
          >
            <Icon size={18} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* User footer */}
      <div style={{ padding: "0.875rem 1rem", borderTop: "1px solid var(--color-neutral-100)" }}>
        <div
          style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.5rem 0.5rem", borderRadius: "0.5rem", cursor: "pointer" }}
          onClick={() => setUserMenuOpen(!userMenuOpen)}
        >
          <div style={{ width: 32, height: 32, background: "var(--color-primary-100)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: "0.875rem", color: "var(--color-primary-700)", flexShrink: 0 }}>
            {user?.profile?.full_name?.charAt(0)?.toUpperCase() ?? "U"}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-neutral-800)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.profile?.full_name}</div>
            <div style={{ fontSize: "0.75rem", color: "var(--color-neutral-500)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.email}</div>
          </div>
          <ChevronDown size={14} style={{ color: "var(--color-neutral-400)", flexShrink: 0 }} />
        </div>
        {userMenuOpen && (
          <div style={{ marginTop: "0.375rem" }}>
            <button className="btn btn-ghost btn-sm" style={{ width: "100%", justifyContent: "flex-start", gap: "0.5rem", color: "var(--color-danger-600)" }} onClick={handleSignOut}>
              <LogOut size={16} /> Sign Out
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* Desktop sidebar */}
      <div style={{ width: 240, flexShrink: 0, display: "none" }} className="desktop-sidebar">
        <SidebarContent />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 40, display: "flex" }}>
          <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.4)" }} onClick={() => setSidebarOpen(false)} />
          <div style={{ position: "relative", width: 260, backgroundColor: "white", height: "100%", boxShadow: "4px 0 24px rgba(0,0,0,0.12)" }}>
            <SidebarContent />
          </div>
        </div>
      )}

      {/* Main content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Top bar */}
        <header style={{ height: 56, backgroundColor: "white", borderBottom: "1px solid var(--color-neutral-200)", display: "flex", alignItems: "center", paddingInline: "1.25rem", gap: "1rem", flexShrink: 0 }}>
          <button className="btn btn-ghost btn-sm" style={{ padding: "0.25rem" }} onClick={() => setSidebarOpen(!sidebarOpen)}>
            <Menu size={20} />
          </button>
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--color-success-500)", display: "inline-block" }} />
            <span style={{ fontWeight: 500 }}>{user?.profile?.full_name || user?.email || (isAicte ? "AICTE Administrator" : "Institution Administrator")}</span>
          </div>
        </header>

        {/* Page content */}
        <main style={{ flex: 1, overflowY: "auto", padding: "1.5rem" }}>
          {children}
        </main>
      </div>

      <style>{`
        @media (min-width: 768px) {
          .desktop-sidebar { display: block !important; }
        }
      `}</style>
    </div>
  );
}
