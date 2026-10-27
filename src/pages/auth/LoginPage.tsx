import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, Eye, EyeOff, AlertCircle, Building2, ArrowRight } from "lucide-react";
import { useAuth, DemoRole } from "../../contexts/AuthContext";

export default function LoginPage() {
  const { signIn, loginAsDemo } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: signInError } = await signIn(email, password);
    setLoading(false);
    if (signInError) {
      setError(signInError);
      return;
    }
    navigate("/");
  };

  const handleDemoLogin = (role: DemoRole) => {
    loginAsDemo(role);
    navigate(role === "aicte_admin" ? "/aicte" : "/institution");
  };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #1e3a8a 0%, #1e40af 40%, #1d4ed8 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
      <div style={{ width: "100%", maxWidth: 460 }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div style={{ width: 64, height: 64, background: "rgba(255,255,255,0.15)", borderRadius: "1rem", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.25rem" }}>
            <Shield size={32} color="white" />
          </div>
          <h1 style={{ fontSize: "1.625rem", fontWeight: 800, color: "white", letterSpacing: "-0.025em", marginBottom: "0.375rem" }}>
            AICTE–APAAR Platform
          </h1>
          <p style={{ color: "rgba(255,255,255,0.8)", fontSize: "0.9375rem" }}>
            Centralized Student Data Management &amp; Verification System
          </p>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem", marginTop: "0.75rem", padding: "0.375rem 0.875rem", background: "rgba(245,158,11,0.2)", border: "1px solid rgba(245,158,11,0.4)", borderRadius: "9999px" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#fde68a", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Institutional Verification System
            </span>
          </div>
        </div>

        {/* Card */}
        <div style={{ background: "white", borderRadius: "1rem", padding: "2rem", boxShadow: "0 25px 50px rgba(0,0,0,0.25)" }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--color-neutral-900)", marginBottom: "1.5rem" }}>
            Sign In to Your Account
          </h2>

          {error && (
            <div className="alert alert-error" style={{ marginBottom: "1.25rem" }}>
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: "1rem" }}>
              <label htmlFor="email" className="form-label">Email Address</label>
              <input
                id="email"
                type="email"
                className="form-input"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@institution.edu.in"
                required
                autoFocus
              />
            </div>
            <div style={{ marginBottom: "1.5rem" }}>
              <label htmlFor="password" className="form-label">Password</label>
              <div style={{ position: "relative" }}>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  className="form-input"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  style={{ paddingRight: "2.75rem" }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--color-neutral-400)", display: "flex", alignItems: "center" }}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <button type="submit" className="btn btn-primary btn-lg" style={{ width: "100%" }} disabled={loading}>
              {loading ? <span className="spinner" style={{ width: 18, height: 18 }} /> : null}
              {loading ? "Signing In..." : "Sign In"}
            </button>
          </form>

          {/* Divider */}
          <div style={{ margin: "1.75rem 0 1.25rem", position: "relative", textAlign: "center" }}>
            <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: "1px", background: "var(--color-neutral-200)" }} />
            <span style={{ position: "relative", background: "white", padding: "0 0.75rem", fontSize: "0.6875rem", color: "var(--color-neutral-500)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Demo Access
            </span>
          </div>

          {/* Demo Access Box */}
          <div
            id="synthetic-demo-section"
            style={{
              background: "var(--color-neutral-50)",
              border: "1px solid var(--color-neutral-200)",
              borderRadius: "0.75rem",
              padding: "1.125rem",
            }}
          >
            <div style={{ marginBottom: "0.75rem" }}>
              <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--color-neutral-700)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Select Role to Continue
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
              <button
                type="button"
                id="demo-login-aicte"
                onClick={() => handleDemoLogin("aicte_admin")}
                className="btn btn-outline"
                style={{
                  width: "100%",
                  justifyContent: "space-between",
                  padding: "0.625rem 0.875rem",
                  background: "white",
                  borderColor: "var(--color-neutral-300)",
                  textAlign: "left",
                  borderRadius: "0.5rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0 }}>
                  <div style={{ width: 32, height: 32, borderRadius: "0.375rem", background: "var(--color-primary-50)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Shield size={18} color="var(--color-primary-700)" />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--color-neutral-900)" }}>
                      AICTE Administrator (Demo)
                    </div>
                    <div style={{ fontSize: "0.6875rem", color: "var(--color-neutral-500)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      Central Oversight &amp; Audit
                    </div>
                  </div>
                </div>
                <ArrowRight size={16} style={{ color: "var(--color-neutral-400)", flexShrink: 0 }} />
              </button>

              <button
                type="button"
                id="demo-login-institution"
                onClick={() => handleDemoLogin("institution_admin")}
                className="btn btn-outline"
                style={{
                  width: "100%",
                  justifyContent: "space-between",
                  padding: "0.625rem 0.875rem",
                  background: "white",
                  borderColor: "var(--color-neutral-300)",
                  textAlign: "left",
                  borderRadius: "0.5rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0 }}>
                  <div style={{ width: 32, height: 32, borderRadius: "0.375rem", background: "var(--color-success-50)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Building2 size={18} color="var(--color-success-700)" />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--color-neutral-900)" }}>
                      Institution Administrator (Demo)
                    </div>
                    <div style={{ fontSize: "0.6875rem", color: "var(--color-neutral-500)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      Institution Operations &amp; Enrolment Management
                    </div>
                  </div>
                </div>
                <ArrowRight size={16} style={{ color: "var(--color-neutral-400)", flexShrink: 0 }} />
              </button>
            </div>
          </div>
        </div>

        <p style={{ textAlign: "center", color: "rgba(255,255,255,0.7)", fontSize: "0.8125rem", marginTop: "1.5rem" }}>
          AICTE–APAAR Student Data Management Platform
        </p>
      </div>
    </div>
  );
}
