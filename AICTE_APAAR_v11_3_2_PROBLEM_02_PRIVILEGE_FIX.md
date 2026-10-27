# AICTE–APAAR Student Data Management Platform
## Problem 2 Final Review: Routine Privilege Remediation & Evidence Verification

**Document:** `AICTE_APAAR_v11_3_2_PROBLEM_02_PRIVILEGE_FIX.md`  
**Target Repository:** `D:\aicte-apaar-platform`  
**Scope:** Minimal reviewable correction of routine-privilege reconciliation in Section 12 of `docs/AICTE_APAAR_v11_3_1_MIGRATION_PLAN.md`.  
**Operating Mode:** STRICTLY READ-ONLY (No database connection; no SQL executed; no database altered; no application source code changed).

---

## 1. Exact Original Statement and Location

- **File:** `docs/AICTE_APAAR_v11_3_1_MIGRATION_PLAN.md`
- **Section:** Section 4 (`002_rls_security_hardening.sql`), subsection **SECTION 12: STRICT RECONCILIATION OF TABLE & COLUMN PRIVILEGES (v11.3.1)**
- **Original Statement (Line 1104):**
  ```sql
  REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM PUBLIC, anon;
  ```
- **Immediate Context (Lines 1101–1105):**
  ```sql
  -- 1. Revoke all baseline public/anon grants across all 12 tables and sequences
  REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon;
  REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;
  REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM PUBLIC, anon;
  ```
- **Defect Identified:**  
  Line 1103 explicitly revoked sequence privileges from `PUBLIC, anon, authenticated`. However, line 1104 revoked routine privileges from `PUBLIC, anon` only, **omitting `authenticated`**. As a consequence, any pre-existing direct `EXECUTE` grants held by the `authenticated` role on routines in schema `public` (such as those established by default Supabase initialization templates) remained intact in the database catalog.

---

## 2. Proposed Minimal Replacement SQL & Execution Context

### 2.1 The Minimal Replacement Statement
Replace line 1104 with:

```sql
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM PUBLIC, anon, authenticated;
```

### 2.2 Execution Order Dependencies
1. **Post-Creation Placement:**  
   This statement must execute within the migration transaction *after* all routines in schema `public` have been created or replaced (Sections 4, 7, 8, 9, and 10), ensuring that all existing routines are captured by the schema-wide revocation.
2. **Sequential Prerequisite to Explicit Grants:**  
   This statement **must execute prior to** lines 1144–1148 (the explicit `GRANT EXECUTE` statements). If line 1104 were executed after lines 1144–1148, it would immediately revoke the permissions just granted to `authenticated`.

### 2.3 Surrounding SQL Block in Section 12
```sql
-- 1. Revoke all baseline public/anon/authenticated grants across tables, sequences, and routines
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM PUBLIC, anon, authenticated;

-- [Sections 2 through 5: Table and column privilege reconciliation]

-- 6. Explicit minimal function execution grants for authenticated
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_institution_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_aicte_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.correct_student_demographics(uuid, text, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enrol_student_atomic(uuid, uuid, text, uuid, text, text, date, text, text) TO authenticated;
```

---

## 3. Ownership and Revocation-Authority Analysis

### 3.1 Object Ownership in Static Repository Files
- An audit of `supabase/migrations/001_initial_schema.sql` and `docs/AICTE_APAAR_v11_3_1_MIGRATION_PLAN.md` reveals that **no `ALTER FUNCTION ... OWNER TO ...` statements exist anywhere in the repository**.
- In PostgreSQL, when an explicit `OWNER TO` statement is omitted, the owner of a function is automatically set to the role that executed the `CREATE FUNCTION` statement.
- **Critical Distinction:** It cannot be verified from repository files that all routines are owned by `postgres`. While local Supabase CLI environments typically run migrations as `postgres`, hosted Supabase platforms or enterprise pipelines may run migrations under `supabase_admin`, a CI/CD deployment role, or another administrative identity. Object ownership in any live database remains **UNVERIFIED without runtime catalog inspection**.

### 3.2 Revocation Authority and Execution Role Dependencies
Under PostgreSQL authorization rules, the ability of a session to successfully execute `REVOKE ... ON ALL ROUTINES IN SCHEMA public` depends on several factors:
1. **Object Ownership:** A role that owns a routine possesses inherent authority to revoke privileges on it.
2. **Grant Authority (`GRANTED BY` / `WITH GRANT OPTION`):** In PostgreSQL, a role can revoke privileges if that role (or a role it inherits) originally granted the privilege or holds the grant option.
3. **Role Memberships:** If the executing role is a member of the role that owns the objects, it inherits that ownership authority.
4. **Superuser / Administrative Privileges:** A superuser (such as `postgres` in a standard local instance) bypasses all permission checks and can revoke privileges on routines regardless of object ownership.

**Critical Limitations from Static Repository Analysis:**
- Repository files cannot establish the live database's object ownership.
- Repository files do not specify which database role will execute the migration script in staging or production.
- Consequently, static review **cannot prove that the proposed schema-wide revocation will succeed under the actual migration execution role**. If the migration is executed by a role that lacks ownership, grant authority, or superuser status over all routines in schema `public`, PostgreSQL will fail with permission errors or leave routines untouched.
- **Operational Requirement:** Migration execution authority must be verified against the live database catalog prior to deployment to ensure the executing session possesses the necessary ownership, grant authority, or superuser privileges to apply the schema-wide revocation.

---

## 4. Repository Evidence for the Five-Function Allowlist

A comprehensive audit was performed across all repository files to establish exact evidence for why the five functions require `EXECUTE` for `authenticated`, and why all other functions must be excluded.

### 4.1 Detailed Evidence for Each Granted Function

#### 1. `public.current_user_role()`
- **Definition:** `docs/AICTE_APAAR_v11_3_1_MIGRATION_PLAN.md`, lines 73–85:
  ```sql
  CREATE OR REPLACE FUNCTION public.current_user_role()
  RETURNS public.user_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid() AND is_active = true;
  $$;
  ```
- **Repository Dependencies:**
  - Evaluated in trigger functions: line 670 in `public.enforce_batch_state_transitions()` and line 743 in `public.enforce_enrolment_state_transitions()`.
  - Invoked directly by authenticated client sessions to check role status.
- **Verification Status:** **Verified from static files.** Required for client state evaluation and trigger execution.

#### 2. `public.current_user_institution_id()`
- **Definition:** `docs/AICTE_APAAR_v11_3_1_MIGRATION_PLAN.md`, lines 86–120:
  ```sql
  CREATE OR REPLACE FUNCTION public.current_user_institution_id()
  RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  ...
  ```
- **Repository Dependencies (RLS Policies):**
  - **Directly evaluated in 15 RLS policies in Section 11:**
    - Line 971: `memberships_select` (`institution_id = public.current_user_institution_id()`)
    - Line 979: `programmes_select` (`institution_id = public.current_user_institution_id()`)
    - Line 982: `programmes_inst_write` (`institution_id = public.current_user_institution_id()`)
    - Line 987: `intakes_select` (`institution_id = public.current_user_institution_id()`)
    - Line 998: `students_select` (`e.institution_id = public.current_user_institution_id()`)
    - Line 1005: `students_select` (`b.institution_id = public.current_user_institution_id()`)
    - Line 1012: `batches_select` (`institution_id = public.current_user_institution_id()`)
    - Line 1015: `batches_inst_insert` (`institution_id = public.current_user_institution_id()`)
    - Line 1018: `batches_update` (`institution_id = public.current_user_institution_id()`)
    - Line 1023: `enrolments_select` (`institution_id = public.current_user_institution_id()`)
    - Line 1026: `enrolments_update` (`institution_id = public.current_user_institution_id()`)
    - Line 1036: `errors_select` (`b.institution_id = public.current_user_institution_id()`)
    - Line 1046: `errors_inst_insert` (`b.institution_id = public.current_user_institution_id()`)
    - Line 1057: `verif_events_select` (`e.institution_id = public.current_user_institution_id()`)
    - Line 1068: `duplicate_cases_select` (`b.institution_id = public.current_user_institution_id()`)
    - Line 1080: `audit_logs_select` (`institution_id = public.current_user_institution_id()`)
- **Technical Requirement:** In PostgreSQL, RLS policy expressions are evaluated under the querying client's role (`authenticated`). If `authenticated` lacks `EXECUTE` on `current_user_institution_id()`, every tenant-scoped query immediately aborts with `ERROR: permission denied for function current_user_institution_id`.
- **Verification Status:** **Verified from static files.** Hard prerequisite for all tenant RLS operations.

#### 3. `public.is_aicte_admin()`
- **Definition:** `docs/AICTE_APAAR_v11_3_1_MIGRATION_PLAN.md`, lines 121–136:
  ```sql
  CREATE OR REPLACE FUNCTION public.is_aicte_admin()
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'aicte_admin'::public.user_role AND is_active = true
    );
  $$;
  ```
- **Repository Dependencies (RLS Policies):**
  - **Directly evaluated in 12 RLS policies in Section 11:**
    - Line 955: `profiles_select`
    - Line 958: `profiles_update`
    - Line 966: `institutions_admin_write`
    - Line 971: `memberships_select`
    - Line 974: `memberships_aicte_write`
    - Line 987: `intakes_select`
    - Line 990: `intakes_aicte_write`
    - Line 996: `students_select`
    - Line 1064: `duplicate_cases_select`
    - Line 1073: `duplicate_cases_update`
    - Line 1079: `audit_logs_select`
- **Verification Status:** **Verified from static files.** Mandatory for RLS evaluation across regulatory and administrative operations.

#### 4. `public.correct_student_demographics(uuid, text, date, text)`
- **Definition:** `docs/AICTE_APAAR_v11_3_1_MIGRATION_PLAN.md`, lines 308–362.
- **Repository Dependencies:**
  - Section 12 explicitly revokes table-level write access on `students` from `authenticated` (`REVOKE ALL ON public.students FROM authenticated;`).
  - Institutional administrators are barred from direct SQL updates to `students` and must call this procedure to perform controlled corrections on unverified records.
- **Verification Status:** **Verified from static files.** Required RPC for student demographic correction.

#### 5. `public.enrol_student_atomic(uuid, uuid, text, uuid, text, text, date, text, text)`
- **Definition:** `docs/AICTE_APAAR_v11_3_1_MIGRATION_PLAN.md`, lines 366–617.
- **Workflow Specification:** `docs/AICTE_APAAR_v11_3_1_CSV_WORKFLOW.md`, lines 334–345:
  ```typescript
  const { data, error } = await supabase.rpc('enrol_student_atomic', {
    p_institution_id: institutionId,
    p_programme_id: programmeId,
    p_academic_year: academicYear,
    p_batch_id: batchId,
    ...
  });
  ```
- **Repository Dependencies:**
  - Direct inserts on `enrolments` and `students` are revoked from `authenticated`.
  - Ingestion occurs strictly by invoking this RPC during chunked CSV upload processing.
- **Verification Status:** **Verified from static files.** Core operational RPC for batch enrolment.

### 4.2 Evidence for Excluding the Remaining Ten Functions
An audit of all remaining functions in `001_initial_schema.sql` and `002_rls_security_hardening.sql` reveals:
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

**Verified Architectural Fact:** All 10 of these routines are declared with **`RETURNS trigger`**. In PostgreSQL:
1. Triggers are executed internally by the database engine on table events.
2. The executing user performing DML does not need `EXECUTE` privileges on the trigger function.
3. If an authenticated user attempts to execute a trigger function directly via RPC or SQL (`SELECT public.sync_batch_record_counters();`), PostgreSQL aborts with `ERROR: a trigger function can only be called by a trigger`.
4. Therefore, **excluding these ten functions from `authenticated` is verified as technically correct**.

### 4.3 Claims That Cannot Be Established from Static Files
- **Live Database Extensions:** Static files do not reveal whether extensions (e.g., `pgcrypto`, `uuid-ossp`) installed additional functions into schema `public` on a live instance.
- **Frontend RPC Implementation State:** While `CSV_WORKFLOW.md` documents the proposed contract calling `enrol_student_atomic`, the current frontend file `src/pages/institution/CSVUploadPage.tsx` still contains legacy direct table inserts.

---

## 5. PostgreSQL Default Privileges & Limitations

### 5.1 Why Schema-Specific Default Revocations Are Insufficient
In PostgreSQL:
- An `ALTER DEFAULT PRIVILEGES IN SCHEMA public ...` statement issued without a `FOR ROLE` clause affects **only objects created by the current role executing the statement**.
- It does **not** alter default privileges for objects created by any other role.
- Furthermore, schema-specific default privileges cannot cancel or override global default privilege grants established at the database or role level.
- In standard PostgreSQL, newly created routines receive an implicit built-in grant of `EXECUTE TO PUBLIC` unless globally revoked for the object-creating role.

### 5.2 Appropriate Global Default-Privilege Revocation Syntax
To properly harden future routines created in schema `public`, the revocation must target each specific function-creating role at the global and schema level:

```sql
-- Appropriate syntax for a known function-creating role <creator_role>:
ALTER DEFAULT PRIVILEGES FOR ROLE <creator_role> IN SCHEMA public 
REVOKE EXECUTE ON ROUTINES FROM PUBLIC, anon, authenticated;

-- Global default privilege revocation (cancels global default grants for that role):
ALTER DEFAULT PRIVILEGES FOR ROLE <creator_role> 
REVOKE EXECUTE ON ROUTINES FROM PUBLIC, anon, authenticated;
```

### 5.3 Creator Roles Are UNVERIFIED from Repository Files
- **Static File Finding:** Neither `001_initial_schema.sql` nor `002_rls_security_hardening.sql` declares which database role executes migrations or creates schema objects.
- **Assumption Warning:** Asserting that `postgres` or `supabase_admin` creates all future routines is an unverified assumption. In hosted Supabase environments, administrative tasks may be executed by `supabase_admin`, migrations by `postgres`, and CI/CD pipelines by a dedicated deployment role.
- **Conclusion:** Because the actual function-creating roles cannot be verified from repository files, proposing a single default-privilege statement as a complete future-proofing fix is invalid. Any future-function hardening must be configured during deployment once the active DDL creator roles are confirmed.

---

## 6. Privilege Matrix: Verified Static Facts vs. Runtime Assumptions

| Database Role | Direct Privileges (Proposed DDL) | Inherited Privileges | Intended Effective Model | Verification Basis & Distinction |
|:---|:---|:---|:---|:---|
| **`PUBLIC`** | None (Revoked by Line 1104 & individual revokes) | None (Pseudo-role has no parents) | **Zero routine execution privileges.** | **Verified Code Fact:** Explicitly stripped by proposed DDL. |
| **`anon`** | None (Revoked by Line 1104) | Inherits from `PUBLIC` (which has zero) | **Zero routine execution privileges.** Cannot call public routines via REST RPC. | **Verified Code Fact:** Stripped by Line 1104. *(Assumes no custom inherited role memberships).* |
| **`authenticated`** | Limited strictly to the 5 explicitly granted routines (Lines 1144–1148) | Inherits from `PUBLIC` (which has zero) | **Strict least privilege.** Permitted to execute only the 5 authorized helpers and procedures. Direct execution of all trigger functions is blocked. | **Verified Code Fact:** Guaranteed by including `authenticated` in Line 1104 and re-granting Lines 1144–1148. *(Assumes no custom inherited role memberships).* |
| **`service_role`** | None in proposed DDL (Excluded from Line 1104 revocation) | Inherited from `PUBLIC` severed by Line 1104 | **UNVERIFIED.** Cannot be assumed to possess `EXECUTE` without external pre-existing direct grants. | **Unverified / Architectural Distinction:** Zero routine grants to `service_role` exist in the migration plan. Omitting it from revocation does not create a grant. If backend workers need execution, an explicit grant must be proposed separately. |
| **`postgres`** | Superuser / Object Owner | Bypasses permission checks | **Full unrestricted administrative privileges.** | **Verified Engine Fact:** Standard PostgreSQL superuser semantics. *(Assumes migration executes as superuser).* |

### 6.1 Critical Analysis of `service_role` Routine Privileges
A strict technical distinction must be maintained between explicit migration grants, external defaults, and unverified assumptions:
1. **Permission Explicitly Granted by Proposed Migration:**  
   The proposed migration (`docs/AICTE_APAAR_v11_3_1_MIGRATION_PLAN.md`) contains **zero `GRANT EXECUTE` statements for `service_role`**. All routine grants in Section 12 are scoped exclusively to `authenticated`.
2. **Permission Expected from External/Default Configurations:**  
   In standard PostgreSQL, functions are executable by `PUBLIC` by default. However, Line 1104 explicitly revokes `ALL ON ALL ROUTINES ... FROM PUBLIC`. Consequently, `service_role` can no longer inherit execution privileges via `PUBLIC`. While standard Supabase provisioning templates may grant broad schema access to `service_role`, such external configurations cannot be assumed to guarantee routine permissions on any given live instance.
3. **Status: UNVERIFIED:**  
   The fact that Line 1104 omits `service_role` from its revocation statement means `service_role` is not stripped of pre-existing direct grants, but it **does not prove that `service_role` possesses `EXECUTE` on `public.enrol_student_atomic(...)` or any other routine**.
4. **Required Action (No Silent Grants):**  
   If the approved backend architecture requires `service_role` (e.g., automated edge functions or ingestion workers) to execute `public.enrol_student_atomic(...)`, this grant must **not be added silently**. It is documented below as a **separate proposed DDL change requiring architectural review**:
   ```sql
   -- SEPARATE PROPOSED DDL FOR SERVICE_ROLE (Requires architectural review):
   -- GRANT EXECUTE ON FUNCTION public.enrol_student_atomic(uuid, uuid, text, uuid, text, text, date, text, text) TO service_role;
   ```

---

## 7. Proposed Regression-Test Specification (Isolated Staging Test)

The following verification harness is proposed for execution on an isolated, disposable PostgreSQL 15+ test database to validate effective routine permissions and eliminate privilege regression risks.

> [!WARNING]
> **Operational Scope & Test Environment Prerequisites:**  
> - **Status:** **PROPOSED ONLY — NOT EXECUTED**.  
> - **Execution Ordering:** This test harness must execute *strictly after* the proposed migration (specifically Section 12 of `002_rls_security_hardening.sql`) has completed, ensuring that all bulk revocations and explicit grants have taken effect.  
> - **Target Environment:** Must run in an isolated, disposable database containing the intended application schema and standard Supabase roles (`anon`, `authenticated`, `service_role`). Running against a local superuser-only database without these roles will invalidate privilege testing.  
> - **Scope & Limits:** The harness queries PostgreSQL catalogs (`pg_proc`, `has_function_privilege()`). It tests database authorization; it does not test HTTP network routing, PostgREST API exposure, or CORS configuration.  
> - **Independence from PL/pgSQL `ASSERT`:** All security checks use explicit conditional logic (`IF ... THEN RAISE EXCEPTION ...; END IF;`). The test will fail reliably even if `plpgsql.check_asserts` is disabled in PostgreSQL configuration.  
> - **Verification Incomplete Pending Execution:** Static review alone cannot guarantee runtime catalog state. **Verification remains INCOMPLETE until this test is actually executed in the isolated environment.** No SQL execution or database connection was performed during this review.

### 7.1 Catalog-Based Routine Enumeration (Unambiguous Routine Identity & Kind)
To ensure that no unexpected routine in schema `public` is executable by unauthorized roles, the harness dynamically queries `pg_proc` and `pg_namespace`:
- **Unambiguous Routine Identity (Differentiating Routine Kinds & Overloads):**  
  In PostgreSQL, matching on function name (`proname`) or displayed signature alone is insufficient. Routines can be overloaded with different parameter types, and PostgreSQL distinguishes between different routine kinds via `pg_proc.prokind`:
  - `'f'`: Normal function
  - `'p'`: Procedure
  - `'a'`: Aggregate function
  - `'w'`: Window function
  A routine must not pass the allowlist check merely because its name and displayed parameters match an approved entry. The catalog test constructs each routine's canonical, unambiguous identity incorporating routine kind, schema, name, and full argument identity types:
  ```sql
  format(
    '%s %I.%I(%s)',
    CASE p.prokind
      WHEN 'f' THEN 'FUNCTION'
      WHEN 'p' THEN 'PROCEDURE'
      WHEN 'a' THEN 'AGGREGATE'
      WHEN 'w' THEN 'WINDOW'
      ELSE 'ROUTINE'
    END,
    n.nspname,
    p.proname,
    pg_catalog.pg_get_function_identity_arguments(p.oid)
  )
  ```
- **Strict Role-Specific Coverage:**  
  1. **`authenticated` Policy:** Permitted to execute **only the five approved routine signatures** (all of which must be of kind `FUNCTION`), unless a formally approved exception is documented in the allowlist.  
  2. **`anon` Policy:** Permitted **zero routine execution privileges in schema `public`**. The five-function allowlist is strictly specific to `authenticated` and is **not** treated as allowed for `anon`. While the approved exception list for `anon` is currently empty, any future required extension routine must be explicitly reviewed, approved by security, and identified by its unambiguous routine identity rather than silently excluded.  
- **Explicit Extension Exceptions Policy (No Silent Filtering):**  
  If database extensions (such as `pgcrypto` or `uuid-ossp`) were installed directly into schema `public` instead of a dedicated `extensions` schema, their routines will be detected by these queries.  
  **Rule:** Such routines **must not be silently excluded** via ad-hoc filters (e.g., `WHERE proname NOT LIKE '...'`). Any extension routine that requires execution must be explicitly identified, evaluated against security policy, and recorded in a formally approved exceptions list.

### 7.2 Nature of Trigger-Function Privilege Assertions
Functions declared with `RETURNS trigger` are invoked internally by the PostgreSQL trigger manager during table mutations. In PostgreSQL:
- Trigger functions cannot be called as ordinary standalone routines via SQL or PostgREST RPC (`SELECT public.sync_batch_record_counters();` raises `ERROR: a trigger function can only be called by a trigger`), regardless of whether an `EXECUTE` grant exists.
- However, PostgreSQL still records `EXECUTE` grants for trigger routines in `pg_proc.proacl`. If left unrevoked, `authenticated` holds formal catalog privileges for functions it has no business executing.
- **Purpose of Checks:** The negative trigger-function checks below verify **catalog privilege state** (defense-in-depth and least privilege), not direct invocation mechanics.

### 7.3 Verification Script (Automated Test Block)

```sql
-- REGRESSION TEST: Verify Effective Routine Privileges in Isolated Test DB
-- PREREQUISITE: Run on an isolated staging database after applying Section 12 DDL.
-- NOTE: Uses explicit conditional checks with RAISE EXCEPTION to remain effective
--       even if plpgsql.check_asserts is disabled.
DO $$
DECLARE
  v_anon_unexpected_routines text[];
  v_anon_count integer;
  v_auth_unexpected_routines text[];
  v_auth_count integer;
  v_msg text;
BEGIN
  -- =========================================================================
  -- 1. DISCRETE CHECKS: ASSERT anon HAS NO ACCESS TO OPERATIONAL ROUTINES
  -- =========================================================================
  IF has_function_privilege('anon', 'public.enrol_student_atomic(uuid, uuid, text, uuid, text, text, date, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Security Violation: anon possesses EXECUTE on enrol_student_atomic';
  END IF;

  IF has_function_privilege('anon', 'public.correct_student_demographics(uuid, text, date, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Security Violation: anon possesses EXECUTE on correct_student_demographics';
  END IF;

  IF has_function_privilege('anon', 'public.current_user_role()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Security Violation: anon possesses EXECUTE on current_user_role';
  END IF;

  IF has_function_privilege('anon', 'public.current_user_institution_id()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Security Violation: anon possesses EXECUTE on current_user_institution_id';
  END IF;

  IF has_function_privilege('anon', 'public.is_aicte_admin()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Security Violation: anon possesses EXECUTE on is_aicte_admin';
  END IF;

  -- =========================================================================
  -- 2. DISCRETE CHECKS: ASSERT authenticated HAS ACCESS TO THE 5 ALLOWED ROUTINES
  -- =========================================================================
  IF NOT has_function_privilege('authenticated', 'public.current_user_role()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Assertion Failed: authenticated missing EXECUTE on current_user_role';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.current_user_institution_id()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Assertion Failed: authenticated missing EXECUTE on current_user_institution_id';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.is_aicte_admin()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Assertion Failed: authenticated missing EXECUTE on is_aicte_admin';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.correct_student_demographics(uuid, text, date, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Assertion Failed: authenticated missing EXECUTE on correct_student_demographics';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.enrol_student_atomic(uuid, uuid, text, uuid, text, text, date, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Assertion Failed: authenticated missing EXECUTE on enrol_student_atomic';
  END IF;

  -- =========================================================================
  -- 3. DISCRETE CHECKS: ASSERT authenticated CANNOT EXECUTE TRIGGER FUNCTIONS
  --    (Catalog privilege check: verifies absence of unneeded grants)
  -- =========================================================================
  IF has_function_privilege('authenticated', 'public.sync_batch_record_counters()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Security Violation: authenticated possesses catalog EXECUTE on sync_batch_record_counters';
  END IF;

  IF has_function_privilege('authenticated', 'public.audit_table_mutation_trigger()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Security Violation: authenticated possesses catalog EXECUTE on audit_table_mutation_trigger';
  END IF;

  IF has_function_privilege('authenticated', 'public.protect_profile_security_fields()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Security Violation: authenticated possesses catalog EXECUTE on protect_profile_security_fields';
  END IF;

  IF has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Security Violation: authenticated possesses catalog EXECUTE on handle_new_user';
  END IF;

  -- =========================================================================
  -- 4. COMPREHENSIVE CATALOG ENUMERATION: anon (ZERO-ROUTINE ACCESS POLICY)
  --    Enumerates every routine in schema public; fails if anon has EXECUTE
  --    on ANY routine. Incorporates pg_proc.prokind into routine identity.
  --    (Currently zero routines are approved for anon; approved exception list is empty)
  -- =========================================================================
  WITH public_routines AS (
    SELECT 
      p.oid,
      format(
        '%s %I.%I(%s)',
        CASE p.prokind
          WHEN 'f' THEN 'FUNCTION'
          WHEN 'p' THEN 'PROCEDURE'
          WHEN 'a' THEN 'AGGREGATE'
          WHEN 'w' THEN 'WINDOW'
          ELSE 'ROUTINE'
        END,
        n.nspname,
        p.proname,
        pg_catalog.pg_get_function_identity_arguments(p.oid)
      ) AS routine_identity
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  ),
  anon_accessible_routines AS (
    SELECT pr.routine_identity
    FROM public_routines pr
    WHERE has_function_privilege('anon', pr.oid, 'EXECUTE')
  )
  SELECT 
    COALESCE(array_agg(routine_identity ORDER BY routine_identity), '{}'::text[]),
    COUNT(*)
  INTO v_anon_unexpected_routines, v_anon_count
  FROM anon_accessible_routines;

  IF v_anon_count > 0 THEN
    v_msg := format(
      'Security Violation: %s routine(s) in schema public have effective EXECUTE for anon: %s. ' ||
      'Under the zero-trust policy, anon must have ZERO routine execution privileges in schema public. ' ||
      'If any of these are extension routines, they must not be silently excluded; any future exception must be formally evaluated, approved, and explicitly identified by its complete routine identity.',
      v_anon_count,
      array_to_string(v_anon_unexpected_routines, ', ')
    );
    RAISE EXCEPTION '%', v_msg;
  END IF;

  -- =========================================================================
  -- 5. COMPREHENSIVE CATALOG ENUMERATION: authenticated (FIVE-ROUTINE ALLOWLIST)
  --    Assert NO OTHER routine in schema public has EXECUTE for authenticated.
  --    Distinguishes routine kind (pg_proc.prokind) as well as schema, name,
  --    and full argument signature so that non-functions cannot match.
  -- =========================================================================
  WITH approved_allowlist(routine_identity) AS (
    VALUES
      ('FUNCTION public.current_user_role()'),
      ('FUNCTION public.current_user_institution_id()'),
      ('FUNCTION public.is_aicte_admin()'),
      ('FUNCTION public.correct_student_demographics(uuid, text, date, text)'),
      ('FUNCTION public.enrol_student_atomic(uuid, uuid, text, uuid, text, text, date, text, text)')
  ),
  public_routines AS (
    SELECT 
      p.oid,
      format(
        '%s %I.%I(%s)',
        CASE p.prokind
          WHEN 'f' THEN 'FUNCTION'
          WHEN 'p' THEN 'PROCEDURE'
          WHEN 'a' THEN 'AGGREGATE'
          WHEN 'w' THEN 'WINDOW'
          ELSE 'ROUTINE'
        END,
        n.nspname,
        p.proname,
        pg_catalog.pg_get_function_identity_arguments(p.oid)
      ) AS routine_identity
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  ),
  unauthorized_accessible_routines AS (
    SELECT pr.routine_identity
    FROM public_routines pr
    WHERE has_function_privilege('authenticated', pr.oid, 'EXECUTE')
      AND pr.routine_identity NOT IN (SELECT routine_identity FROM approved_allowlist)
  )
  SELECT 
    COALESCE(array_agg(routine_identity ORDER BY routine_identity), '{}'::text[]),
    COUNT(*)
  INTO v_auth_unexpected_routines, v_auth_count
  FROM unauthorized_accessible_routines;

  IF v_auth_count > 0 THEN
    v_msg := format(
      'Security Violation: %s unauthorized routine(s) in schema public have effective EXECUTE for authenticated: %s. ' ||
      'If any of these are required extension routines, they must be explicitly reviewed and documented in the approved exceptions list rather than silently excluded.',
      v_auth_count,
      array_to_string(v_auth_unexpected_routines, ', ')
    );
    RAISE EXCEPTION '%', v_msg;
  END IF;

  -- =========================================================================
  -- 6. STATUS OF service_role (EXPLICIT ARCHITECTURAL NOTE)
  -- =========================================================================
  -- The proposed migration does NOT grant EXECUTE to service_role on public.enrol_student_atomic.
  -- Line 1104 severed inheritance from PUBLIC. Therefore, service_role execution is NOT
  -- asserted as a guaranteed passing condition here.
  -- If service_role execution is required for edge functions/workers, an explicit grant:
  --   GRANT EXECUTE ON FUNCTION public.enrol_student_atomic(...) TO service_role;
  -- must be formally proposed and reviewed.
  IF has_function_privilege('service_role', 'public.enrol_student_atomic(uuid, uuid, text, uuid, text, text, date, text, text)', 'EXECUTE') THEN
    RAISE NOTICE 'INFO: service_role possesses EXECUTE on enrol_student_atomic (via external/default configuration).';
  ELSE
    RAISE NOTICE 'WARNING: service_role lacks EXECUTE on enrol_student_atomic. If backend workers require this RPC, an explicit grant DDL must be reviewed and applied.';
  END IF;

  RAISE NOTICE 'SUCCESS: All routine privilege conditional checks and catalog enumeration tests passed.';
END $$;
```

---

## 8. Final Disposition & Remaining Verification Requirements

### 8.1 Static Review Disposition
The minimal existing-routine correction:
```sql
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM PUBLIC, anon, authenticated;
```
is **FULLY SUPPORTED BY STATIC REPOSITORY REVIEW**. It directly resolves the omission on line 1104, restores defense-in-depth across the 10 internal trigger functions, and correctly preserves the five necessary helper and operational routines granted in lines 1144–1148.

### 8.2 Remaining Runtime Verification Requirements (Pre-Staging Checklist)
Before this migration can be deployed to staging, the following runtime checks must be performed against the active database catalog:
1. **Catalog Privilege Query:** Inspect `information_schema.routine_privileges` to confirm existing grants for `authenticated` prior to migration.
2. **Object Ownership & Revocation Authority Verification:** Query `pg_proc.proowner` for all routines in schema `public` to verify which role owns each function and confirm that the migration execution role possesses the necessary ownership, grant authority, or superuser privileges to revoke their privileges.
3. **Role Membership Inspection:** Query `pg_auth_members` to verify that `authenticated` has not been granted membership in `service_role` or another administrative role that could grant inherited permissions.
4. **Creator Role Confirmation:** Identify the actual role(s) used by CI/CD and manual administrators to apply DDL, in order to configure global `ALTER DEFAULT PRIVILEGES FOR ROLE <creator_role>` appropriately.
5. **Architectural Review of `service_role` Routine Grants:** Formally review whether backend workers or edge functions require direct `EXECUTE` on `public.enrol_student_atomic(...)` and, if so, submit the separate proposed `GRANT EXECUTE ... TO service_role` for staging approval.
6. **Disposable Sandbox Execution:** Execute the regression test script (including the `anon` zero-routine and `authenticated` 5-routine catalog enumeration checks) on a disposable staging instance to confirm all assertions pass.

---

## 9. Status and Compliance Declarations

- **Document Scope:** Problem 2 (Routine Privilege Reconciliation) only.
- **SQL Execution:** **NOT EXECUTED**.
- **Database Inspection:** **NOT EXECUTED**.
- **Database State:** **STRICTLY UNCHANGED** (No database connection made; no database modified).
- **Application Code:** **STRICTLY UNCHANGED** (No source files in `src/` modified).
- **Staging Status:** **PROPOSED ONLY — NOT DEPLOYED — NOT APPROVED FOR STAGING**.
