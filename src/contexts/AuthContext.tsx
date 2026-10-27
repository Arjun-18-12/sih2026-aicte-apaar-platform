import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import type { AuthUser, Profile } from "../types";

export type DemoRole = "aicte_admin" | "institution_admin";

export const SYNTHETIC_DEMO_AICTE_ADMIN: AuthUser = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "aicte.admin@demo.aicte.gov.in",
  profile: {
    id: "00000000-0000-0000-0000-000000000001",
    email: "aicte.admin@demo.aicte.gov.in",
    full_name: "Dr. S. K. Verma (AICTE Central Evaluator - Demo)",
    role: "aicte_admin",
    institution_id: undefined,
    is_active: true,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
};

export const SYNTHETIC_DEMO_INSTITUTION_ADMIN: AuthUser = {
  id: "00000000-0000-0000-0000-000000000002",
  email: "principal@srit.ac.in",
  profile: {
    id: "00000000-0000-0000-0000-000000000002",
    email: "principal@srit.ac.in",
    full_name: "Dr. Rajesh K. Mehta (Principal, SRIT - Demo)",
    role: "institution_admin",
    institution_id: "11111111-1111-1111-1111-111111111111", // Matches seed institution: Shri Ram Institute of Technology (DEMO)
    is_active: true,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
};

const DEMO_STORAGE_KEY = "aicte_synthetic_demo_role";
const DEMO_INST_STORAGE_KEY = "aicte_synthetic_demo_inst_id";

function getDemoInstitutionAdminUser(institutionId?: string): AuthUser {
  const activeInstId = institutionId || SYNTHETIC_DEMO_INSTITUTION_ADMIN.profile.institution_id;
  return {
    ...SYNTHETIC_DEMO_INSTITUTION_ADMIN,
    profile: {
      ...SYNTHETIC_DEMO_INSTITUTION_ADMIN.profile,
      institution_id: activeInstId,
    },
  };
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  isDemoMode: boolean;
  loginAsDemo: (role: DemoRole, specificInstId?: string) => void;
  switchDemoInstitution?: (institutionId: string) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDemoMode, setIsDemoMode] = useState(false);

  const fetchProfile = useCallback(async (userId: string, email: string): Promise<AuthUser | null> => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (error || !data) {
        console.warn("Failed to fetch profile from Supabase:", error?.message);
        return null;
      }

      if (!data.is_active) {
        console.warn("User profile is inactive.");
        return null;
      }

      return { id: userId, email, profile: data as Profile };
    } catch (err) {
      console.warn("fetchProfile unexpected error:", err);
      return null;
    }
  }, []);

  const loginAsDemo = useCallback((role: DemoRole, specificInstId?: string) => {
    try {
      sessionStorage.setItem(DEMO_STORAGE_KEY, role);
      if (role === "institution_admin") {
        if (specificInstId) {
          sessionStorage.setItem(DEMO_INST_STORAGE_KEY, specificInstId);
        } else {
          sessionStorage.removeItem(DEMO_INST_STORAGE_KEY);
        }
      }
    } catch (err) {
      console.warn("Could not persist demo role in sessionStorage:", err);
    }
    const demoUser = role === "aicte_admin"
      ? SYNTHETIC_DEMO_AICTE_ADMIN
      : getDemoInstitutionAdminUser(specificInstId);
    setUser(demoUser);
    setIsDemoMode(true);
    setLoading(false);
  }, []);

  const switchDemoInstitution = useCallback((newInstId: string) => {
    if (!isDemoMode) return;
    try {
      sessionStorage.setItem(DEMO_INST_STORAGE_KEY, newInstId);
    } catch (err) {
      console.warn("Could not persist demo institution ID in sessionStorage:", err);
    }
    setUser(getDemoInstitutionAdminUser(newInstId));
  }, [isDemoMode]);

  const refreshProfile = useCallback(async () => {
    try {
      const savedRole = sessionStorage.getItem(DEMO_STORAGE_KEY) as DemoRole | null;
      if (savedRole === "aicte_admin") {
        setUser(SYNTHETIC_DEMO_AICTE_ADMIN);
        setIsDemoMode(true);
        return;
      }
      if (savedRole === "institution_admin") {
        const savedInstId = sessionStorage.getItem(DEMO_INST_STORAGE_KEY) || undefined;
        setUser(getDemoInstitutionAdminUser(savedInstId));
        setIsDemoMode(true);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const authUser = await fetchProfile(session.user.id, session.user.email ?? "");
        if (authUser) {
          setUser(authUser);
          setIsDemoMode(false);
        } else {
          await supabase.auth.signOut();
          setUser(null);
          setIsDemoMode(false);
        }
      }
    } catch (e) {
      console.warn("refreshProfile error:", e);
    }
  }, [fetchProfile]);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const savedRole = sessionStorage.getItem(DEMO_STORAGE_KEY) as DemoRole | null;
        if (savedRole === "aicte_admin" || savedRole === "institution_admin") {
          if (mounted) {
            const savedInstId = sessionStorage.getItem(DEMO_INST_STORAGE_KEY) || undefined;
            setUser(savedRole === "aicte_admin" ? SYNTHETIC_DEMO_AICTE_ADMIN : getDemoInstitutionAdminUser(savedInstId));
            setIsDemoMode(true);
            setLoading(false);
          }
          return;
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (mounted && session?.user) {
          const authUser = await fetchProfile(session.user.id, session.user.email ?? "");
          if (mounted) {
            if (authUser) {
              setUser(authUser);
              setIsDemoMode(false);
            } else {
              // Profile invalid or inactive: terminate session
              await supabase.auth.signOut();
              setUser(null);
              setIsDemoMode(false);
            }
          }
        }
      } catch (e) {
        console.warn("Supabase auth session restore error:", e);
      }
      if (mounted) setLoading(false);
    };

    init();

    try {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
        if (!mounted) return;

        // In synthetic demo mode, do not let background Supabase events clobber demo session
        const savedRole = sessionStorage.getItem(DEMO_STORAGE_KEY);
        if (savedRole) return;

        if (session?.user) {
          const authUser = await fetchProfile(session.user.id, session.user.email ?? "");
          if (mounted) {
            if (authUser) {
              setUser(authUser);
              setIsDemoMode(false);
            } else {
              await supabase.auth.signOut();
              setUser(null);
              setIsDemoMode(false);
            }
          }
        } else {
          if (mounted) {
            setUser(null);
            setIsDemoMode(false);
          }
        }
        if (mounted) setLoading(false);
      });

      return () => {
        mounted = false;
        subscription.unsubscribe();
      };
    } catch {
      return () => { mounted = false; };
    }
  }, [fetchProfile]);

  const signIn = async (email: string, password: string): Promise<{ error: string | null }> => {
    try {
      sessionStorage.removeItem(DEMO_STORAGE_KEY);
      sessionStorage.removeItem(DEMO_INST_STORAGE_KEY);
      setIsDemoMode(false);

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        return { error: error.message };
      }

      if (!data?.user) {
        return { error: "Authentication failed. No user record returned." };
      }

      const authUser = await fetchProfile(data.user.id, data.user.email ?? email.trim());
      if (!authUser) {
        // Ensure unverified / inactive user is signed out immediately
        await supabase.auth.signOut();
        setUser(null);
        return {
          error: "Account profile not found or inactive. Please contact an AICTE administrator.",
        };
      }

      setUser(authUser);
      return { error: null };
    } catch (err: any) {
      await supabase.auth.signOut().catch(() => {});
      setUser(null);
      return { error: err.message || "Failed to connect to authentication server." };
    }
  };

  const signOut = async () => {
    try {
      sessionStorage.removeItem(DEMO_STORAGE_KEY);
      sessionStorage.removeItem(DEMO_INST_STORAGE_KEY);
    } catch {}
    setUser(null);
    setIsDemoMode(false);
    try {
      await supabase.auth.signOut();
    } catch {}
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut, refreshProfile, isDemoMode, loginAsDemo, switchDemoInstitution }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
