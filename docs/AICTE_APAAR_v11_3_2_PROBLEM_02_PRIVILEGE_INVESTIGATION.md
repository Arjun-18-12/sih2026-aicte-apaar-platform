# AICTE–APAAR Student Data Management Platform
## Privilege Investigation Report: Problem 2 — Existing Routine Privileges for `authenticated`

**Document:** `AICTE_APAAR_v11_3_2_PROBLEM_02_PRIVILEGE_INVESTIGATION.md`  
**Target Repository:** `D:\aicte-apaar-platform`  
**Scope:** Investigate reported concern regarding `REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM PUBLIC, anon;` and whether `authenticated` was omitted, allowing pre-existing routine EXECUTE grants to remain.  
**Operating Mode:** STRICTLY READ-ONLY (No files modified; no SQL executed; no database altered).

---

## 1. Exact File Names and Line References

### 1.1 Migration Plan (`docs/AICTE_APAAR_v11_3_1_MIGRATION_PLAN.md`)
- **Primary Revocation Statement:**  
  Section 4 (`002_rls_security_hardening.sql`), subsection **SECTION 12: STRICT RECONCILIATION OF TABLE & COLUMN PRIVILEGES (v11.3.1)**:
  - **Line 1104:** `REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM PUBLIC, anon;`
- **Selective Function Grants:**  
  Subsection **SECTION 12**, lines 1144 to 1148:
  - **Line 1144:** `GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;`
  - **Line 1145:** `GRANT EXECUTE ON FUNCTION public.current_user_institution_id() TO authenticated;`
  - **Line 1146:** `GRANT EXECUTE ON FUNCTION public.is_aicte_admin() TO authenticated;`
  - **Line 1147:** `GRANT EXECUTE ON FUNCTION public.correct_student_demographics(uuid, text, date, text) TO authenticated;`
  - **Line 1148:** `GRANT EXECUTE ON FUNCTION public.enrol_student_atomic(uuid, uuid, text, uuid, text, text, date, text, text) TO authenticated;`
- **Individual Function Revocations in Earlier Sections:**
  - **Lines 142–144:** Revokes `current_user_role()`, `current_user_institution_id()`, and `is_aicte_admin()` from `PUBLIC` only.
  - **Line 364:** Revokes `correct_student_demographics(...)` from `PUBLIC` only.
  - **Line 620:** Revokes `enrol_student_atomic(...)` from `PUBLIC` only.
- **Rollback Script Invariant:**  
  Section 5 (`002_rollback.sql`), line 1348:
  - **Line 1348:** `GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated, anon;`

### 1.2 Baseline Migration (`supabase/migrations/001_initial_schema.sql`)
- Contains function definitions for:
  - `update_updated_at()` (lines 38–43)
  - `handle_new_user()` (lines 207–222)
  - `current_user_role()` (lines 438–444)
  - `current_user_institution_id()` (lines 446–452)
- Contains **no explicit GRANT or REVOKE statements** for routines or tables. Privileges in baseline rely entirely on Supabase/PostgreSQL default role provisioning.

---

## 2. Relevant Original SQL Excerpts

### 2.1 From `docs/AICTE_APAAR_v11_3_1_MIGRATION_PLAN.md` (Section 12, Lines 1101–1105)
```sql
-- 1. Revoke all baseline public/anon grants across all 12 tables and sequences
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM PUBLIC, anon;
```

### 2.2 From `docs/AICTE_APAAR_v11_3_1_MIGRATION_PLAN.md` (Section 12, Lines 1143–1148)
```sql
-- 6. Function execution grants
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_institution_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_aicte_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.correct_student_demographics(uuid, text, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enrol_student_atomic(uuid, uuid, text, uuid, text, text, date, text, text) TO authenticated;
```

### 2.3 Contrast with Sequence Revocation (Line 1103 vs. Line 1104)
```sql
-- On sequences, authenticated is explicitly revoked:
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;

-- On routines, authenticated is omitted:
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM PUBLIC, anon;
```

---

## 3. Concise Privilege Matrix for Routines in Schema `public`

The table below catalogs what the proposed v11.3.1 migration explicitly revokes, explicitly grants, and what pre-existing privileges remain for each database role:

| Database Role | Privileges Revoked by Migration | Privileges Explicitly Granted by Migration | Pre-Existing Privileges That Remain Active |
|:---|:---|:---|:---|
| **`PUBLIC`** | **`REVOKE ALL ON ALL ROUTINES`** (Line 1104) + individual revokes on 5 functions | None | **None**. All inherited and direct routine privileges stripped. |
| **`anon`** | **`REVOKE ALL ON ALL ROUTINES`** (Line 1104) | None | **None**. Cannot execute any routine in schema `public`. |
| **`authenticated`** | **NONE.** (`authenticated` is completely omitted from line 1104 and has no routine revokes) | **`EXECUTE` on 5 specific routines:**<br>1. `current_user_role()`<br>2. `current_user_institution_id()`<br>3. `is_aicte_admin()`<br>4. `correct_student_demographics(...)`<br>5. `enrol_student_atomic(...)` | **ALL PRE-EXISTING DIRECT GRANTS REMAIN.**<br>If `authenticated` was previously granted `ALL ON ALL ROUTINES` (the standard Supabase template default), it retains direct `EXECUTE` on **all** trigger functions and pre-existing routines in schema `public`. |

---

## 4. Additional Material Findings

1. **Supabase Standard Initialization Defaults:**  
   In standard Supabase PostgreSQL environments, initial project provisioning grants:
   ```sql
   GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role;
   ```
   Because line 1104 only revokes from `PUBLIC` and `anon`, any pre-existing grant given directly to `authenticated` remains completely untouched in the PostgreSQL `pg_proc` / `information_schema.routine_privileges` catalog.

2. **Trigger Functions Affected:**  
   The proposed migration defines 10 internal trigger functions:
   - `update_updated_at()`
   - `handle_new_user()`
   - `sync_profile_membership_state()`
   - `protect_profile_security_fields()`
   - `guard_student_initial_verification_state()`
   - `sync_batch_record_counters()`
   - `enforce_batch_state_transitions()`
   - `protect_batch_reviewer_fields()`
   - `enforce_enrolment_state_transitions()`
   - `audit_table_mutation_trigger()`  
   While PostgreSQL prevents direct SQL execution of functions declared with `RETURNS trigger` (`ERROR: a trigger function can only be called by a trigger`), omitting `authenticated` from the routine revocation violates the principle of least privilege and allows direct execution of any non-trigger utility routines that exist or may be created in schema `public`.

3. **Default Privileges (`ALTER DEFAULT PRIVILEGES`):**  
   Neither baseline `001` nor proposed `002` includes an `ALTER DEFAULT PRIVILEGES` statement for routines. Consequently, if any new function is subsequently created in schema `public`, it will automatically inherit default execute grants.

4. **Internal Structural Contradiction:**  
   The explicit grants in lines 1144–1148 (`GRANT EXECUTE ON FUNCTION ... TO authenticated`) demonstrate that the migration author intended a **"revoke-all, then grant only required functions"** security model (identical to the pattern applied to sequences in line 1103). Omitting `authenticated` from line 1104 renders lines 1144–1148 completely redundant if `authenticated` already retains blanket routine execution privileges.

---

## 5. Conclusion

**THE REPORTED CONCERN IS CONFIRMED.**

1. The proposed v11.3.1 migration plan line 1104 explicitly states:
   `REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM PUBLIC, anon;`
   and **omits `authenticated`**.
2. No other statement in the migration revokes routine execution privileges from the `authenticated` role.
3. In any Supabase or PostgreSQL environment where `authenticated` possessed pre-existing routine grants, those grants **remain in effect**, allowing `authenticated` to retain execute privileges on all routines in schema `public` rather than being restricted to the intended five functions.

---

## 6. Validation Status

- **Database Privilege Inspection:** **NOT EXECUTED**.  
  No query was run against `information_schema.routine_privileges` or `pg_proc` on an active database. Findings are based exclusively on static inspection of repository migration files.
- **SQL Execution:** **NOT EXECUTED**.  
  No SQL statements were executed.
- **Database State:** **UNCHANGED**.  
  No database was altered, connected to, or modified.
- **Remediation Status:** **NOT IMPLEMENTED**.  
  Per strict instructions, no remediation patch or file edits were applied.
