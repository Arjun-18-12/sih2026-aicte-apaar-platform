/**
 * AICTE-APAAR Platform - Deterministic Synthetic Dataset Generator
 *
 * Generates an expanded, internally consistent synthetic dataset for local demo evaluation:
 * - 12 Fictional AICTE-Approved Institutions across 12 Indian states
 * - 42 Approved Programmes with academic year 2024-25 intakes & supernumerary quotas
 * - Exactly 1,500 Synthetic Student Profiles with diverse synthetic Indian names
 * - Exactly 1,200 Distributed Enrolments with quota & category diversity
 * - 44 Submission Batches across institutions (approved, submitted, returned, draft)
 * - 42 Duplicate Review Cases (22 pending, 20 resolved)
 * - 40 Submission Errors attached to returned/submitted batches
 * - 55 Immutable Synthetic Audit Logs
 *
 * Deterministic PRNG ensures identical records, stable UUIDs, and zero foreign-key errors across reloads.
 */

import type {
  Institution,
  Programme,
  ApprovedIntake,
  Student,
  Enrolment,
  SubmissionBatch,
  DuplicateReviewCase,
  SubmissionError,
  AuditLog,
  AdmissionCategory,
  SupernumeraryClassification,
  DuplicateReviewStatus,
} from '../types';

// Deterministic Mulberry32 Pseudo-Random Number Generator
function createPRNG(seed = 0x41494354) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST_NAMES_MALE = [
  'Aarav', 'Aditya', 'Akash', 'Amit', 'Arjun', 'Ayush', 'Chetan', 'Dev', 'Gaurav', 'Harsh',
  'Ishaan', 'Jay', 'Karan', 'Kunal', 'Manish', 'Mayank', 'Nikhil', 'Pranav', 'Rahul', 'Rohan',
  'Sachin', 'Sameer', 'Siddharth', 'Suraj', 'Tarun', 'Utkarsh', 'Varun', 'Vikas', 'Vivek', 'Yash',
  'Rishi', 'Abhinav', 'Aniruddh', 'Deepak', 'Hemant', 'Kailash', 'Mohit', 'Omkar', 'Rajesh', 'Sanjay'
];

const FIRST_NAMES_FEMALE = [
  'Aadhya', 'Ananya', 'Ankita', 'Deepika', 'Divya', 'Isha', 'Kavya', 'Khushi', 'Meera', 'Neha',
  'Nisha', 'Pooja', 'Prerna', 'Priya', 'Radhika', 'Rhea', 'Ritu', 'Sakshi', 'Sanskriti', 'Shreya',
  'Sneha', 'Sonali', 'Swati', 'Tanvi', 'Trisha', 'Vaishnavi', 'Vandana', 'Vidya', 'Zara', 'Simran',
  'Anjali', 'Bhavna', 'Geeta', 'Harini', 'Jyoti', 'Komal', 'Lavanya', 'Pallavi', 'Rekha', 'Sunita'
];

const SURNAMES = [
  'Sharma', 'Verma', 'Mehta', 'Patel', 'Gupta', 'Singh', 'Reddy', 'Nair', 'Rao', 'Joshi',
  'Deshmukh', 'Kulkarni', 'Iyer', 'Banerjee', 'Chatterjee', 'Mishra', 'Pandey', 'Chauhan', 'Bhat', 'Das',
  'Bose', 'Mukherjee', 'Agarwal', 'Chopra', 'Malhotra', 'Saxena', 'Sengupta', 'Pillai', 'Menon', 'Gowda',
  'Bhattacharya', 'Tripathi', 'Tiwari', 'Nambiar', 'Hegde', 'Shetty', 'Pawar', 'Kadam', 'Thakur', 'Yadav'
];

export interface GeneratedDataset {
  institutions: Institution[];
  programmes: Programme[];
  intakes: ApprovedIntake[];
  students: Student[];
  enrolments: Enrolment[];
  batches: SubmissionBatch[];
  duplicateCases: DuplicateReviewCase[];
  submissionErrors: SubmissionError[];
  auditLogs: AuditLog[];
}

export function generateDeterministicDemoDataset(): GeneratedDataset {
  const prng = createPRNG(0x41494354);

  const randInt = (min: number, max: number) => Math.floor(prng() * (max - min + 1)) + min;
  const pick = <T>(arr: T[]): T => arr[Math.floor(prng() * arr.length)];

  // 1. Exactly 12 Fictional Institutions across 12 Indian states
  const institutions: Institution[] = [
    {
      id: '11111111-1111-1111-1111-111111111111',
      aicte_id: '1-SRIT2024',
      name: 'Shri Ram Institute of Technology (DEMO)',
      type: 'autonomous_college',
      approval_status: 'active',
      state: 'Maharashtra',
      city: 'Mumbai',
      address: 'Tech Campus, Sector 4, Andheri East',
      pincode: '400069',
      phone: '+91-22-28390001',
      email: 'contact@srit.ac.in',
      website: 'https://srit.demo.ac.in',
      created_at: '2024-01-15T00:00:00Z',
      updated_at: '2024-01-15T00:00:00Z',
    },
    {
      id: '11111111-1111-1111-1111-000000000002',
      aicte_id: '1-NTU2024',
      name: 'National Technical University',
      type: 'university',
      approval_status: 'active',
      state: 'Delhi',
      city: 'New Delhi',
      address: 'Institutional Area, Hauz Khas',
      pincode: '110016',
      phone: '+91-11-26590002',
      email: 'admin@ntu.demo.edu.in',
      website: 'https://ntu.demo.edu.in',
      created_at: '2024-01-20T00:00:00Z',
      updated_at: '2024-01-20T00:00:00Z',
    },
    {
      id: '11111111-1111-1111-1111-000000000003',
      aicte_id: '1-REC2024',
      name: 'Regional Engineering College',
      type: 'affiliated_college',
      approval_status: 'active',
      state: 'Tamil Nadu',
      city: 'Chennai',
      address: 'Guindy Institutional Corridor',
      pincode: '600025',
      phone: '+91-44-22350003',
      email: 'principal@rec.demo.edu.in',
      website: 'https://rec.demo.edu.in',
      created_at: '2024-02-05T00:00:00Z',
      updated_at: '2024-02-05T00:00:00Z',
    },
    {
      id: '11111111-1111-1111-1111-000000000004',
      aicte_id: '1-IBTB2024',
      name: 'Institute of Business & Technology Bangalore',
      type: 'autonomous_college',
      approval_status: 'active',
      state: 'Karnataka',
      city: 'Bengaluru',
      address: 'Electronic City Phase 1',
      pincode: '560100',
      phone: '+91-80-28520004',
      email: 'info@ibtb.demo.edu.in',
      website: 'https://ibtb.demo.edu.in',
      created_at: '2024-02-10T00:00:00Z',
      updated_at: '2024-02-10T00:00:00Z',
    },
    {
      id: '11111111-1111-1111-1111-000000000005',
      aicte_id: '1-GIT2024',
      name: 'Gujarat Institute of Technology',
      type: 'autonomous_college',
      approval_status: 'active',
      state: 'Gujarat',
      city: 'Ahmedabad',
      address: 'SG Highway, Bodakdev',
      pincode: '380054',
      phone: '+91-79-26850005',
      email: 'registrar@git.demo.ac.in',
      website: 'https://git.demo.ac.in',
      created_at: '2024-02-15T00:00:00Z',
      updated_at: '2024-02-15T00:00:00Z',
    },
    {
      id: '11111111-1111-1111-1111-000000000006',
      aicte_id: '1-KIAS2024',
      name: 'Kolkata Institute of Applied Science',
      type: 'deemed_university',
      approval_status: 'active',
      state: 'West Bengal',
      city: 'Kolkata',
      address: 'Salt Lake Sector V',
      pincode: '700091',
      phone: '+91-33-23570006',
      email: 'office@kias.demo.edu.in',
      website: 'https://kias.demo.edu.in',
      created_at: '2024-02-20T00:00:00Z',
      updated_at: '2024-02-20T00:00:00Z',
    },
    {
      id: '11111111-1111-1111-1111-000000000007',
      aicte_id: '1-HEC2024',
      name: 'Hyderabad Engineering College',
      type: 'affiliated_college',
      approval_status: 'active',
      state: 'Telangana',
      city: 'Hyderabad',
      address: 'Gachibowli IT Hub',
      pincode: '500032',
      phone: '+91-40-23000007',
      email: 'admissions@hec.demo.ac.in',
      website: 'https://hec.demo.ac.in',
      created_at: '2024-02-25T00:00:00Z',
      updated_at: '2024-02-25T00:00:00Z',
    },
    {
      id: '11111111-1111-1111-1111-000000000008',
      aicte_id: '1-LPEA2024',
      name: 'Lucknow Polytechnic & Engineering Academy',
      type: 'polytechnic',
      approval_status: 'active',
      state: 'Uttar Pradesh',
      city: 'Lucknow',
      address: 'Vikas Nagar Institutional Road',
      pincode: '226022',
      phone: '+91-522-2760008',
      email: 'dean@lpea.demo.edu.in',
      website: 'https://lpea.demo.edu.in',
      created_at: '2024-03-01T00:00:00Z',
      updated_at: '2024-03-01T00:00:00Z',
    },
    {
      id: '11111111-1111-1111-1111-000000000009',
      aicte_id: '1-KITR2024',
      name: 'Kerala Institute of Technology & Research',
      type: 'autonomous_college',
      approval_status: 'active',
      state: 'Kerala',
      city: 'Thiruvananthapuram',
      address: 'Technopark Campus Phase 2',
      pincode: '695581',
      phone: '+91-471-2700009',
      email: 'info@kitr.demo.ac.in',
      website: 'https://kitr.demo.ac.in',
      created_at: '2024-03-05T00:00:00Z',
      updated_at: '2024-03-05T00:00:00Z',
    },
    {
      id: '11111111-1111-1111-1111-000000000010',
      aicte_id: '1-RIE2024',
      name: 'Rajasthan Institute of Engineering',
      type: 'affiliated_college',
      approval_status: 'active',
      state: 'Rajasthan',
      city: 'Jaipur',
      address: 'Sitapura Industrial Area',
      pincode: '302022',
      phone: '+91-141-2770010',
      email: 'director@rie.demo.ac.in',
      website: 'https://rie.demo.ac.in',
      created_at: '2024-03-10T00:00:00Z',
      updated_at: '2024-03-10T00:00:00Z',
    },
    {
      id: '11111111-1111-1111-1111-000000000011',
      aicte_id: '1-BNCE2024',
      name: 'Bhopal National College of Engineering',
      type: 'autonomous_college',
      approval_status: 'active',
      state: 'Madhya Pradesh',
      city: 'Bhopal',
      address: 'Kolar Road Institutional Hub',
      pincode: '462042',
      phone: '+91-755-2490011',
      email: 'principal@bnce.demo.ac.in',
      website: 'https://bnce.demo.ac.in',
      created_at: '2024-03-15T00:00:00Z',
      updated_at: '2024-03-15T00:00:00Z',
    },
    {
      id: '11111111-1111-1111-1111-000000000012',
      aicte_id: '1-PIAT2024',
      name: 'Punjab Institute of Advanced Technology',
      type: 'institute_of_national_importance',
      approval_status: 'active',
      state: 'Punjab',
      city: 'Chandigarh',
      address: 'Knowledge City, Sector 81, Mohali',
      pincode: '140306',
      phone: '+91-172-2210012',
      email: 'director@piat.demo.edu.in',
      website: 'https://piat.demo.edu.in',
      created_at: '2024-03-20T00:00:00Z',
      updated_at: '2024-03-20T00:00:00Z',
    },
  ];

  // 2. Programmes & Approved Intakes (3 to 4 per institution = 42 total)
  const PROGRAMME_TEMPLATES = [
    { code: 'BTECH-CS', name: 'B.Tech Computer Science and Engineering', level: 'UG', duration_years: 4, intake: 120, tfws: 6, nri: 4, oci: 2 },
    { code: 'BTECH-EC', name: 'B.Tech Electronics & Communication', level: 'UG', duration_years: 4, intake: 60, tfws: 3, nri: 2, oci: 1 },
    { code: 'BTECH-ME', name: 'B.Tech Mechanical Engineering', level: 'UG', duration_years: 4, intake: 60, tfws: 3, nri: 2, oci: 0 },
    { code: 'MBA', name: 'Master of Business Administration', level: 'PG', duration_years: 2, intake: 60, tfws: 0, nri: 3, oci: 2 },
    { code: 'MCA', name: 'Master of Computer Applications', level: 'PG', duration_years: 2, intake: 60, tfws: 3, nri: 2, oci: 0 },
  ];

  const programmes: Programme[] = [];
  const intakes: ApprovedIntake[] = [];

  institutions.forEach((inst, instIdx) => {
    const numProgs = instIdx === 0 ? 4 : (instIdx % 2 === 0 ? 4 : 3);
    for (let pIdx = 0; pIdx < numProgs; pIdx++) {
      const tmpl = PROGRAMME_TEMPLATES[pIdx % PROGRAMME_TEMPLATES.length];
      const progId = `prog-${instIdx + 1}-${tmpl.code.toLowerCase()}`;
      const intakeId = `intake-${instIdx + 1}-${tmpl.code.toLowerCase()}-2024-25`;

      const approvedIntake = instIdx === 1 && tmpl.code === 'BTECH-CS' ? 240 : tmpl.intake;
      const totalSuper = tmpl.tfws + tmpl.nri + tmpl.oci;

      const prog: Programme = {
        id: progId,
        institution_id: inst.id,
        name: tmpl.name,
        code: tmpl.code,
        level: tmpl.level,
        duration_years: tmpl.duration_years,
        programme_status: 'approved',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        institution: inst,
      };
      programmes.push(prog);

      const intake: ApprovedIntake = {
        id: intakeId,
        programme_id: progId,
        institution_id: inst.id,
        academic_year: '2024-25',
        approved_intake: approvedIntake,
        supernumerary_nri: tmpl.nri,
        supernumerary_oci: tmpl.oci,
        supernumerary_fn: 0,
        supernumerary_pwd: 1,
        supernumerary_tfws: tmpl.tfws,
        supernumerary_km: 1,
        total_supernumerary: totalSuper + 2,
        approval_reference: `AICTE/AB/2024-25/${inst.aicte_id}/${tmpl.code}`,
        approval_date: '2024-04-15',
        status: 'active',
        created_at: '2024-04-15T00:00:00Z',
        updated_at: '2024-04-15T00:00:00Z',
        programme: prog,
        institution: inst,
      };
      intakes.push(intake);
    }
  });

  // 3. Exactly 1,500 Synthetic Students
  const students: Student[] = [];
  const TOTAL_STUDENTS = 1500;

  // Student 1, 2, 3 have designated attributes to guarantee backwards compatibility with existing test suites
  students.push({
    id: 's1',
    apaar_id: '111122223333',
    full_name: 'Arjun Sharma',
    date_of_birth: '2004-05-12',
    gender: 'male',
    apaar_verification_status: 'verified',
    apaar_verified_at: '2024-07-15T10:00:00Z',
    apaar_verification_source: 'mock',
    created_at: '2024-05-01T00:00:00Z',
    updated_at: '2024-05-01T00:00:00Z',
  });

  students.push({
    id: 's2',
    apaar_id: '222233334444',
    full_name: 'Priya Patel',
    date_of_birth: '2005-02-18',
    gender: 'female',
    apaar_verification_status: 'verified',
    apaar_verified_at: '2024-07-15T10:00:00Z',
    apaar_verification_source: 'mock',
    created_at: '2024-05-01T00:00:00Z',
    updated_at: '2024-05-01T00:00:00Z',
  });

  students.push({
    id: 's3',
    apaar_id: '333344445555',
    full_name: 'Rohan Verma',
    date_of_birth: '2004-11-23',
    gender: 'male',
    apaar_verification_status: 'pending',
    created_at: '2024-05-01T00:00:00Z',
    updated_at: '2024-05-01T00:00:00Z',
  });

  for (let i = 4; i <= TOTAL_STUDENTS; i++) {
    const isMale = prng() > 0.45;
    const firstName = isMale ? pick(FIRST_NAMES_MALE) : pick(FIRST_NAMES_FEMALE);
    const lastName = pick(SURNAMES);
    const fullName = `${firstName} ${lastName}`;
    const id = `std-${String(i).padStart(6, '0')}`;

    const randStatus = prng();
    let status: Student['apaar_verification_status'] = 'verified';
    let apaarId: string | undefined = `9999${String(i).padStart(8, '0')}`;
    if (randStatus > 0.95) {
      status = 'unverified';
      apaarId = undefined;
    } else if (randStatus > 0.90) {
      status = 'unverified';
      apaarId = `9999${String(i).padStart(4, '0')}`;
    } else if (randStatus > 0.78) {
      status = 'pending';
    }

    const birthYear = randInt(2002, 2006);
    const birthMonth = String(randInt(1, 12)).padStart(2, '0');
    const birthDay = String(randInt(1, 28)).padStart(2, '0');

    students.push({
      id,
      apaar_id: apaarId,
      full_name: fullName,
      date_of_birth: `${birthYear}-${birthMonth}-${birthDay}`,
      gender: isMale ? 'male' : 'female',
      apaar_verification_status: status,
      apaar_verified_at: status === 'verified' ? '2024-07-15T10:00:00Z' : undefined,
      apaar_verification_source: status === 'verified' ? 'mock' : undefined,
      created_at: '2024-05-01T00:00:00Z',
      updated_at: '2024-05-01T00:00:00Z',
    });
  }

  // 4. Exactly 44 Batches across the 12 Institutions
  const batches: SubmissionBatch[] = [];
  const batchCountsPerInst = [4, 4, 4, 4, 4, 3, 4, 3, 4, 3, 4, 3]; // sum = 44
  let batchIdCounter = 1;

  institutions.forEach((inst, instIdx) => {
    const numBatches = batchCountsPerInst[instIdx];
    for (let b = 0; b < numBatches; b++) {
      let bStatus: SubmissionBatch['status'] = 'approved';
      if (instIdx === 0 && b === 0) bStatus = 'approved';
      else if (instIdx === 0 && b === 1) bStatus = 'submitted';
      else if (b === numBatches - 1 && instIdx % 3 === 0) bStatus = 'submitted';
      else if (b === numBatches - 1 && instIdx % 3 === 1) bStatus = 'returned_for_correction';
      else if (b === numBatches - 1 && instIdx % 3 === 2) bStatus = 'draft';
      else if (b === numBatches - 2 && instIdx % 2 === 0) bStatus = 'submitted';

      const bId = batchIdCounter === 1 ? 'b1' : (batchIdCounter === 2 ? 'b2' : `batch-${String(batchIdCounter).padStart(4, '0')}`);
      batchIdCounter++;

      const month = String(randInt(6, 10)).padStart(2, '0');
      const day = String(randInt(1, 28)).padStart(2, '0');

      batches.push({
        id: bId,
        institution_id: inst.id,
        academic_year: '2024-25',
        status: bStatus,
        total_records: 0,
        valid_records: 0,
        error_records: bStatus === 'returned_for_correction' ? randInt(2, 6) : 0,
        submitted_at: bStatus !== 'draft' ? `2024-${month}-${day}T10:30:00Z` : undefined,
        reviewed_at: bStatus === 'approved' || bStatus === 'returned_for_correction' ? `2024-${month}-${day}T16:00:00Z` : undefined,
        reviewed_by: bStatus === 'approved' || bStatus === 'returned_for_correction' ? '00000000-0000-0000-0000-000000000001' : undefined,
        reviewer_notes: bStatus === 'returned_for_correction' ? 'Intake discrepancy or demographic errors detected. Please revise.' : (bStatus === 'approved' ? 'Verified against AICTE approved quotas.' : undefined),
        created_at: `2024-${month}-01T09:00:00Z`,
        updated_at: `2024-${month}-${day}T16:00:00Z`,
        institution: inst,
      });
    }
  });

  // 5. Exactly 1,200 Enrolments Distributed across Institutions
  const TOTAL_ENROLMENTS = 1200;
  const enrolments: Enrolment[] = [];
  const admissions: AdmissionCategory[] = ['general', 'general', 'general', 'obc', 'obc', 'sc', 'st', 'ews'];
  const supernumeraries: SupernumeraryClassification[] = ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'tuition_fee_waiver', 'nri', 'oci', 'pwd_extra', 'kashmiri_migrants'];

  let studentIdx = 0;
  institutions.forEach((inst, instIdx) => {
    const instBatches = batches.filter(b => b.institution_id === inst.id);
    const instProgs = programmes.filter(p => p.institution_id === inst.id);
    const targetCount = instIdx === 0 ? 115 : (instIdx === 1 ? 140 : (instIdx < 6 ? 105 : 90));

    for (let e = 0; e < targetCount; e++) {
      if (studentIdx >= TOTAL_ENROLMENTS) break;
      const student = students[studentIdx];
      studentIdx++;

      const batch = instBatches[e % instBatches.length];
      const prog = instProgs[e % instProgs.length];
      const intake = intakes.find(i => i.programme_id === prog.id && i.institution_id === inst.id);

      const subStatus = batch.status === 'approved' ? 'approved' : (batch.status === 'submitted' ? 'submitted' : 'draft');
      const admCat = pick(admissions);
      const superCat = pick(supernumeraries);

      const isNri = superCat === 'nri';
      const isOci = superCat === 'oci';
      const isFn = superCat === 'fn';

      const enrId = enrolments.length === 0 ? 'e1' : (enrolments.length === 1 ? 'e2' : (enrolments.length === 2 ? 'e3' : `enr-${String(enrolments.length + 1).padStart(6, '0')}`));
      const instRegId = instIdx === 0 && e < 3
        ? `SRIT202400${e + 1}`
        : `${inst.aicte_id.replace('1-', '')}-2024-${String(e + 1).padStart(4, '0')}`;

      enrolments.push({
        id: enrId,
        student_id: student.id,
        institution_id: inst.id,
        programme_id: prog.id,
        approved_intake_id: intake ? intake.id : undefined,
        batch_id: batch.id,
        academic_year: '2024-25',
        admission_date: '2024-08-01',
        enrolment_status: 'active',
        submission_status: subStatus,
        admission_category: admCat,
        is_nri: isNri,
        is_oci: isOci,
        is_foreign_national: isFn,
        supernumerary_classification: superCat,
        institution_student_id: instRegId,
        created_at: batch.created_at,
        updated_at: batch.updated_at,
        student,
        institution: inst,
        programme: prog,
        approved_intake: intake,
      });

      batch.total_records++;
      if (batch.status === 'returned_for_correction') {
        batch.valid_records = Math.max(0, batch.total_records - batch.error_records);
      } else {
        batch.valid_records = batch.total_records;
      }
    }
  });

  // 6. Exactly 42 Evidence-Backed Duplicate Review Cases (22 Pending, 20 Resolved)
  const duplicateCases: DuplicateReviewCase[] = [];

  const maskApaar = (id?: string) => (id && id.length >= 4 ? `XXXXXXXX${id.slice(-4)}` : 'Not provided');

  // Find enrolments across institutions with valid 12-digit verified APAAR IDs
  const verifiedEnrs = enrolments.filter(
    e => e.student?.apaar_id && e.student.apaar_id.length === 12 && e.student.apaar_verification_status === 'verified'
  );

  // Group verified enrolments by institution to easily pair across institutions
  const enrsByInst = new Map<string, Enrolment[]>();
  for (const enr of verifiedEnrs) {
    const list = enrsByInst.get(enr.institution_id) || [];
    list.push(enr);
    enrsByInst.set(enr.institution_id, list);
  }

  // Find enrolments with missing APAAR IDs (including Siddharth Bhattacharya)
  const missingEnrs = enrolments.filter(
    e => !e.student?.apaar_id || e.student.apaar_verification_status === 'unverified'
  );

  // Find enrolments with invalid APAAR IDs (length !== 12)
  const invalidEnrs = enrolments.filter(
    e => e.student?.apaar_id && e.student.apaar_id.length !== 12
  );

  let caseNumber = 1;
  const generateCaseId = (num: number) => (num === 1 ? 'd1' : num === 2 ? 'd2' : num === 3 ? 'd3' : `dup-${String(num).padStart(4, '0')}`);

  // --- Category A: Cross-Institutional Duplicates (18 cases: 10 Pending, 8 Resolved) ---
  const crossCasesCount = 18;
  for (let i = 0; i < crossCasesCount; i++) {
    if (caseNumber === 3) {
      caseNumber++; // reserve d3 for Siddharth Bhattacharya
    }
    const cId = generateCaseId(caseNumber);
    const isPending = duplicateCases.filter(c => c.review_status === 'pending').length < 10;
    const dStatus: DuplicateReviewStatus = isPending ? 'pending' : (i % 2 === 0 ? 'confirmed_duplicate' : 'legitimate');

    const instA = institutions[i % institutions.length];
    const instB = institutions[(i + 1) % institutions.length];
    const enrA = (enrsByInst.get(instA.id) || verifiedEnrs)[i % (enrsByInst.get(instA.id)?.length || 1)];
    const enrB = (enrsByInst.get(instB.id) || verifiedEnrs)[(i + 2) % (enrsByInst.get(instB.id)?.length || 1)];

    const s1 = enrA.student!;
    const s2 = enrB.student!;

    // Enforce matching APAAR ID between the two cross-institution records
    s2.apaar_id = s1.apaar_id;
    s2.apaar_verification_status = 'verified';

    const batch = batches[caseNumber % batches.length];

    duplicateCases.push({
      id: cId,
      batch_id: batch.id,
      student_id_1: s1.id,
      student_id_2: s2.id,
      enrolment_id_1: enrA.id,
      enrolment_id_2: enrB.id,
      case_type: 'cross_institution_duplicate',
      severity: 'high',
      detection_reason: `Cross-institutional duplicate: Identical APAAR ID (${maskApaar(s1.apaar_id)}) is registered in active degree enrolments at both ${enrA.institution?.name} (${enrA.programme?.name}) and ${enrB.institution?.name} (${enrB.programme?.name}) for academic year 2024-25.`,
      review_status: dStatus,
      reviewed_by: dStatus !== 'pending' ? '00000000-0000-0000-0000-000000000001' : undefined,
      reviewed_at: dStatus !== 'pending' ? '2024-09-15T14:30:00Z' : undefined,
      reviewer_notes: dStatus === 'confirmed_duplicate'
        ? 'Confirmed duplicate registration across institutions. First registration retained.'
        : (dStatus === 'legitimate' ? 'Verified legitimate dual-degree or inter-college transfer.' : undefined),
      created_at: '2024-09-01T10:00:00Z',
      verification_source: 'Central Enrolment Registry Verification',
      verification_status: 'verified_duplicate_identifier',
      verification_timestamp: '2024-09-01T10:00:00Z',
      student_1: s1,
      student_2: s2,
    });
    caseNumber++;
  }

  // --- Category B: Demographic Name Divergence (12 cases: 6 Pending, 6 Resolved) ---
  for (let i = 0; i < 12; i++) {
    const cId = generateCaseId(caseNumber);
    const pendingDivergenceCount = duplicateCases.filter(c => c.case_type === 'demographic_divergence' && c.review_status === 'pending').length;
    const isPending = pendingDivergenceCount < 6;
    const dStatus: DuplicateReviewStatus = isPending ? 'pending' : (i % 2 === 0 ? 'confirmed_duplicate' : 'legitimate');

    const enr = verifiedEnrs[30 + i * 2] || verifiedEnrs[i];
    const sCandidate = enr.student!;

    // Create a matching simulated APAAR register identity with same APAAR ID but middle initial or minor variance
    const nameParts = sCandidate.full_name.split(' ');
    const middleInitial = pick(['K.', 'S.', 'M.', 'R.', 'P.', 'A.']);
    const registerName = nameParts.length > 1
      ? `${nameParts[0]} ${middleInitial} ${nameParts.slice(1).join(' ')}`
      : `${sCandidate.full_name} (${middleInitial})`;

    const sRegister: Student = {
      id: `std-reg-${sCandidate.id}`,
      apaar_id: sCandidate.apaar_id, // Identical APAAR ID
      full_name: registerName,
      date_of_birth: sCandidate.date_of_birth,
      gender: sCandidate.gender,
      apaar_verification_status: 'verified',
      apaar_verified_at: '2024-07-15T10:00:00Z',
      apaar_verification_source: 'mock',
      created_at: '2024-05-01T00:00:00Z',
      updated_at: '2024-05-01T00:00:00Z',
    };
    students.push(sRegister);

    sCandidate.apaar_verification_status = 'unverified';
    sCandidate.apaar_verification_note = 'Flagged for demographic mismatch with APAAR directory record.';

    const batch = batches[caseNumber % batches.length];

    duplicateCases.push({
      id: cId,
      batch_id: batch.id,
      student_id_1: sRegister.id,
      student_id_2: sCandidate.id,
      enrolment_id_1: undefined, // Record 1 is APAAR directory profile
      enrolment_id_2: enr.id,    // Record 2 is admission enrolment
      case_type: 'demographic_divergence',
      severity: 'medium',
      detection_reason: `Demographic name divergence: Verified APAAR register identity '${sRegister.full_name}' differs from admission record '${sCandidate.full_name}' for APAAR ID ${maskApaar(sCandidate.apaar_id)} (simulated APAAR directory). Flagged for manual review.`,
      review_status: dStatus,
      reviewed_by: dStatus !== 'pending' ? '00000000-0000-0000-0000-000000000001' : undefined,
      reviewed_at: dStatus !== 'pending' ? '2024-09-15T14:30:00Z' : undefined,
      reviewer_notes: dStatus === 'confirmed_duplicate'
        ? 'Confirmed name discrepancy beyond acceptable spelling variance. Admission record flagged for correction.'
        : (dStatus === 'legitimate' ? 'Dismissed: applicant identity verified via legal alias.' : undefined),
      created_at: '2024-09-02T11:30:00Z',
      verification_source: 'Simulated APAAR Registry Adapter',
      verification_status: 'flagged_demographic_divergence',
      verification_timestamp: '2024-09-02T11:30:00Z',
      student_1: sRegister,
      student_2: sCandidate,
    });
    caseNumber++;
  }

  // --- Category C: Single-Record Missing APAAR ID (8 cases: 4 Pending, 4 Resolved) ---
  // Case d3 specifically for Siddharth Bhattacharya (std-000144)
  const siddharthStudent = students.find(s => s.full_name.includes('Siddharth Bhattacharya')) || missingEnrs[0]?.student!;
  const siddharthEnr = enrolments.find(e => e.student_id === siddharthStudent.id) || missingEnrs[0]!;

  const d3Batch = batches[3 % batches.length];
  duplicateCases.push({
    id: 'd3',
    batch_id: d3Batch.id,
    student_id_1: siddharthStudent.id,
    student_id_2: undefined,
    enrolment_id_1: siddharthEnr?.id,
    enrolment_id_2: undefined,
    case_type: 'missing_apaar',
    severity: 'medium',
    detection_reason: `Missing APAAR ID: Enrolment record for '${siddharthStudent.full_name}' (${siddharthEnr?.institution?.name || 'National Technical University'}, ${siddharthEnr?.programme?.name || 'B.Tech Electronics & Communication'}) was submitted without an APAAR identifier. APAAR verification not performed.`,
    review_status: 'pending',
    created_at: '2024-09-03T09:00:00Z',
    verification_source: 'Local Admission Pre-flight Validation',
    verification_status: 'not_performed',
    verification_timestamp: '2024-09-03T09:00:00Z',
    student_1: siddharthStudent,
    student_2: undefined,
  });

  const otherMissingEnrs = missingEnrs.filter(e => e.student?.id !== siddharthStudent.id);
  for (let i = 0; i < 7; i++) {
    const cId = generateCaseId(caseNumber);
    const pendingMissingCount = duplicateCases.filter(c => c.case_type === 'missing_apaar' && c.review_status === 'pending').length;
    const isPending = pendingMissingCount < 4;
    const dStatus: DuplicateReviewStatus = isPending ? 'pending' : 'dismissed';

    const enr = otherMissingEnrs[i % otherMissingEnrs.length] || otherMissingEnrs[0];
    const s = enr?.student!;
    const batch = batches[caseNumber % batches.length];

    duplicateCases.push({
      id: cId,
      batch_id: batch.id,
      student_id_1: s.id,
      student_id_2: undefined,
      enrolment_id_1: enr?.id,
      enrolment_id_2: undefined,
      case_type: 'missing_apaar',
      severity: 'medium',
      detection_reason: `Missing APAAR ID: Enrolment record for '${s.full_name}' (${enr?.institution?.name}, ${enr?.programme?.name}) was submitted without an APAAR identifier. APAAR verification not performed.`,
      review_status: dStatus,
      reviewed_by: dStatus !== 'pending' ? '00000000-0000-0000-0000-000000000001' : undefined,
      reviewed_at: dStatus !== 'pending' ? '2024-09-15T14:30:00Z' : undefined,
      reviewer_notes: dStatus === 'dismissed' ? 'Dismissed: Institution requested 30-day grace period to obtain APAAR consent.' : undefined,
      created_at: '2024-09-03T09:00:00Z',
      verification_source: 'Local Admission Pre-flight Validation',
      verification_status: 'not_performed',
      verification_timestamp: '2024-09-03T09:00:00Z',
      student_1: s,
      student_2: undefined,
    });
    caseNumber++;
  }

  // --- Category D: Single-Record Invalid APAAR ID Format (4 cases: 2 Pending, 2 Resolved) ---
  for (let i = 0; i < 4; i++) {
    const cId = generateCaseId(caseNumber);
    const pendingInvalidCount = duplicateCases.filter(c => c.case_type === 'invalid_apaar' && c.review_status === 'pending').length;
    const isPending = pendingInvalidCount < 2;
    const dStatus: DuplicateReviewStatus = isPending ? 'pending' : 'confirmed_duplicate';

    const enr = invalidEnrs[i % invalidEnrs.length] || invalidEnrs[0];
    const s = enr?.student!;
    const batch = batches[caseNumber % batches.length];

    duplicateCases.push({
      id: cId,
      batch_id: batch.id,
      student_id_1: s.id,
      student_id_2: undefined,
      enrolment_id_1: enr?.id,
      enrolment_id_2: undefined,
      case_type: 'invalid_apaar',
      severity: 'low',
      detection_reason: `Invalid APAAR ID format: Provided identifier '${s.apaar_id}' does not conform to the 12-digit numeric standard. Format verification failed.`,
      review_status: dStatus,
      reviewed_by: dStatus !== 'pending' ? '00000000-0000-0000-0000-000000000001' : undefined,
      reviewed_at: dStatus !== 'pending' ? '2024-09-15T14:30:00Z' : undefined,
      reviewer_notes: dStatus !== 'pending' ? 'Format validation error confirmed. Institution notified to correct 12-digit format.' : undefined,
      created_at: '2024-09-04T14:15:00Z',
      verification_source: 'Format Validation Rule (12 Digits)',
      verification_status: 'invalid_format',
      verification_timestamp: '2024-09-04T14:15:00Z',
      student_1: s,
      student_2: undefined,
    });
    caseNumber++;
  }

  // Ensure deterministic sort order: d1, d2, d3, dup-0004...
  duplicateCases.sort((a, b) => {
    const numA = a.id.startsWith('d') && !a.id.startsWith('dup') ? parseInt(a.id.slice(1), 10) : parseInt(a.id.replace('dup-', ''), 10);
    const numB = b.id.startsWith('d') && !b.id.startsWith('dup') ? parseInt(b.id.slice(1), 10) : parseInt(b.id.replace('dup-', ''), 10);
    return numA - numB;
  });

  // 7. Exactly 40 Submission Errors Attached to Returned/Submitted Batches
  const submissionErrors: SubmissionError[] = [];
  const errBatches = batches.filter(b => b.status === 'returned_for_correction' || b.status === 'submitted');
  for (let er = 1; er <= 40; er++) {
    const b = pick(errBatches);
    submissionErrors.push({
      id: `err-${String(er).padStart(4, '0')}`,
      batch_id: b.id,
      row_number: randInt(1, 100),
      institution_student_id: `REG-ERR-${er}`,
      error_type: pick(['missing_field', 'invalid_format', 'duplicate', 'intake_exceeded', 'supernumerary_exceeded']),
      field_name: pick(['apaar_id', 'date_of_birth', 'programme_code', 'admission_category']),
      error_message: 'Format validation failed or mandatory academic field absent in CSV record.',
      is_resolved: b.status === 'approved',
      created_at: b.created_at,
    });
  }

  // 8. Exactly 55 Audit Logs
  const auditLogs: AuditLog[] = [];
  const auditActions = [
    'BATCH_DRAFT_CREATED', 'BATCH_SUBMITTED', 'BATCH_APPROVED', 'BATCH_RETURNED',
    'DUPLICATE_CASE_FLAGGED', 'DUPLICATE_CASE_RESOLVED', 'INTAKE_EXCEPTION_FLAGGED'
  ];
  for (let a = 1; a <= 55; a++) {
    const inst = pick(institutions);
    const act = pick(auditActions);
    const isAicte = act === 'BATCH_APPROVED' || act === 'BATCH_RETURNED' || act === 'DUPLICATE_CASE_RESOLVED';
    auditLogs.push({
      id: `audit-${String(a).padStart(4, '0')}`,
      actor_id: isAicte ? '00000000-0000-0000-0000-000000000001' : '00000000-0000-0000-0000-000000000002',
      actor_email: isAicte ? 'aicte.admin@demo.aicte.gov.in' : 'principal@srit.ac.in',
      actor_role: isAicte ? 'aicte_admin' : 'institution_admin',
      institution_id: inst.id,
      action: act,
      entity_type: act.startsWith('DUPLICATE') ? 'duplicate_review_cases' : 'submission_batches',
      entity_id: `rec-${a}`,
      new_values: { action_summary: `Synthetic event ${act} completed.` },
      created_at: `2024-09-${String(randInt(1, 28)).padStart(2, '0')}T12:00:00Z`,
    });
  }

  return {
    institutions,
    programmes,
    intakes,
    students,
    enrolments,
    batches,
    duplicateCases,
    submissionErrors,
    auditLogs,
  };
}
