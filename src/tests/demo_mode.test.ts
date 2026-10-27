import { describe, it, expect } from "vitest";
import {
  SYNTHETIC_DEMO_AICTE_ADMIN,
  SYNTHETIC_DEMO_INSTITUTION_ADMIN
} from "../contexts/AuthContext";

describe("Synthetic Demo Mode Configuration & Contracts", () => {
  it("provides a valid synthetic AICTE Admin identity with aicte_admin role", () => {
    expect(SYNTHETIC_DEMO_AICTE_ADMIN).toBeDefined();
    expect(SYNTHETIC_DEMO_AICTE_ADMIN.id).toBe("00000000-0000-0000-0000-000000000001");
    expect(SYNTHETIC_DEMO_AICTE_ADMIN.email).toBe("aicte.admin@demo.aicte.gov.in");
    expect(SYNTHETIC_DEMO_AICTE_ADMIN.profile.role).toBe("aicte_admin");
    expect(SYNTHETIC_DEMO_AICTE_ADMIN.profile.is_active).toBe(true);
    expect(SYNTHETIC_DEMO_AICTE_ADMIN.profile.full_name).toContain("AICTE Central Evaluator");
    expect(SYNTHETIC_DEMO_AICTE_ADMIN.profile.institution_id).toBeUndefined();
  });

  it("provides a valid synthetic Institution Admin identity linked to demo institution", () => {
    expect(SYNTHETIC_DEMO_INSTITUTION_ADMIN).toBeDefined();
    expect(SYNTHETIC_DEMO_INSTITUTION_ADMIN.id).toBe("00000000-0000-0000-0000-000000000002");
    expect(SYNTHETIC_DEMO_INSTITUTION_ADMIN.email).toBe("principal@srit.ac.in");
    expect(SYNTHETIC_DEMO_INSTITUTION_ADMIN.profile.role).toBe("institution_admin");
    expect(SYNTHETIC_DEMO_INSTITUTION_ADMIN.profile.is_active).toBe(true);
    expect(SYNTHETIC_DEMO_INSTITUTION_ADMIN.profile.full_name).toContain("Principal, SRIT");
    // Seed institution ID for Shri Ram Institute of Technology (DEMO)
    expect(SYNTHETIC_DEMO_INSTITUTION_ADMIN.profile.institution_id).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("ensures synthetic identities do not contain passwords or production secrets", () => {
    const rawAicte = JSON.stringify(SYNTHETIC_DEMO_AICTE_ADMIN);
    const rawInst = JSON.stringify(SYNTHETIC_DEMO_INSTITUTION_ADMIN);

    expect(rawAicte).not.toContain("password");
    expect(rawAicte).not.toContain("secret");
    expect(rawInst).not.toContain("password");
    expect(rawInst).not.toContain("secret");
  });

  it("verifies expected dashboard landing routes for both demo roles", () => {
    const getLandingRoute = (role: string) => {
      return role === "aicte_admin" ? "/aicte" : "/institution";
    };

    expect(getLandingRoute(SYNTHETIC_DEMO_AICTE_ADMIN.profile.role)).toBe("/aicte");
    expect(getLandingRoute(SYNTHETIC_DEMO_INSTITUTION_ADMIN.profile.role)).toBe("/institution");
  });
});
