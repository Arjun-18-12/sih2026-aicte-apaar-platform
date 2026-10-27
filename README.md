# AICTE–APAAR Institution-to-AICTE Student Data Management Platform

A centralized data management, verification, and supervisory platform connecting AICTE-approved institutions with the All India Council for Technical Education (AICTE).

The platform enables institutions to upload student enrolment records during admissions, validates them against approved intake capacity and supernumerary quotas, flags duplicate student identities and cross-institution conflicts, tracks simulated APAAR identity verification, and provides AICTE administrators with review and approval workflows.

---

## 🚀 Local interface preview

You can preview the interface locally. A database-connected upload requires a configured Supabase project, authenticated user, active institution membership, and the reviewed database functions.

### 1. Install & Run Locally
```bash
# In D:\aicte-apaar-platform
npm install
npm run dev
```
Open your browser at: **`http://localhost:5173`**

The application does not use a demo-login bypass. Sign in with a Supabase Auth account that has a valid, active profile.

---

## 🛠️ Step-by-Step Manual Setup Guide (Supabase PostgreSQL & Auth)

When you are ready to connect to your live Supabase cloud database, follow these steps:

### Step 1: Use the existing Supabase Project
1. Do not recreate the project, rerun `001_initial_schema.sql`, or seed the database.
2. Follow `docs/SUPABASE_MANUAL_DEPLOYMENT.md` for the required read-only checks, administrator provisioning, reviewed migration, and staging verification sequence.

### Step 2: Apply Only Reviewed Follow-up Migrations
`supabase/migrations/002_security_hardening_and_batch_provisioning.sql` is a follow-up migration for the existing schema. It must be reviewed and verified in staging before production use.

### Step 3: Configure Environment Variables
1. In your project directory, copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. In Supabase Dashboard, go to **Project Settings** > **API**.
3. Copy:
   - **Project URL** -> `VITE_SUPABASE_URL`
   - **anon / public key** -> `VITE_SUPABASE_ANON_KEY`
4. Update your `.env` file:
   ```env
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```
5. Restart your dev server (`npm run dev`).

### Step 4: Provision Administrators Safely
Create each user in Supabase Authentication, then follow the owner-only provisioning and membership steps in `docs/SUPABASE_MANUAL_DEPLOYMENT.md`. Never assign an AICTE role from browser-controlled signup metadata or use the old synthetic demo accounts.

---

## 🧪 Testing & Synthetic Sample Datasets

Synthetic CSV test files are located in `public/samples/` and can be downloaded directly from the **CSV Upload Wizard** (`/institution/upload`):

| File | Purpose | Test Case Demonstrated |
| :--- | :--- | :--- |
| `valid_enrolments_sample.csv` | Clean batch of 5 students | Valid formatting, correct intake, simulated APAAR verification |
| `duplicates_and_format_errors_sample.csv` | Erroneous student records | In-batch duplicates, invalid APAAR length, missing required fields |
| `supernumerary_sample.csv` | NRI, OCI, and Foreign National admissions | Independent quota tracking, category verification |

### Running Automated Test Suite
```bash
npm test
```
Runs 14 automated tests covering:
- APAAR 12-digit format validation & simulation adapter
- Missing required fields and header structure validation
- In-batch and cross-institution duplicate detection
- Regular intake limit vs. supernumerary capacity overflow
- Role permissions & strict tenant isolation (RLS logic)
- Submission state transitions

### Running Production Build
```bash
npm run build
```

---

## 🔒 Security & Data Architecture

- **Row Level Security (RLS)**: Enforced on all student and institution tables in PostgreSQL.
- **Tenant Isolation**: Institution administrators cannot read or write data belonging to another institution.
- **Role Boundary**: Institution administrators cannot approve batches, modify approved intake limits, or alter audit logs.
- **Sensitive Data Protection**: APAAR IDs and personal student identifiers are kept strictly scoped to authorized queries.
- **Append-Only Audit Logs**: Database-level tracking of all submission approvals, rejections, reviews, and modifications.

---

## 🔌 API & Extensibility (Section 12)

- Interactive in-app API documentation is available at **`/aicte/api-docs`** and **`/institution/api-docs`**.
- OpenAPI 3.0 specification file is located at `docs/openapi.yaml` and downloadable via `/docs/openapi.yaml`.
- Enforces `X-Idempotency-Key` headers on batch submissions to guarantee idempotent retries.
- Extensible `VerificationProvider` interface for dropping in official APAAR/ABC/DigiLocker production APIs when government credentials become available.

---

*Note: APAAR identity verification in this prototype is SIMULATED and labeled accordingly. No real personal student data is transmitted to external services.*
