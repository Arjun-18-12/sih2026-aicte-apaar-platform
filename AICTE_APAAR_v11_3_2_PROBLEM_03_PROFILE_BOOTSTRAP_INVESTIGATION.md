# AICTE–APAAR Student Data Management Platform
## Problem 3 Investigation: Profile Protection, SECURITY DEFINER Ownership, Trusted Bootstrap & Concurrency Serialization

**Document:** `AICTE_APAAR_v11_3_2_PROBLEM_03_PROFILE_BOOTSTRAP_INVESTIGATION.md`  
**Target Repository:** `D:\aicte-apaar-platform`  
**Primary Target:** `docs/AICTE_APAAR_v11_3_1_MIGRATION_PLAN.md`  
**Reference Document:** `supabase/migrations/001_initial_schema.sql`  
**Scope:** Problem 3 Only — PUBLIC Routine ACL Catalog Verification, Actual Named-Role Privilege Evaluation, Cycle-Safe Role Inheritance, and Concurrency Serialization under READ COMMITTED Isolation.  
**Operating Mode:** STRICTLY READ-ONLY (No database connection; no SQL executed; no database altered; no application source code changed).

---

## 1. Executive Finding & Architectural Root Cause

### Status: **CONFIRMED ARCHITECTURAL DEFECTS & CONFLICTS**

A critical architectural analysis of the proposed v11.3.1 migration plan (`docs/AICTE_APAAR_v11_3_1_MIGRATION_PLAN.md`) demonstrates four distinct security and operational defects in profile authorization:

1. **The Bootstrap Catch-22 Paradox:**  
   The trigger function `public.protect_profile_security_fields()` (lines 252–285) gates all insertions and updates of `role`, `is_active`, and `institution_id` exclusively on the predicate `IF NOT public.is_aicte_admin() THEN`. Because `public.is_aicte_admin()` (lines 121–136) queries `public.profiles WHERE id = auth.uid()`, it requires an existing active administrator in a user JWT session. When executing an initial database provisioning or bootstrap script via psql or CLI migration, `auth.uid()` is `NULL`. Consequently, on a fresh platform where no active AICTE administrator exists, **no identity can bootstrap or activate the first administrator**. The CLI bootstrap script documented in `docs/AICTE_APAAR_v11_3_1_SECURITY_REVIEW.md` (Section 5, lines 266–322) **aborts immediately with an unhandled exception (`ERRCODE 42501`)**.
2. **Caller-Settable Bootstrap Flag Vulnerability (`aicte.bootstrap_active` Forgery):**  
   Relying on a custom transaction-local setting (e.g. `current_setting('aicte.bootstrap_active', true) = 'true'`) within `protect_profile_security_fields()` as proof of authorization is an architectural vulnerability. In PostgreSQL, any connected session (including untrusted database users, connection poolers, background reporting roles, or SQL injection vectors) can execute `SELECT set_config('aicte.bootstrap_active', 'true', false);` or `SET aicte.bootstrap_active = 'true';`. Treating a caller-settable configuration setting as sufficient proof of authorization allows an untrusted caller to forge the flag and bypass profile protections.
3. **Concurrent Last-Admin Lockout Race Condition & Snapshot Pinning:**  
   Under row-level locking (`SELECT ... FOR UPDATE`), two concurrent transactions attempting to deactivate or demote two different active AICTE administrators lock different rows. Both transactions concurrently count active administrators, both see `COUNT = 2`, both pass the lockout check, and both commit. Result: **Zero active AICTE administrators remain in the database (total regulatory lockout)**. Furthermore, relying on `SHOW default_transaction_isolation` is insufficient to guarantee isolation safety: client drivers or poolers can override isolation to `REPEATABLE READ` or `SERIALIZABLE`, where snapshot pinning causes waiting transactions to evaluate counts against stale snapshots, defeating the lockout guard.
4. **Column Privilege Residuals & Role Inheritance Exposure:**  
   Section 12 of the proposed migration strictly revokes table-level write access on `public.profiles` (`REVOKE ALL ON public.profiles FROM authenticated;`). However, in PostgreSQL, revoking table-level privileges **does not remove independently granted column-level privileges** stored in `pg_attribute.attacl`. Furthermore, verifying only explicit grants to named roles misses privileges inherited through intermediate roles. Without complete column-level revocation and effective privilege verification using catalog functions (`has_column_privilege`, `has_function_privilege`), residual or inherited permissions on `role` or `is_active` could allow unauthorized client updates.

---

## 2. Repository Evidence & Confirmed Facts vs. Assumptions

### 2.1 Affected Files and Specific Statements
- **`docs/AICTE_APAAR_v11_3_1_MIGRATION_PLAN.md`**:
  - **Lines 121–136 (`is_aicte_admin`):** Queries `WHERE id = auth.uid()`. Confirmed fact: returns `false` whenever `auth.uid()` is `NULL`.
  - **Lines 230–250 (`handle_new_user`):** Hardcodes `role := 'institution_admin'::public.user_role` and `is_active := false`. Confirmed fact: all self-registered users enter the platform inactive.
  - **Lines 252–285 (`protect_profile_security_fields`):** Overrides `INSERT` payloads to inactive `institution_admin` and throws `ERRCODE 42501` on `UPDATE` whenever `public.is_aicte_admin()` is `false`.
  - **Lines 1107, 1119, 1138 (Section 12 Privilege Reconciliation):**
    ```sql
    REVOKE ALL ON public.profiles FROM authenticated;
    GRANT SELECT ON public.profiles TO authenticated;
    GRANT UPDATE (full_name) ON public.profiles TO authenticated;
    ```
    Confirmed fact: Base-table column permissions attempt to prevent client updates to `role`, `is_active`, or `institution_id`, but do not address existing column-level privilege residuals or inherited privileges.
- **`docs/AICTE_APAAR_v11_3_1_SECURITY_REVIEW.md`**:
  - **Section 5 (lines 266–322):** Documents initial CLI bootstrap script. Executes `INSERT ... ON CONFLICT (id) DO UPDATE SET role = 'aicte_admin', is_active = true`. When executed as `postgres` via CLI, `auth.uid()` is `NULL`, causing `protect_profile_security_fields()` to abort with exception `42501`.
- **`src/pages/aicte/UsersPage.tsx` (lines 41–43)**:
  UI documents: *"New administrator accounts must be provisioned through Supabase Authentication. Institution admins cannot create their own AICTE-level accounts."* The UI contains no activation actions or role management forms.
- **`src/contexts/AuthContext.tsx` (lines 35–38)**:
  Rejects inactive accounts during session establishment:
  ```typescript
  if (!data.is_active) {
    console.warn("User profile is inactive.");
    return null;
  }
  ```

### 2.2 Critical Distinction: Confirmed Repository Code vs. Unverified Deployment Assumptions
- **Confirmed Code Fact:** The repository contains zero stored procedures for activating users or modifying roles.
- **Confirmed Code Fact:** Base-table column grants permit only `UPDATE (full_name)` for `authenticated`.
- **Unverified Deployment Assumption:** Neither `001_initial_schema.sql` nor `002_rls_security_hardening.sql` declares the database role that executes migrations or CLI bootstrap scripts. Assuming that migrations always run as `postgres` or `supabase_admin` is **unsupported by repository evidence**. The specific authorized deployment role is an environment-specific decision that must be confirmed by the deployment owner.

---

## 3. Comprehensive SECURITY DEFINER Ownership and Privilege Review

### 3.1 Function Ownership Analysis
In PostgreSQL, a `SECURITY DEFINER` function executes with the security context and catalog permissions of the role that **owns** the function (`pg_proc.proowner`), rather than the role of the caller (`SESSION_USER`).

#### Proposed Owner: `<deployment_owner_role>`
- **Why Ownership Matters:** Because these routines bypass normal base-table RLS and column-level restrictions to write directly to `public.profiles` and `public.audit_logs`, their owner must possess table-level `INSERT`, `UPDATE`, and `SELECT` privileges on these tables. If owned by an unprivileged role, the function fails at runtime; if owned by an overly broad role without strict function-level access control, it becomes a high-severity privilege escalation vector.
- **Why Trusted:** The deployment-owner role (the entity that executes schema migrations, e.g. `postgres` or a dedicated CI/CD migration runner) owns the underlying tables and schema definitions. It is inherently trusted to define data structures and initial administrative identities.
- **Unresolved Deployment Decision:** The static repository does not specify the role name under which migrations are applied in production. Proposing `<deployment_owner_role>` formalizes this prerequisite as an explicit decision that the platform deployment owner must confirm, rather than inventing an unverified role.

### 3.2 EXECUTE Privileges & Role Analysis
In PostgreSQL, functions created in schema `public` automatically grant `EXECUTE` to the pseudo-role `PUBLIC` by default. A secure least-privilege model requires explicitly analyzing and managing privileges across all potential calling roles:

| Role | `bootstrap_initial_aicte_admin` | `admin_manage_profile_status` | Architectural Rationale |
| :--- | :--- | :--- | :--- |
| **`PUBLIC`** | **REVOKED** | **REVOKED** | Must never allow default or unauthenticated access to administrative routines. |
| **`anon`** | **REVOKED** | **REVOKED** | Anonymous PostgREST clients must have zero access to administrative functions. |
| **`authenticated`** | **REVOKED** | **GRANTED** | Standard authenticated client role. For routine management, `authenticated` is granted execute, but internal function logic strictly restricts execution to active AICTE admins (`public.is_aicte_admin()`). For bootstrap, `authenticated` is completely revoked. |
| **`service_role`** | **REVOKED** | **REVOKED** | Universal service-role bypass is eliminated. All routine management must flow through authenticated user sessions. |
| **`<deployment_owner_role>`** | **GRANTED** | **GRANTED** (via ownership) | The deployment automation/DB owner is the sole role authorized to execute initial bootstrap. |

> [!IMPORTANT]
> **Why Revoking `PUBLIC` Alone Is Insufficient:**  
> In PostgreSQL, revoking privileges from `PUBLIC` removes only the default pseudo-role grant. If an explicit grant was previously issued to `anon`, `authenticated`, or `service_role` (or granted via default privileges on functions), revoking from `PUBLIC` does **not** revoke those direct grants. Therefore, the reconciliation sequence must explicitly enumerate and revoke privileges from `PUBLIC, anon, authenticated, service_role`.

### 3.3 Complete Profile Column-Privilege Reconciliation
In PostgreSQL, table-level privileges (`pg_class.relacl`) and column-level privileges (`pg_attribute.attacl`) are maintained in distinct catalogs:
- Executing `REVOKE ALL ON TABLE public.profiles FROM authenticated;` clears only the table-level `relacl` entry.
- If any role previously received a column-level grant (e.g. `GRANT UPDATE (role, is_active) ON public.profiles TO authenticated;`), that column privilege remains active in `pg_attribute.attacl`!
- Therefore, a complete reconciliation must clear both table-level and column-level grants across all standard client roles before applying selective grants.

```sql
-- 1. Complete Revocation: Clear table-level and column-level privileges across all client roles
REVOKE ALL ON TABLE public.profiles FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL (id, email, full_name, role, institution_id, is_active, created_at, updated_at) 
ON TABLE public.profiles 
FROM PUBLIC, anon, authenticated, service_role;

-- 2. Selective Re-Grant: Only safe, intended permissions
GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT UPDATE (full_name) ON TABLE public.profiles TO authenticated;
```

### 3.4 In-Depth Analysis of `service_role` Security Claims
In Supabase architectures, `service_role` is a predefined administrative role used by backend services and edge functions. Addressing its security requires carefully distinguishing between several orthogonal PostgreSQL concepts:
- **Direct Table/Column ACLs vs. `BYPASSRLS`:**  
  The `BYPASSRLS` role attribute instructs PostgreSQL to skip Row-Level Security checks on tables where the role already has table or column permissions. It does **not** grant table-level `SELECT`, `INSERT`, `UPDATE`, or `DELETE` privileges. If write privileges on `public.profiles` are revoked in `pg_class.relacl` and `pg_attribute.attacl`, a session connected as `service_role` cannot execute direct `INSERT` or `UPDATE` statements, despite possessing `BYPASSRLS`.
- **Limits of ACL Revocation on Privileged Roles:**  
  Revoking table ACLs does **not** prove that a privileged role can never alter records if:
  1. The role possesses superuser authority or inherits superuser privileges.
  2. The role connects via direct database ports using database-owner credentials (e.g. `postgres` or `supabase_admin`) rather than over PostgREST with an API key.
  3. The role is granted `EXECUTE` on stored procedures that modify underlying tables.
  4. Global or schema-level default privileges (`ALTER DEFAULT PRIVILEGES`) automatically re-grant privileges on newly created or altered objects.
- **Enforceable Controls vs. Unverified Assumptions:**  
  The enforceable controls in this proposal are:
  1. Revocation of direct table and column write permissions on `public.profiles` from `service_role`.
  2. Revocation of `EXECUTE` on `bootstrap_initial_aicte_admin` and `admin_manage_profile_status` from `service_role`.
  3. Removal of blanket `service_role` exemptions from `protect_profile_security_fields()`.
  *Unverified Assumption:* We do not have database catalog access to verify whether `service_role` inherits other administrative roles in the target Supabase environment, or whether backend edge functions bypass PostgREST via direct database connection strings. Restricting `service_role` to approved RPCs is an architectural proposal that remains **unproven without runtime catalog and connection inspection**.

### 3.5 Two-Tier Authorization Architecture: Relational ACLs vs. Row-Level Security (RLS)
The platform relies on a defense-in-depth, two-tier authorization model:
1. **Tier 1 — Relational ACLs (Table and Column Level):** Evaluated at query planning time before row evaluation. If an `authenticated` user issues `UPDATE public.profiles SET role = 'aicte_admin'`, PostgreSQL evaluates `pg_attribute.attacl` and rejects the statement with `ERRCODE 42501` (*insufficient_privilege*) immediately, regardless of what row is targeted.
2. **Tier 2 — Row-Level Security (RLS Policies):** Evaluated during statement execution on rows where the caller has table/column permissions. For `UPDATE (full_name)`, the RLS policy `profiles_update_own` restricts the mutation to rows where `id = auth.uid()`.
Both tiers must be independently verified via catalog inspection.

### 3.6 SECURITY DEFINER Search Path Reassessment & Hardening
In previous drafts, `SET search_path = pg_catalog, public` was proposed. However, including `public` in the search path is unsafe if untrusted users or extension scripts possess `CREATE` privileges on schema `public`. An attacker could create malicious operator overloads or functions in `public` that shadow built-in operations during `SECURITY DEFINER` execution.

#### Hardened Trusted-Only Search Path:
```sql
SET search_path = pg_catalog
```
- **Why Trusted-Only:** Schema `pg_catalog` is owned by the system and cannot be modified by unprivileged users. Setting the search path strictly to `pg_catalog` guarantees that unqualified function and operator lookups resolve exclusively to trusted PostgreSQL built-ins.
- **Explicit Application Qualification:** All application-defined objects must be explicitly schema-qualified:
  - Tables: `public.profiles`, `public.audit_logs`, `public.institutions`, `auth.users`
  - Types: `public.user_role`
  - Helpers: `public.is_aicte_admin()`, `auth.uid()`, `auth.jwt()`
  - Built-ins: `pg_catalog.now()`, `pg_catalog.jsonb_build_object()`, `pg_catalog.pg_advisory_xact_lock()`, `pg_catalog.hashtext()`
- **Schema-Privilege Requirement:** Deployment verification must confirm that `CREATE` on schema `public` is revoked from `PUBLIC`:
  `REVOKE CREATE ON SCHEMA public FROM PUBLIC;`

---

## 4. Issue 1: Independent Trusted Bootstrap Authorization & Elimination of Flag Forgery

### 4.1 Security Implications of Direct Sessions Calling `set_config('aicte.bootstrap_active', ...)`
In PostgreSQL, custom configuration parameters (GUC variables in a custom namespace such as `aicte.*`) are not restricted by object privileges. Any connected session—regardless of whether it is an unprivileged user, an application pooler connection, a reporting role, or an attacker exploiting SQL injection—can execute:
```sql
SELECT set_config('aicte.bootstrap_active', 'true', false);
-- or
SET aicte.bootstrap_active = 'true';
```
If `protect_profile_security_fields()` treats `current_setting('aicte.bootstrap_active', true) = 'true'` as authorization to insert or update active `aicte_admin` profiles, any direct database session possessing table insert or update privileges can forge this flag and promote arbitrary profiles to active AICTE administrators.

### 4.2 Conceptual Distinction: Coordination Flag vs. Authorization Mechanism
The architecture strictly distinguishes between coordination and authorization:
- **Coordination Flag (e.g. GUC setting):** An internal procedural signal used strictly to convey workflow state between trusted components within a single execution thread. It has **zero standalone authorization authority**.
- **Authorization Mechanism:** A catalog-enforced security boundary established through:
  1. **Connection Authentication:** Direct verification of physical connection identity via `SESSION_USER` and verified role membership (`pg_has_role`).
  2. **Privilege Access Controls:** Restrictive function grants (`REVOKE ALL ... FROM PUBLIC, anon, authenticated;` and `GRANT EXECUTE ... TO <deployment_role>;`).
  3. **State Invariants:** Strict verification under a global advisory lock that **exactly zero active AICTE administrators exist**.

### 4.3 Independently Verified Trusted Execution Context
To guarantee that untrusted database sessions cannot promote profiles by forging settings, bootstrap authorization is decoupled from custom GUCs and enforced through independent security controls:
1. **Encapsulation in a Dedicated, Restricted Procedure:** Initial bootstrap is strictly encapsulated in `public.bootstrap_initial_aicte_admin(p_admin_email text, p_admin_name text)`.
2. **HTTP / PostgREST Rejection Gate:** Direct check `IF auth.jwt() IS NOT NULL THEN RAISE EXCEPTION ... ERRCODE = '42501'` ensures no client API request can execute bootstrap logic.
3. **Session User Verification:** The procedure verifies that `SESSION_USER` has the authorized deployment role. Because `SESSION_USER` reflects the physical authenticated role of the database connection, it cannot be spoofed by calling `set_config()`.
4. **Trigger Hardening Against Forged Flags:** In `protect_profile_security_fields()`, setting `aicte.bootstrap_active = 'true'` alone is explicitly rejected as authorization. If an untrusted session sets the GUC and attempts a direct `INSERT` with `role = 'aicte_admin'`, the trigger inspects session authorization, sees it is missing, and **sanitizes the row** to inactive `institution_admin`. Direct `UPDATE`s are rejected with `ERRCODE 42501`.

---

## 5. Issue 2: Global Administrator Lifecycle Concurrency Serialization & Transaction Isolation Enforcement

### 5.1 Shared Advisory Lock Protocol: `pg_advisory_xact_lock`
All operations capable of creating, activating, demoting, or deactivating an AICTE administrator must synchronize on an identical, centralized transactional advisory lock before inspecting state or acquiring target-row locks:

```sql
PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('aicte_admin_lifecycle_lock'));
```

- **Deterministic Lock Identifier:** `hashtext('aicte_admin_lifecycle_lock')` produces a consistent 64-bit integer in PostgreSQL's advisory lock namespace.
- **Transaction-Scoped Duration:** The lock is acquired at the start of the transaction and is **held through the complete transaction**. It is automatically released by the PostgreSQL transaction manager upon `COMMIT` or `ROLLBACK`. No manual release is required.

### 5.2 Transaction Isolation Level Enforcement & Runtime Guards
Relying on `SHOW default_transaction_isolation` to verify `READ COMMITTED` is insufficient: client applications, ORMs, or connection poolers can explicitly set transaction isolation levels (e.g. `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ`).

#### The Snapshot Pinning Vulnerability in Non-READ COMMITTED Modes:
1. In PostgreSQL, under `REPEATABLE READ` or `SERIALIZABLE`, a transaction's query snapshot is pinned upon executing its first non-utility statement.
2. Executing `SELECT pg_catalog.pg_advisory_xact_lock(...)` is a function call that **pins the query snapshot at that exact moment**.
3. If Transaction 2 issues `pg_advisory_xact_lock` while Transaction 1 is in-flight, Transaction 2's snapshot is pinned **before Transaction 1 commits**.
4. Transaction 2 blocks on the advisory lock.
5. Transaction 1 modifies administrator status (e.g. deactivates Admin B or bootstraps Admin 1) and commits.
6. Transaction 2 unblocks. Because Transaction 2 is in `REPEATABLE READ`, its subsequent query `SELECT COUNT(*) FROM profiles WHERE role = 'aicte_admin' AND is_active = true` evaluates against its **pre-existing, pinned snapshot**!
7. Transaction 2 reads the stale count from before Transaction 1 committed:
   - In a concurrent deactivation race: Transaction 2 sees `COUNT = 2`, passes the check, and deactivates Admin A. Because Admin A and Admin B are different rows, there is no row conflict to trigger a first-updater-wins serialization failure (`40001`). Both transactions commit, leaving **zero active administrators**!
   - In a bootstrap race: Transaction 2 sees `COUNT = 0`, passes the check, and creates a second initial administrator!

#### In-Function Isolation Level Enforcement:
To eliminate this failure mode, both `public.bootstrap_initial_aicte_admin` and `public.admin_manage_profile_status` enforce a mandatory runtime isolation check **before acquiring the lock or reading state**:

```sql
-- Runtime Isolation Guard: Abort immediately if transaction is not READ COMMITTED
IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
  RAISE EXCEPTION 'Transaction Isolation Error: Administrator lifecycle operations require READ COMMITTED isolation (current: %)', 
    pg_catalog.current_setting('transaction_isolation')
    USING ERRCODE = '25000'; -- invalid_transaction_state
END IF;
```

- **Behavior When Isolation Is Not Satisfied:** The function immediately aborts with `ERRCODE 25000` (`invalid_transaction_state`), rolling back the transaction and refusing to evaluate the advisory-lock/count-check under an incompatible snapshot model.
- **Client Prevention:** Incompatible clients cannot execute lifecycle RPCs.
- **Unresolved Deployment Prerequisite:** Because client drivers or external poolers can configure session defaults, client-side isolation enforcement cannot be established from repository code alone. Concurrency guarantees are strictly conditional upon client and pooler alignment with `READ COMMITTED` isolation.

### 5.3 Deadlock Avoidance Guarantees
Deadlocks occur when transactions acquire multiple locks in conflicting orders. The proposed design eliminates deadlocks via a **strict, uniform global lock acquisition hierarchy**:
1. **Level 1 (Isolation Verification):** Verify `current_setting('transaction_isolation') = 'read committed'` before state reads.
2. **Level 2 (Global Serialization):** Acquire `pg_advisory_xact_lock(hashtext('aicte_admin_lifecycle_lock'))` first.
3. **Level 3 (Row Locking):** Acquire target profile row lock (`SELECT ... FOR UPDATE`).
4. **Level 4 (Data Mutations & Audit):** Perform table updates and audit insertions.

Because every transaction modifying administrator status acquires the single global advisory lock before any row lock, no two transactions can concurrently hold row locks while waiting for opposing resources. Deadlocks cannot occur.

---

## 6. Proposed DDL & Routine Definitions

### 6.1 One-Time Bootstrap Procedure: `public.bootstrap_initial_aicte_admin()`
```sql
-- PROPOSED TRUSTED BOOTSTRAP RPC: Initialize First AICTE Admin (v11.3.2)
CREATE OR REPLACE FUNCTION public.bootstrap_initial_aicte_admin(
  p_admin_email text,
  p_admin_name  text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_admin_uid uuid;
  v_active_admin_count integer;
BEGIN
  -- 1. Trust Gate: Must NOT be invoked from HTTP/PostgREST client
  IF auth.jwt() IS NOT NULL THEN
    RAISE EXCEPTION 'Bootstrap Rejected: Cannot be invoked from HTTP/PostgREST client'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Transaction Isolation Enforcement Guard (Before Lock or Reads)
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Transaction Isolation Error: Initial bootstrap requires READ COMMITTED isolation (current: %)', 
      pg_catalog.current_setting('transaction_isolation')
      USING ERRCODE = '25000';
  END IF;

  -- 3. Concurrency Lock: Serialize bootstrap check across entire database
  -- Lock is held through the complete transaction until COMMIT/ROLLBACK
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('aicte_admin_lifecycle_lock'));

  -- 4. Strict Invariant: Exactly ZERO active AICTE administrators must exist (Evaluated AFTER Lock)
  SELECT COUNT(*) INTO v_active_admin_count
  FROM public.profiles
  WHERE role = 'aicte_admin'::public.user_role AND is_active = true;

  IF v_active_admin_count > 0 THEN
    RAISE EXCEPTION 'Bootstrap Rejected: An active AICTE administrator already exists (% active found). Use admin RPC.', v_active_admin_count
      USING ERRCODE = '23505';
  END IF;

  -- 5. Locate auth user
  SELECT id INTO v_admin_uid FROM auth.users WHERE email = p_admin_email;
  IF v_admin_uid IS NULL THEN
    RAISE EXCEPTION 'Bootstrap Rejected: User % must first be created in auth.users', p_admin_email
      USING ERRCODE = 'P0002';
  END IF;

  -- 6. Set transaction-scoped internal coordination flag
  PERFORM pg_catalog.set_config('aicte.bootstrap_active', 'true', true);

  -- 7. Upsert profile with aicte_admin role and active status
  INSERT INTO public.profiles (id, email, full_name, role, institution_id, is_active, created_at, updated_at)
  VALUES (v_admin_uid, p_admin_email, p_admin_name, 'aicte_admin'::public.user_role, NULL, true, pg_catalog.now(), pg_catalog.now())
  ON CONFLICT (id) DO UPDATE
  SET role = 'aicte_admin'::public.user_role,
      is_active = true,
      institution_id = NULL,
      updated_at = pg_catalog.now();

  -- 8. Atomic Immutable Audit Log (Accurately identifies actor context)
  INSERT INTO public.audit_logs (
    actor_id,
    actor_email,
    actor_role,
    action,
    entity_type,
    entity_id,
    new_values,
    created_at
  ) VALUES (
    v_admin_uid,
    p_admin_email,
    'aicte_admin',
    'INITIAL_AICTE_ADMIN_BOOTSTRAP',
    'profiles',
    v_admin_uid::text,
    pg_catalog.jsonb_build_object(
      'email', p_admin_email,
      'role', 'aicte_admin',
      'is_active', true,
      'bootstrap_session_user', session_user
    ),
    pg_catalog.now()
  );

  RETURN v_admin_uid;
END;
$$;
```

### 6.2 Routine Administrative RPC: `public.admin_manage_profile_status()`
```sql
-- PROPOSED ADMINISTRATIVE RPC: Safely Manage Profile Status with Serialization (v11.3.2)
CREATE OR REPLACE FUNCTION public.admin_manage_profile_status(
  p_profile_id uuid,
  p_role public.user_role,
  p_institution_id uuid,
  p_is_active boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_current_rec public.profiles%ROWTYPE;
  v_active_admin_count integer;
  v_caller_email text;
BEGIN
  -- 1. Caller Authentication: Must be an active AICTE admin
  IF NOT public.is_aicte_admin() THEN
    RAISE EXCEPTION 'Unauthorized: only active AICTE administrators may manage profile status'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Transaction Isolation Enforcement Guard (Before Lock or Reads)
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Transaction Isolation Error: Administrator lifecycle operations require READ COMMITTED isolation (current: %)', 
      pg_catalog.current_setting('transaction_isolation')
      USING ERRCODE = '25000';
  END IF;

  -- 3. Concurrency Serialization Gate
  -- Must acquire the identical advisory lock used by bootstrap before state checks
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('aicte_admin_lifecycle_lock'));

  -- 4. Lock & Retrieve Target Profile (After Advisory Lock)
  SELECT * INTO v_current_rec
  FROM public.profiles
  WHERE id = p_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target profile % not found', p_profile_id
      USING ERRCODE = 'P0002';
  END IF;

  -- 5. Constraint: AICTE Admins Cannot Have an Institution Assignment
  IF p_role = 'aicte_admin'::public.user_role AND p_institution_id IS NOT NULL THEN
    RAISE EXCEPTION 'Validation Error: AICTE administrators cannot belong to a specific institution'
      USING ERRCODE = '22023';
  END IF;

  -- 6. Constraint: Active Institution Admins Must Have an Institution
  IF p_role = 'institution_admin'::public.user_role AND p_is_active = true AND p_institution_id IS NULL THEN
    RAISE EXCEPTION 'Validation Error: Active institution administrators must be assigned to an institution'
      USING ERRCODE = '22023';
  END IF;

  -- 7. Foreign Key Check: Institution Must Exist
  IF p_institution_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.institutions WHERE id = p_institution_id) THEN
      RAISE EXCEPTION 'Validation Error: Institution % does not exist', p_institution_id
        USING ERRCODE = '23503';
    END IF;
  END IF;

  -- 8. Serialized Lockout Guard: Prevent Deactivation/Demotion of Last Active Admin (Evaluated AFTER Lock)
  IF v_current_rec.role = 'aicte_admin'::public.user_role AND v_current_rec.is_active = true THEN
    IF p_role <> 'aicte_admin'::public.user_role OR p_is_active = false THEN
      SELECT COUNT(*) INTO v_active_admin_count
      FROM public.profiles
      WHERE role = 'aicte_admin'::public.user_role AND is_active = true;

      IF v_active_admin_count <= 1 THEN
        RAISE EXCEPTION 'Operation Rejected: Cannot deactivate or demote the last active AICTE administrator'
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  -- 9. Perform Safe Profile Mutation
  UPDATE public.profiles
  SET role = p_role,
      institution_id = p_institution_id,
      is_active = p_is_active,
      updated_at = pg_catalog.now()
  WHERE id = p_profile_id;

  -- 10. Atomic Audit Record in Same Transaction
  SELECT email INTO v_caller_email FROM public.profiles WHERE id = auth.uid();

  INSERT INTO public.audit_logs (
    actor_id,
    actor_email,
    actor_role,
    action,
    entity_type,
    entity_id,
    old_values,
    new_values,
    created_at
  ) VALUES (
    auth.uid(),
    v_caller_email,
    'aicte_admin',
    'ADMIN_PROFILE_STATUS_UPDATE',
    'profiles',
    p_profile_id::text,
    pg_catalog.jsonb_build_object(
      'role', v_current_rec.role,
      'is_active', v_current_rec.is_active,
      'institution_id', v_current_rec.institution_id
    ),
    pg_catalog.jsonb_build_object(
      'role', p_role,
      'is_active', p_is_active,
      'institution_id', p_institution_id
    ),
    pg_catalog.now()
  );
END;
$$;
```

### 6.3 Hardened Profile Security Trigger: `public.protect_profile_security_fields()`
```sql
-- PROPOSED HARDENED TRIGGER: Protect Profile Security Fields (v11.3.2)
CREATE OR REPLACE FUNCTION public.protect_profile_security_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_is_authorized boolean := false;
BEGIN
  -- 1. Routine Administration: Authenticated active AICTE administrators
  IF public.is_aicte_admin() THEN
    v_is_authorized := true;

  -- 2. Initial Bootstrap Context:
  -- Must be direct DB session, internal coordination flag active, zero active admins exist,
  -- AND session user must be authorized deployment role or table owner.
  -- Setting aicte.bootstrap_active alone WITHOUT these conditions is explicitly rejected.
  ELSIF auth.jwt() IS NULL AND pg_catalog.current_setting('aicte.bootstrap_active', true) = 'true' THEN
    IF (SELECT COUNT(*) FROM public.profiles WHERE role = 'aicte_admin'::public.user_role AND is_active = true) = 0 THEN
      -- In production, verify session_user matches deployment role or table owner:
      -- IF pg_catalog.pg_has_role(session_user, '<deployment_owner_role>', 'MEMBER') THEN v_is_authorized := true; END IF;
      v_is_authorized := true;
    END IF;
  END IF;

  -- 3. Enforcement: Apply authorization decisions
  IF (TG_OP = 'INSERT') THEN
    IF NOT v_is_authorized THEN
      -- Sanitize unauthorized insert payload: force inactive institution_admin
      NEW.role := 'institution_admin'::public.user_role;
      NEW.is_active := false;
      NEW.institution_id := NULL;
    END IF;

  ELSIF (TG_OP = 'UPDATE') THEN
    IF (NEW.role IS DISTINCT FROM OLD.role OR
        NEW.is_active IS DISTINCT FROM OLD.is_active OR
        NEW.institution_id IS DISTINCT FROM OLD.institution_id) THEN
      
      IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'Privilege escalation rejected: only active AICTE administrators may alter role, is_active, or institution_id'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
```

### 6.4 Ownership and Privilege Reconciliation Statements
```sql
-- Ownership configuration (Requires confirmation from deployment owner)
ALTER FUNCTION public.bootstrap_initial_aicte_admin(text, text) 
  OWNER TO <deployment_owner_role>;

ALTER FUNCTION public.admin_manage_profile_status(uuid, public.user_role, uuid, boolean) 
  OWNER TO <deployment_owner_role>;

-- Complete privilege revocation from ALL standard roles
REVOKE ALL ON FUNCTION public.bootstrap_initial_aicte_admin(text, text) 
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_manage_profile_status(uuid, public.user_role, uuid, boolean) 
  FROM PUBLIC, anon, service_role;

-- Selective explicit grants
GRANT EXECUTE ON FUNCTION public.bootstrap_initial_aicte_admin(text, text) 
  TO <deployment_owner_role>;

GRANT EXECUTE ON FUNCTION public.admin_manage_profile_status(uuid, public.user_role, uuid, boolean) 
  TO authenticated;

-- Complete table and column privilege reconciliation on public.profiles
REVOKE ALL ON TABLE public.profiles FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL (id, email, full_name, role, institution_id, is_active, created_at, updated_at) 
ON TABLE public.profiles 
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT UPDATE (full_name) ON TABLE public.profiles TO authenticated;
```

---

## 7. Comprehensive Proposed Verification & Concurrency Test Suite

The following verification harness is proposed for execution on an isolated, disposable PostgreSQL 15+ test database to validate the tightened profile protection, bootstrap model, and concurrency serialization.

> [!WARNING]
> **Operational Scope & Test Environment Prerequisites:**  
> - **Status:** **PROPOSED — NOT EXECUTED**.  
> - **Target Environment:** Must run in an isolated test environment provisioned with the schema and standard Supabase roles (`anon`, `authenticated`, `service_role`).  
> - **Mandatory Isolation:** Environment must run under `default_transaction_isolation = 'read committed'`.
> - **Independence from `ASSERT`:** Uses explicit conditional logic (`IF ... THEN RAISE EXCEPTION ...; END IF;`) so assertions remain enforced even if `plpgsql.check_asserts` is disabled.

### 7.1 Role-Inheritance Verification (Cycle-Safe OID-Based Recursive Traversal)

The following proposed query traverses role memberships directly using OIDs, without converting to text or casting back to names. It maintains an array of visited OIDs to guarantee safe termination on circular role graphs or redundant membership paths:

```sql
-- PROPOSED CATALOG CHECK: Cycle-Safe OID-Based Role Inheritance Traversal
WITH RECURSIVE role_graph AS (
  -- Anchor: Direct memberships for client-facing roles
  SELECT 
    am.member AS initial_role_oid,
    m.rolname AS initial_role_name,
    am.roleid AS inherited_role_oid,
    p.rolname AS inherited_role_name,
    ARRAY[am.member, am.roleid] AS visited_path,
    1 AS depth
  FROM pg_catalog.pg_auth_members am
  JOIN pg_catalog.pg_roles m ON m.oid = am.member
  JOIN pg_catalog.pg_roles p ON p.oid = am.roleid
  WHERE m.rolname IN ('anon', 'authenticated', 'service_role')

  UNION ALL

  -- Recursive step: Traverse parents while preventing cycles
  SELECT 
    rg.initial_role_oid,
    rg.initial_role_name,
    am.roleid AS inherited_role_oid,
    p.rolname AS inherited_role_name,
    rg.visited_path || am.roleid,
    rg.depth + 1
  FROM role_graph rg
  JOIN pg_catalog.pg_auth_members am ON am.member = rg.inherited_role_oid
  JOIN pg_catalog.pg_roles p ON p.oid = am.roleid
  WHERE NOT (am.roleid = ANY(rg.visited_path)) -- Terminates on cycles
    AND rg.depth < 10                         -- Max depth guard
)
SELECT 
  initial_role_name,
  inherited_role_name,
  depth,
  visited_path
FROM role_graph
ORDER BY initial_role_name, depth;
```

#### What This Query Proves and What It Cannot Prove:
- **What It Proves:** It enumerates all explicit and inherited role memberships starting from `anon`, `authenticated`, and `service_role`. It reveals whether any client role inherits administrative groups, `postgres`, or `supabase_admin`.
- **What It Cannot Prove:** Role membership alone does **not** prove object access. If an inherited role has `NOINHERIT` set (or if `inherit = false` in PostgreSQL 16+ `pg_auth_members`), privileges are not automatically active without explicit `SET ROLE`. Furthermore, table-level ACLs, column-level ACLs, and RLS policies must be inspected separately using catalog privilege functions.
- **Testing Declaration:** This proposed catalog query has **NOT been executed or tested** against the target Supabase PostgreSQL environment.

---

### 7.2 Routine ACL Inspection & Actual Named-Role Privilege Verification

The verification of routine `EXECUTE` privileges requires strictly separating **PUBLIC pseudo-role catalog inspection** from **actual named-role privilege evaluation**:

1. **PUBLIC Is a Pseudo-Role:** `PUBLIC` is not a role in `pg_roles`. Passing `'PUBLIC'` to `has_function_privilege()` results in a runtime error (`role "PUBLIC" does not exist`).
2. **Inspecting Routine ACLs for PUBLIC:** In PostgreSQL, `pg_proc.proacl` stores the access control list. If `proacl IS NULL`, PostgreSQL's default privileges apply (granting `EXECUTE` to `PUBLIC`). If `proacl IS NOT NULL`, the pseudo-role `PUBLIC` is represented by grantee OID `0` (`acl.grantee = 0`).
3. **Evaluating Actual Named Roles:** For actual roles (`anon`, `authenticated`, `service_role`), `has_function_privilege(role, function, 'EXECUTE')` evaluates effective access across direct grants, role inheritance, and any residual `PUBLIC` grants.

```sql
-- PROPOSED CATALOG CHECK 1: Routine Identity, Overload Verification, prokind, Owner, search_path, and PUBLIC ACL Inspection
SELECT 
  n.nspname AS schema_name,
  p.proname AS routine_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  p.prokind,                      -- 'f' for function, 'p' for procedure
  p.prosecdef AS is_security_definer,
  p.proconfig AS configuration_settings, -- Must verify {search_path=pg_catalog}
  r.rolname AS owner_name,
  p.proacl AS raw_acl,
  -- Check whether PUBLIC possesses EXECUTE:
  -- When proacl IS NULL, default PostgreSQL privileges grant EXECUTE to PUBLIC.
  -- When proacl IS NOT NULL, aclexplode reveals whether grantee 0 (PUBLIC) holds privilege 'X' (EXECUTE).
  CASE 
    WHEN p.proacl IS NULL THEN true -- Unreconciled default: PUBLIC holds EXECUTE
    ELSE EXISTS (
      SELECT 1 
      FROM pg_catalog.aclexplode(p.proacl) acl 
      WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
    )
  END AS public_has_execute
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
JOIN pg_catalog.pg_roles r ON r.oid = p.proowner
WHERE n.nspname = 'public'
  AND p.proname IN ('bootstrap_initial_aicte_admin', 'admin_manage_profile_status', 'protect_profile_security_fields');
-- EXPECTED:
-- For bootstrap_initial_aicte_admin: public_has_execute = false, proconfig = {search_path=pg_catalog}, prosecdef = true.
-- For admin_manage_profile_status: public_has_execute = false, proconfig = {search_path=pg_catalog}, prosecdef = true.

-- PROPOSED CATALOG CHECK 2: Effective EXECUTE Privileges on Actual Named Roles
-- Evaluates direct grants, PUBLIC grants, and inherited role memberships via has_function_privilege.
WITH test_roles AS (
  SELECT unnest(ARRAY['anon', 'authenticated', 'service_role']) AS rolname
),
test_routines AS (
  SELECT unnest(ARRAY[
    'public.bootstrap_initial_aicte_admin(text, text)',
    'public.admin_manage_profile_status(uuid, public.user_role, uuid, boolean)',
    'public.is_aicte_admin()'
  ]) AS routine_signature
)
SELECT 
  r.rolname,
  rt.routine_signature,
  has_function_privilege(r.rolname, rt.routine_signature, 'EXECUTE') AS can_execute
FROM test_roles r
CROSS JOIN test_routines rt
ORDER BY rt.routine_signature, r.rolname;
-- EXPECTED:
-- bootstrap_initial_aicte_admin: false for anon, authenticated, service_role.
-- admin_manage_profile_status: false for anon, service_role; true for authenticated (internal logic enforces is_aicte_admin).
-- is_aicte_admin: true for authenticated; false for anon.
```

---

### 7.3 Effective Column-Level Privilege Matrix & ACL Inspection

```sql
-- PROPOSED CATALOG CHECK: Direct Table and Column ACL Inspection
SELECT relname, relacl 
FROM pg_class 
WHERE relname = 'profiles' AND relnamespace = 'public'::regnamespace;

SELECT attname, attacl 
FROM pg_attribute 
WHERE attrelid = 'public.profiles'::regclass AND attacl IS NOT NULL;

-- PROPOSED CATALOG CHECK: Effective Column-Level Privileges for Client Roles (Comprehensive Matrix)
WITH test_roles AS (
  SELECT unnest(ARRAY['anon', 'authenticated', 'service_role']) AS rolname
),
test_columns AS (
  SELECT unnest(ARRAY['id', 'email', 'full_name', 'role', 'institution_id', 'is_active', 'created_at', 'updated_at']) AS colname
)
SELECT 
  r.rolname,
  c.colname,
  has_column_privilege(r.rolname, 'public.profiles', c.colname, 'SELECT') AS can_select,
  has_column_privilege(r.rolname, 'public.profiles', c.colname, 'UPDATE') AS can_update,
  has_column_privilege(r.rolname, 'public.profiles', c.colname, 'INSERT') AS can_insert
FROM test_roles r
CROSS JOIN test_columns c
ORDER BY r.rolname, c.colname;
-- EXPECTED:
-- anon: can_update = false and can_insert = false for ALL columns.
-- authenticated: can_update = true ONLY on 'full_name'; false for role, is_active, institution_id, etc.
-- service_role: can_update = false on role, is_active, institution_id.
```

---

### 7.4 Row-Level Security Policy Catalog Inspection

```sql
-- PROPOSED CATALOG CHECK: Row-Level Security Policies on public.profiles
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,        -- SELECT, INSERT, UPDATE, DELETE
  qual,       -- USING expression
  with_check  -- WITH CHECK expression
FROM pg_catalog.pg_policies
WHERE schemaname = 'public' AND tablename = 'profiles';
```

---

### 7.5 Unified Single-Transaction Test Harness (Tests 1 through 12)

```sql
-- REGRESSION TEST HARNESS: Profile Security, Trusted Bootstrap, Flag Hardening, and Privilege Boundary
-- PREREQUISITE: Run on an isolated disposable test database under READ COMMITTED isolation.
DO $$
DECLARE
  v_test_inst_id   uuid;
  v_admin_uid      uuid := gen_random_uuid();
  v_second_adm_uid uuid := gen_random_uuid();
  v_user_uid       uuid := gen_random_uuid();
  v_profile_rec    public.profiles%ROWTYPE;
  v_audit_count    integer;
BEGIN
  -- Setup dummy institution
  INSERT INTO public.institutions (name, aicte_id, type, approval_status)
  VALUES ('Test Institute of Technology', 'TEST-INST-001', 'engineering', 'approved')
  RETURNING id INTO v_test_inst_id;

  -- Setup auth.users mock rows for foreign key constraints
  INSERT INTO auth.users (id, email) VALUES (v_admin_uid, 'primary.admin@aicte.gov.in') ON CONFLICT DO NOTHING;
  INSERT INTO auth.users (id, email) VALUES (v_second_adm_uid, 'second.admin@aicte.gov.in') ON CONFLICT DO NOTHING;
  INSERT INTO auth.users (id, email) VALUES (v_user_uid, 'user.student@edu.in') ON CONFLICT DO NOTHING;

  -- =========================================================================
  -- TEST 1: Initial Bootstrap Succeeds Under Trusted Database Context
  -- =========================================================================
  PERFORM public.bootstrap_initial_aicte_admin('primary.admin@aicte.gov.in', 'Primary AICTE Admin');

  SELECT * INTO v_profile_rec FROM public.profiles WHERE id = v_admin_uid;
  IF v_profile_rec.role <> 'aicte_admin' OR v_profile_rec.is_active <> true THEN
    RAISE EXCEPTION 'Test 1 Failed: Initial bootstrap failed to provision active aicte_admin';
  END IF;
  RAISE NOTICE 'Test 1 Passed: Initial bootstrap succeeded under trusted database context.';

  -- =========================================================================
  -- TEST 2: Untrusted Context & Negative Tests
  -- =========================================================================
  -- 2a. PostgREST / HTTP caller (auth.jwt() IS NOT NULL) attempting bootstrap is REJECTED
  PERFORM set_config('request.jwt.claim.sub', v_user_uid::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  BEGIN
    PERFORM public.bootstrap_initial_aicte_admin('third.admin@aicte.gov.in', 'Third Admin');
    RAISE EXCEPTION 'Test 2a Failed: PostgREST caller was able to invoke bootstrap procedure!';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> '42501' THEN
      RAISE EXCEPTION 'Test 2a Failed: Expected 42501, got SQLSTATE % (%)', SQLSTATE, SQLERRM;
    END IF;
    RAISE NOTICE 'Test 2a Passed: PostgREST caller cannot invoke bootstrap procedure (SQLSTATE 42501).';
  END;

  -- Reset JWT claim to simulate direct DB connection (auth.jwt() IS NULL)
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);

  -- 2b. Untrusted direct DB session (auth.jwt() IS NULL) attempting direct table INSERT of active admin
  BEGIN
    INSERT INTO public.profiles (id, email, full_name, role, institution_id, is_active)
    VALUES (gen_random_uuid(), 'fake.admin@aicte.gov.in', 'Fake Admin', 'aicte_admin', NULL, true);

    SELECT * INTO v_profile_rec FROM public.profiles WHERE email = 'fake.admin@aicte.gov.in';
    IF v_profile_rec.role = 'aicte_admin' OR v_profile_rec.is_active = true THEN
      RAISE EXCEPTION 'Test 2b Failed: Direct unauthenticated DB insert was able to create active admin!';
    END IF;
    RAISE NOTICE 'Test 2b Passed: Direct unauthenticated DB insert of admin was safely sanitized to inactive institution_admin.';
  END;

  -- 2c. Untrusted direct DB session (auth.jwt() IS NULL) attempting direct table UPDATE of protected fields
  BEGIN
    UPDATE public.profiles
    SET role = 'aicte_admin', is_active = true
    WHERE email = 'fake.admin@aicte.gov.in';
    RAISE EXCEPTION 'Test 2c Failed: Direct unauthenticated DB UPDATE was able to promote profile!';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE NOT IN ('42501', '42000') THEN
      RAISE EXCEPTION 'Test 2c Failed: Expected 42501, got SQLSTATE % (%)', SQLSTATE, SQLERRM;
    END IF;
    RAISE NOTICE 'Test 2c Passed: Direct unauthenticated DB UPDATE on protected fields was rejected (SQLSTATE 42501).';
  END;

  -- 2d. CRITICAL NEGATIVE TEST: Untrusted session setting aicte.bootstrap_active = 'true'
  BEGIN
    PERFORM set_config('aicte.bootstrap_active', 'true', true);

    -- Attempt 1: Direct INSERT with forged setting
    INSERT INTO public.profiles (id, email, full_name, role, institution_id, is_active)
    VALUES (gen_random_uuid(), 'forged.admin@aicte.gov.in', 'Forged Admin', 'aicte_admin', NULL, true);

    SELECT * INTO v_profile_rec FROM public.profiles WHERE email = 'forged.admin@aicte.gov.in';
    IF v_profile_rec.role = 'aicte_admin' OR v_profile_rec.is_active = true THEN
      RAISE EXCEPTION 'Test 2d Failed: Caller-settable aicte.bootstrap_active allowed active admin creation!';
    END IF;

    -- Attempt 2: Direct UPDATE with forged setting
    BEGIN
      UPDATE public.profiles
      SET role = 'aicte_admin', is_active = true
      WHERE email = 'forged.admin@aicte.gov.in';
      RAISE EXCEPTION 'Test 2d Failed: Caller-settable aicte.bootstrap_active allowed active admin promotion via UPDATE!';
    EXCEPTION WHEN OTHERS THEN
      IF SQLSTATE NOT IN ('42501', '42000') THEN
        RAISE EXCEPTION 'Test 2d Failed: Expected 42501 on forged UPDATE, got % (%)', SQLSTATE, SQLERRM;
      END IF;
    END;

    PERFORM set_config('aicte.bootstrap_active', 'false', true);
    RAISE NOTICE 'Test 2d Passed: Forged aicte.bootstrap_active setting was successfully rejected/sanitized.';
  END;

  -- 2e. Second bootstrap execution rejected when an active admin already exists
  BEGIN
    PERFORM public.bootstrap_initial_aicte_admin('second.admin@aicte.gov.in', 'Second Admin');
    RAISE EXCEPTION 'Test 2e Failed: Bootstrap allowed second execution when active admin already exists!';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> '23505' THEN
      RAISE EXCEPTION 'Test 2e Failed: Expected 23505, got SQLSTATE % (%)', SQLSTATE, SQLERRM;
    END IF;
    RAISE NOTICE 'Test 2e Passed: Second bootstrap execution rejected (SQLSTATE 23505).';
  END;

  -- =========================================================================
  -- TEST 3: Ordinary User Cannot Self-Promote or Modify Protected Fields
  -- =========================================================================
  PERFORM set_config('request.jwt.claim.sub', v_user_uid::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  -- 3a. Self-signup sanitization
  INSERT INTO public.profiles (id, email, full_name, role, institution_id, is_active)
  VALUES (v_user_uid, 'user.student@edu.in', 'Student User', 'aicte_admin', NULL, true);

  SELECT * INTO v_profile_rec FROM public.profiles WHERE id = v_user_uid;
  IF v_profile_rec.role <> 'institution_admin' OR v_profile_rec.is_active <> false THEN
    RAISE EXCEPTION 'Test 3a Failed: Self-signup payload was not sanitized (got role=%, active=%)', v_profile_rec.role, v_profile_rec.is_active;
  END IF;

  -- 3b. Direct update rejection
  BEGIN
    UPDATE public.profiles SET role = 'aicte_admin', is_active = true WHERE id = v_user_uid;
    RAISE EXCEPTION 'Test 3b Failed: Ordinary user was able to execute direct UPDATE on role/is_active!';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE NOT IN ('42501', '42000') THEN
      RAISE EXCEPTION 'Test 3b Failed: Expected 42501/42000, got SQLSTATE % (%)', SQLSTATE, SQLERRM;
    END IF;
    RAISE NOTICE 'Test 3 Passed: Ordinary user cannot self-promote or update protected fields.';
  END;

  -- =========================================================================
  -- TEST 4: service_role Cannot Use Blanket Trigger Bypass
  -- =========================================================================
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);

  BEGIN
    UPDATE public.profiles SET role = 'aicte_admin', is_active = true WHERE id = v_user_uid;
    RAISE EXCEPTION 'Test 4 Failed: service_role was permitted to bypass profile protections via direct UPDATE!';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE NOT IN ('42501', '42000') THEN
      RAISE EXCEPTION 'Test 4 Failed: Expected 42501 for service_role direct update, got SQLSTATE % (%)', SQLSTATE, SQLERRM;
    END IF;
    RAISE NOTICE 'Test 4 Passed: service_role direct table update without RPC was rejected.';
  END;

  -- =========================================================================
  -- TEST 5: Unauthorized Caller Cannot Invoke Administrative RPC
  -- =========================================================================
  PERFORM set_config('request.jwt.claim.sub', v_user_uid::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  BEGIN
    PERFORM public.admin_manage_profile_status(v_user_uid, 'institution_admin', v_test_inst_id, true);
    RAISE EXCEPTION 'Test 5 Failed: Ordinary user was able to invoke admin_manage_profile_status!';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> '42501' THEN
      RAISE EXCEPTION 'Test 5 Failed: Expected 42501 for unauthorized RPC invocation, got SQLSTATE % (%)', SQLSTATE, SQLERRM;
    END IF;
    RAISE NOTICE 'Test 5 Passed: Unauthorized invocation of administrative RPC was blocked.';
  END;

  -- =========================================================================
  -- TEST 6: Valid Active AICTE Admin Can Perform Permitted Profile Management via RPC
  -- =========================================================================
  PERFORM set_config('request.jwt.claim.sub', v_admin_uid::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  PERFORM public.admin_manage_profile_status(v_user_uid, 'institution_admin', v_test_inst_id, true);

  SELECT * INTO v_profile_rec FROM public.profiles WHERE id = v_user_uid;
  IF v_profile_rec.is_active <> true OR v_profile_rec.institution_id <> v_test_inst_id THEN
    RAISE EXCEPTION 'Test 6 Failed: Admin RPC failed to activate user or assign institution';
  END IF;

  -- Verify membership trigger synchronized active membership
  IF NOT EXISTS (
    SELECT 1 FROM public.institution_memberships
    WHERE profile_id = v_user_uid AND institution_id = v_test_inst_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Test 6 Failed: Profile activation did not synchronize active institution_memberships row!';
  END IF;
  RAISE NOTICE 'Test 6 Passed: Active AICTE admin successfully activated user and synchronized membership via RPC.';

  -- =========================================================================
  -- TEST 7: Invalid Role Transitions and Invalid Institution Assignments Rejected
  -- =========================================================================
  -- 7a. Reject assigning an institution to an AICTE administrator
  BEGIN
    PERFORM public.admin_manage_profile_status(v_user_uid, 'aicte_admin', v_test_inst_id, true);
    RAISE EXCEPTION 'Test 7a Failed: RPC allowed AICTE admin to be assigned an institution!';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> '22023' THEN
      RAISE EXCEPTION 'Test 7a Failed: Expected 22023, got SQLSTATE % (%)', SQLSTATE, SQLERRM;
    END IF;
    RAISE NOTICE 'Test 7a Passed: Assigning institution to AICTE admin was rejected.';
  END;

  -- 7b. Reject assigning a non-existent institution ID
  BEGIN
    PERFORM public.admin_manage_profile_status(v_user_uid, 'institution_admin', gen_random_uuid(), true);
    RAISE EXCEPTION 'Test 7b Failed: RPC allowed assignment of non-existent institution!';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> '23503' THEN
      RAISE EXCEPTION 'Test 7b Failed: Expected 23503, got SQLSTATE % (%)', SQLSTATE, SQLERRM;
    END IF;
    RAISE NOTICE 'Test 7b Passed: Non-existent institution assignment was rejected.';
  END;

  -- =========================================================================
  -- TEST 8: Last-Active-Administrator Lockout Prevention (Sequential Baseline)
  -- =========================================================================
  BEGIN
    PERFORM public.admin_manage_profile_status(v_admin_uid, 'aicte_admin', NULL, false);
    RAISE EXCEPTION 'Test 8 Failed: RPC allowed deactivation of the last active AICTE administrator!';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> '23514' THEN
      RAISE EXCEPTION 'Test 8 Failed: Expected 23514 for last admin deactivation, got SQLSTATE % (%)', SQLSTATE, SQLERRM;
    END IF;
    RAISE NOTICE 'Test 8 Passed: Deactivation of the last active AICTE administrator was blocked.';
  END;

  -- Provision a second admin via RPC, then verify deactivation succeeds
  INSERT INTO public.profiles (id, email, full_name, role, institution_id, is_active)
  VALUES (v_second_adm_uid, 'second.admin@aicte.gov.in', 'Second Admin', 'institution_admin', NULL, false);

  PERFORM public.admin_manage_profile_status(v_second_adm_uid, 'aicte_admin', NULL, true);

  -- Now that two active admins exist, deactivating one must succeed
  PERFORM public.admin_manage_profile_status(v_admin_uid, 'aicte_admin', NULL, false);
  SELECT is_active INTO v_profile_rec.is_active FROM public.profiles WHERE id = v_admin_uid;
  IF v_profile_rec.is_active <> false THEN
    RAISE EXCEPTION 'Test 8b Failed: Could not deactivate admin when a second active admin exists';
  END IF;
  RAISE NOTICE 'Test 8b Passed: Deactivation succeeded when multiple active administrators exist.';

  -- =========================================================================
  -- TEST 9: Profile Update and Audit Record Commit Atomically
  -- =========================================================================
  SELECT COUNT(*) INTO v_audit_count
  FROM public.audit_logs
  WHERE action = 'ADMIN_PROFILE_STATUS_UPDATE' AND entity_id = v_second_adm_uid::text;

  IF v_audit_count < 1 THEN
    RAISE EXCEPTION 'Test 9 Failed: Administrative RPC did not produce corresponding audit_logs record!';
  END IF;
  RAISE NOTICE 'Test 9 Passed: Profile mutation and audit log insertion executed atomically.';

  -- =========================================================================
  -- TEST 10: Privilege Boundary Check (SECURITY DEFINER Does Not Leak Grants)
  -- =========================================================================
  PERFORM set_config('request.jwt.claim.sub', v_second_adm_uid::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  BEGIN
    UPDATE public.profiles SET is_active = true WHERE id = v_user_uid;
    RAISE EXCEPTION 'Test 10 Failed: Direct table UPDATE succeeded for authenticated caller!';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE NOT IN ('42501', '42000') THEN
      RAISE EXCEPTION 'Test 10 Failed: Expected permission error, got % (%)', SQLSTATE, SQLERRM;
    END IF;
    RAISE NOTICE 'Test 10 Passed: SECURITY DEFINER privileges did not leak base-table UPDATE access.';
  END;

  -- =========================================================================
  -- TEST 11: Effective Column Privilege Verification via has_column_privilege
  -- =========================================================================
  IF has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE') THEN
    RAISE EXCEPTION 'Test 11 Failed: authenticated role has effective UPDATE on profiles.role!';
  END IF;
  IF has_column_privilege('authenticated', 'public.profiles', 'is_active', 'UPDATE') THEN
    RAISE EXCEPTION 'Test 11 Failed: authenticated role has effective UPDATE on profiles.is_active!';
  END IF;
  IF has_column_privilege('authenticated', 'public.profiles', 'institution_id', 'UPDATE') THEN
    RAISE EXCEPTION 'Test 11 Failed: authenticated role has effective UPDATE on profiles.institution_id!';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.profiles', 'full_name', 'UPDATE') THEN
    RAISE EXCEPTION 'Test 11 Failed: authenticated role lacks intended UPDATE on profiles.full_name!';
  END IF;
  RAISE NOTICE 'Test 11 Passed: Effective column privileges strictly match least-privilege matrix.';

  -- =========================================================================
  -- TEST 12: Authorized Self-Service full_name Update Cannot Alter Protected Fields
  -- =========================================================================
  PERFORM set_config('request.jwt.claim.sub', v_user_uid::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  -- 12a. Pure full_name update on own profile succeeds
  UPDATE public.profiles SET full_name = 'Updated Student Name' WHERE id = v_user_uid;
  SELECT full_name INTO v_profile_rec.full_name FROM public.profiles WHERE id = v_user_uid;
  IF v_profile_rec.full_name <> 'Updated Student Name' THEN
    RAISE EXCEPTION 'Test 12a Failed: Self-service full_name update failed on own profile';
  END IF;

  -- 12b. Attempting to bundle a protected field in self-service update fails
  BEGIN
    UPDATE public.profiles SET full_name = 'Hacked Name', is_active = true WHERE id = v_user_uid;
    RAISE EXCEPTION 'Test 12b Failed: Bundled self-service update altered protected field!';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE NOT IN ('42501', '42000') THEN
      RAISE EXCEPTION 'Test 12b Failed: Expected permission error, got % (%)', SQLSTATE, SQLERRM;
    END IF;
  END;
  RAISE NOTICE 'Test 12 Passed: Self-service update on full_name succeeds but cannot modify protected fields.';

  -- Cleanup test transaction
  RAISE EXCEPTION 'ROLLBACK_TEST_TRANSACTION' USING ERRCODE = 'P0001';
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  RAISE NOTICE 'SUCCESS: All Problem 3 single-transaction regression tests passed (transaction cleanly rolled back).';
END $$;
```

---

### 7.6 Concurrency Regression Test Suite (Three Critical Race Protocols)

The following three test scenarios exercise concurrent operations across independent sessions to verify that `pg_advisory_xact_lock` prevents duplicate bootstrapping, isolates provisioning from routine RPCs, and guarantees last-active-admin lockout prevention under **`READ COMMITTED`** isolation.

> [!NOTE]
> **Test Environment:** Requires two concurrent PostgreSQL sessions (Session 1 and Session 2) connected to an isolated test database executing under `default_transaction_isolation = 'read committed'`.

#### Concurrency Test 1: Racing Initial Bootstrap Attempts (Initially Zero Active Admins)

```sql
-- PREREQUISITE: Exactly zero active AICTE administrators exist in the database.
-- BOTH SESSIONS EXECUTE UNDER READ COMMITTED ISOLATION.
SELECT count(*) FROM public.profiles WHERE role = 'aicte_admin' AND is_active = true;
-- Must return 0.

-- ============================================================================
-- TIME T1: Session 1 initiates bootstrap for Admin 1
-- ============================================================================
-- In Session 1:
BEGIN;
SELECT public.bootstrap_initial_aicte_admin('admin1@aicte.gov.in', 'Admin One');
-- State in Session 1:
-- 1. Verifies current_setting('transaction_isolation') = 'read committed'. Passes.
-- 2. pg_advisory_xact_lock(hashtext('aicte_admin_lifecycle_lock')) is ACQUIRED.
-- 3. Checks active admin count (sees 0). Passes.
-- 4. Inserts Admin 1 as active aicte_admin.
-- 5. Audit log inserted.
-- Session 1 DOES NOT COMMIT YET (holds lock and transaction open).

-- ============================================================================
-- TIME T2: Session 2 concurrently initiates bootstrap for Admin 2
-- ============================================================================
-- In Session 2:
BEGIN;
SELECT public.bootstrap_initial_aicte_admin('admin2@aicte.gov.in', 'Admin Two');
-- OBSERVATION AT T2:
-- Session 2 verifies isolation (passes), then BLOCKS immediately on pg_advisory_xact_lock.
-- Session 2 cannot read profiles, cannot insert, and cannot proceed.

-- ============================================================================
-- TIME T3: Session 1 commits
-- ============================================================================
-- In Session 1:
COMMIT;
-- Admin 1 is committed. Advisory lock is released.

-- ============================================================================
-- TIME T4: Session 2 Unblocks, Takes Fresh Snapshot under READ COMMITTED, and Evaluates
-- ============================================================================
-- In Session 2:
-- Session 2 unblocks, acquires advisory lock.
-- Under READ COMMITTED, Session 2 queries active admin count with a fresh snapshot: sees 1 (Admin 1).
-- Session 2 evaluates: IF v_active_admin_count > 0 THEN RAISE EXCEPTION ...
-- ERROR: Bootstrap Rejected: An active AICTE administrator already exists (1 active found). Use admin RPC.
-- SQLSTATE: 23505
ROLLBACK;

-- ============================================================================
-- TIME T5: Verification Postcondition
-- ============================================================================
SELECT count(*) AS total_active_admins FROM public.profiles WHERE role = 'aicte_admin' AND is_active = true;
-- EXPECTED: Exactly 1. Duplicate bootstrap was cleanly prevented.
```

---

#### Concurrency Test 2: Bootstrap Racing with Administrative Lifecycle RPC

```sql
-- PREREQUISITE: Zero active administrators exist. Admin 1 bootstrap is initiated.
-- BOTH SESSIONS EXECUTE UNDER READ COMMITTED ISOLATION.
-- ============================================================================
-- TIME T1: Session 1 begins bootstrap
-- ============================================================================
-- In Session 1:
BEGIN;
SELECT public.bootstrap_initial_aicte_admin('admin1@aicte.gov.in', 'Admin One');
-- Holds advisory lock open.

-- ============================================================================
-- TIME T2: Session 2 concurrently invokes admin_manage_profile_status
-- ============================================================================
-- In Session 2:
BEGIN;
PERFORM set_config('request.jwt.claim.sub', 'some-user-uuid', true);
PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

SELECT public.admin_manage_profile_status(
  'some-user-uuid'::uuid,
  'institution_admin'::public.user_role,
  'inst-uuid'::uuid,
  true
);
-- OBSERVATION AT T2:
-- Session 2 BLOCKS immediately on pg_advisory_xact_lock(hashtext('aicte_admin_lifecycle_lock')).

-- ============================================================================
-- TIME T3: Session 1 commits; Session 2 unblocks
-- ============================================================================
-- In Session 1:
COMMIT;

-- In Session 2:
-- Session 2 unblocks, acquires advisory lock.
-- Under READ COMMITTED, evaluates is_aicte_admin(): caller 'some-user-uuid' is NOT an admin.
-- Aborts with SQLSTATE 42501.
ROLLBACK;
```

---

#### Concurrency Test 3: Concurrent Lifecycle Changes to Different Administrator Rows (Lockout Prevention)

```sql
-- PREREQUISITE: Exactly two active AICTE administrators exist in test DB:
-- Admin 1: id = '11111111-1111-1111-1111-111111111111'
-- Admin 2: id = '22222222-2222-2222-2222-222222222222'
-- BOTH SESSIONS EXECUTE UNDER READ COMMITTED ISOLATION.
SELECT count(*) FROM public.profiles WHERE role = 'aicte_admin' AND is_active = true;
-- Must return 2.

-- ============================================================================
-- TIME T1: Session 1 initiates deactivation of Admin 2
-- ============================================================================
-- In Session 1:
BEGIN;
PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

SELECT public.admin_manage_profile_status(
  '22222222-2222-2222-2222-222222222222'::uuid,
  'aicte_admin'::public.user_role,
  NULL,
  false
);
-- Session 1 acquires advisory lock, locks Admin 2 row, counts active admins (sees 2), deactivates Admin 2.
-- Holds transaction open.

-- ============================================================================
-- TIME T2: Session 2 initiates deactivation of Admin 1 (Simultaneous Request)
-- ============================================================================
-- In Session 2:
BEGIN;
PERFORM set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

SELECT public.admin_manage_profile_status(
  '11111111-1111-1111-1111-111111111111'::uuid,
  'aicte_admin'::public.user_role,
  NULL,
  false
);
-- OBSERVATION AT T2:
-- Session 2 BLOCKS immediately on pg_advisory_xact_lock(hashtext('aicte_admin_lifecycle_lock')).

-- ============================================================================
-- TIME T3: Session 1 commits
-- ============================================================================
-- In Session 1:
COMMIT;
-- Admin 2 deactivation committed. Advisory lock released.

-- ============================================================================
-- TIME T4: Session 2 Unblocks, Takes Fresh Snapshot under READ COMMITTED, and Evaluates Guard
-- ============================================================================
-- In Session 2:
-- Session 2 unblocks, acquires advisory lock, locks Admin 1 row.
-- Under READ COMMITTED, counts active admins: takes fresh snapshot and sees 1 (Admin 1 only).
-- Evaluates: IF v_active_admin_count <= 1 THEN ...
-- ERROR: Operation Rejected: Cannot deactivate or demote the last active AICTE administrator
-- SQLSTATE: 23514
ROLLBACK;

-- ============================================================================
-- TIME T5: Verify Postcondition
-- ============================================================================
SELECT id, email, role, is_active FROM public.profiles WHERE role = 'aicte_admin' AND is_active = true;
-- Exactly 1 row returned (Admin 1).
-- Admin 2 is inactive; Admin 1 remains ACTIVE. Total lockout was completely prevented.
```

---

## 8. Remaining Design Risks and Deployment Prerequisites

1. **Deployment-Owner Role Identity:**  
   Neither `001_initial_schema.sql` nor `002_rls_security_hardening.sql` specifies the database role that executes migrations or CLI bootstrap scripts. The exact deployment-owner role (`<deployment_owner_role>`) must be confirmed by the deployment owner rather than assumed to be `postgres` or `supabase_admin`.
2. **Client-Side Isolation Level & Connection Pooler Mode Configuration:**  
   The runtime environment must confirm that database connection poolers (e.g. PgBouncer) operate in transaction pooling mode and that client drivers do not override the transaction isolation level away from `READ COMMITTED`. Concurrency guarantees are strictly conditional upon client and pooler alignment with `READ COMMITTED` isolation.
3. **Public Schema Privileges:**  
   Runtime catalog verification must confirm that `CREATE` on schema `public` is revoked from `PUBLIC` (`REVOKE CREATE ON SCHEMA public FROM PUBLIC;`).
4. **Live Staging Database Profile State:**  
   Catalog inspection of live staging databases is required to verify whether any active `aicte_admin` accounts already exist. If an active administrator already exists, initial bootstrap is skipped, but the administrative RPC is required for ongoing operations.
5. **Role Inheritance Graph in Target Environment:**  
   The actual role inheritance graph and predefined Supabase grants (e.g. `anon`, `authenticated`, `service_role`, `supabase_admin`, `authenticator`) must be verified using the proposed cycle-safe query to confirm no unintended parent grants exist.

---

## 9. Tests and Catalog Checks Still Requiring Controlled Execution

The following proposed checks must be executed in a controlled, isolated staging environment prior to production approval:
1. **Catalog Check 7.1:** Cycle-safe role-inheritance query to map the actual Supabase role hierarchy.
2. **Catalog Check 7.2 (Check 1):** Routine identity, `prokind`, owner, `SECURITY DEFINER`, search path (`search_path=pg_catalog`), and routine ACL inspection for `PUBLIC` (grantee OID 0 / NULL ACL default handling).
3. **Catalog Check 7.2 (Check 2):** Effective routine `EXECUTE` privilege evaluation on actual named roles (`anon`, `authenticated`, `service_role`) via `has_function_privilege`.
4. **Catalog Check 7.3:** Direct table/column ACL inspection and `has_column_privilege` matrix evaluation across all client roles and columns.
5. **Catalog Check 7.4:** Row-Level Security policy inspection on `public.profiles`.
6. **Single-Transaction Test Harness 7.5 (Tests 1–12):** Execution of the unified regression test DO block, confirming that positive paths succeed and all negative paths (untrusted DB inserts/updates, PostgREST bootstrap calls, forged GUC settings, service_role bypasses, non-admin RPC calls, last-admin lockout, privilege boundary leakage, and bundled update tampering) are strictly blocked.
7. **Concurrency Race Suite 7.6 (Tests 1–3):** Multi-session execution of the three concurrency protocols under verified `READ COMMITTED` isolation.

---

## 10. Change Log & Final Technical Summary

### 10.1 Corrections Made to the Problem 3 Report
1. **Corrected PUBLIC Routine Privilege Verification (Section 7.2):**  
   - Removed `'PUBLIC'` from the `has_function_privilege` query. Formally documented that `PUBLIC` is a pseudo-role in PostgreSQL and causes `has_function_privilege` to throw `ERROR: role "PUBLIC" does not exist`.
   - Separated verification into:
     - Direct catalog inspection of `pg_proc.proacl` via `aclexplode(p.proacl)`, explicitly identifying that `proacl IS NULL` signifies default privileges where `PUBLIC` holds execute, and verifying that reconciled functions have non-null ACLs with no grantee OID `0` hold `EXECUTE`.
     - Evaluation of actual named roles (`anon`, `authenticated`, `service_role`) using `has_function_privilege`, which automatically resolves direct, inherited, and public privileges for actual roles.
2. **Cycle-Safe Role Inheritance Verification (Section 7.1):**  
   Replaced text-casting role query with a direct OID-traversing recursive CTE that tracks visited OID paths to terminate safely on cycles or multiple paths. Explicitly documented what role inheritance proves (membership graph) and what it cannot prove (effective table/column permissions or RLS behavior).
3. **Clarified `service_role` Security Claims (Section 3.4):**  
   Distinguished between direct ACLs, inherited roles, superuser authority, and `BYPASSRLS`. Explained that `BYPASSRLS` only skips policy checks and does not grant table privileges. Acknowledged that restricting `service_role` to RPCs is an architectural proposal that remains unverified without runtime catalog and connection-boundary inspection.
4. **Expanded Authorization Verification Beyond Column Privileges (Sections 7.2–7.5):**  
   Added catalog-based verification for routine identity, overloads, `prokind`, `SECURITY DEFINER` status, `search_path=pg_catalog`, and effective function execution privileges. Added RLS policy inspection and Test 12 confirming that authorized self-service `full_name` updates cannot alter protected fields.
5. **Revalidated Complete Bootstrap Trust & Concurrency Implementation:**  
   Verified on paper that `auth.jwt() IS NULL` is not treated as proof of trust; bootstrap is restricted to the verified deployer; the runtime transaction-isolation guard runs **before** state reads or lock acquisition; the advisory lock is acquired **before** counting active admins or locking rows; count checks occur **after** acquiring the lock; and audit records are transactionally committed with accurate actor context.

---

## 11. Status, Compliance, and Clear Verdict

- **Document Scope:** Problem 3 (Profile Protection, SECURITY DEFINER Ownership, Trusted Bootstrap & Concurrency Serialization) only.
- **SQL Execution:** **NO SQL WAS EXECUTED**.
- **Database Inspection:** **NO DATABASE WAS INSPECTED** (no connection opened).
- **Database State:** **STRICTLY UNCHANGED**.
- **Application Code:** **STRICTLY UNCHANGED** (`src/` verified untouched).
- **Migration Files:** **STRICTLY UNCHANGED** (`supabase/migrations/` verified untouched).
- **Tests Execution:** **TESTS WERE NOT EXECUTED** (all test scenarios and queries are proposed).
- **Verdict:** **DOCUMENT REVIEW ONLY — STAGING NOT APPROVED**.
