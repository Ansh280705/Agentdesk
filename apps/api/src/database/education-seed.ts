/**
 * EDUCATION SYSTEM SEED — College Presentation
 * Populates the Knowledge Hub with a complete fictional education system
 * (Sunrise Institute of Technology & Management) for each demo login.
 *
 * Run: npx ts-node src/database/education-seed.ts
 */
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../../.env.demo') });
dotenv.config({ path: path.join(__dirname, '../../.env') });

import '../utils/dns-fix';
import { getPool, initPool } from './pool';
import { v4 as uuidv4 } from 'uuid';

// Every login that should see the education data (must own a workspace)
const TARGET_EMAILS = [
  'ansh@agentdesk.dev',
  'anshrathore028@gmail.com',
  'anshrathore2807@gmail.com',
];

type KDoc = { title: string; type: string; tags: string[]; content: string };

const DOCS: KDoc[] = [
  {
    title: 'SITM — College Overview',
    type: 'document',
    tags: ['college', 'overview', 'about'],
    content: [
      'Sunrise Institute of Technology & Management (SITM), established 1998, is a private engineering and management institute affiliated with the State Technical University and approved by AICTE.',
      '',
      'Campus: 42 acres, 6 academic blocks, central library, auditorium (1200 seats), 3 hostels, sports complex.',
      'Accreditation: NAAC "A" grade, NBA accredited programs (CSE, ECE, ME).',
      'Enrollment: 4,800 students | Faculty: 310 | Staff: 145',
      'Programs: 6 UG (B.Tech), 4 PG (M.Tech, MBA), PhD in 5 disciplines.',
      'Motto: "Knowledge. Character. Excellence."',
      'Website: www.sitm.edu.in | Helpline: 1800-419-2200',
    ].join('\n'),
  },
  {
    title: 'Academic Calendar 2025-26',
    type: 'document',
    tags: ['calendar', 'academic', 'dates', 'semester'],
    content: [
      'ODD SEMESTER (Aug-Dec 2025):',
      '- Semester begins: Aug 4, 2025',
      '- Mid-semester exams: Oct 6-11, 2025',
      '- Classes end: Nov 21, 2025',
      '- End-semester exams: Dec 1-15, 2025',
      '- Winter break: Dec 16, 2025 - Jan 4, 2026',
      '',
      'EVEN SEMESTER (Jan-May 2026):',
      '- Semester begins: Jan 5, 2026',
      '- Mid-semester exams: Mar 9-14, 2026',
      '- Classes end: Apr 24, 2026',
      '- End-semester exams: May 4-18, 2026',
      '- Summer break / internships: May 19 - Jul 31, 2026',
      '',
      'Result declaration: within 21 days of last exam.',
    ].join('\n'),
  },
  {
    title: 'Departments & Programs Offered',
    type: 'fact',
    tags: ['departments', 'programs', 'courses', 'btech', 'mtech', 'mba'],
    content: [
      'UNDERGRADUATE (B.Tech, 4 years, 120 seats each):',
      '- Computer Science & Engineering (CSE)',
      '- Electronics & Communication Engineering (ECE)',
      '- Mechanical Engineering (ME)',
      '- Civil Engineering (CE)',
      '- Information Technology (IT)',
      '- Artificial Intelligence & Data Science (AI&DS)',
      '',
      'POSTGRADUATE:',
      '- M.Tech: CSE, VLSI Design, Structural Engg, Thermal Engg (24 seats each)',
      '- MBA: Finance, Marketing, HR, Business Analytics (180 seats)',
      '',
      'DOCTORAL: PhD in CSE, ECE, ME, Physics, Management Studies.',
    ].join('\n'),
  },
  {
    title: 'Admission Process & Eligibility',
    type: 'procedure',
    tags: ['admission', 'eligibility', 'entrance', 'counselling'],
    content: [
      'B.Tech Admission:',
      '1. Appear for JEE Main / State CET.',
      '2. Register for centralized counselling (JoSAA/state portal).',
      '3. Seat allotment based on rank + preferences.',
      '4. Report to campus with documents within 5 working days.',
      '',
      'Eligibility: 10+2 with Physics, Chemistry, Mathematics; minimum 60% aggregate (55% for reserved categories).',
      'MBA: Graduation 50%+ and valid CAT/MAT/CMAT score, followed by GD-PI.',
      '',
      'Documents required: 10th & 12th marksheets, entrance scorecard, transfer certificate, migration certificate, caste certificate (if applicable), 6 passport photos, Aadhaar.',
      'Admission office: Block A, Room 102 | admissions@sitm.edu.in | 0731-2550-100',
    ].join('\n'),
  },
  {
    title: 'Fee Structure 2025-26',
    type: 'fact',
    tags: ['fees', 'payment', 'tuition', 'hostel'],
    content: [
      'B.Tech (per year): Tuition INR 95,000 | Development INR 15,000 | Exam INR 5,000 | Total INR 1,15,000',
      'M.Tech (per year): INR 78,000',
      'MBA (per year): INR 1,45,000',
      '',
      'HOSTEL (per year):',
      '- Triple sharing: INR 62,000 (incl. mess)',
      '- Double sharing: INR 78,000 (incl. mess)',
      '- Single AC room: INR 1,10,000 (incl. mess)',
      '',
      'One-time charges (first year only): Admission fee INR 10,000 | Caution deposit (refundable) INR 10,000 | Alumni fund INR 2,000.',
      'Transport (optional): INR 18,000-26,000/year depending on route.',
      'Payment modes: student portal (UPI/netbanking/DD). Late fee: INR 100/day after due date.',
    ].join('\n'),
  },
  {
    title: 'Scholarship & Financial Aid Schemes',
    type: 'procedure',
    tags: ['scholarship', 'financial aid', 'merit'],
    content: [
      'INSTITUTE SCHOLARSHIPS:',
      '- Merit Scholarship: 100% tuition waiver for JEE Main rank < 5,000; 50% for rank < 15,000.',
      '- Dean\'s Merit List: INR 25,000/year for top 3 students per branch per year (CGPA based).',
      '- Sports Excellence: 25% tuition waiver for state/national level athletes.',
      '',
      'GOVERNMENT SCHEMES (apply via National Scholarship Portal):',
      '- Post-matric scholarship for SC/ST/OBC students.',
      '- EWS scholarship: family income < INR 8 lakh/year.',
      '- Minority & single-girl-child schemes.',
      '',
      'Education loan assistance: tie-ups with SBI, HDFC Credila, PNB. Loan desk at Block A, Room 104.',
      'Apply by Sept 30 each year via Student Portal > Scholarships.',
    ].join('\n'),
  },
  {
    title: 'Examination Rules & Grading System',
    type: 'procedure',
    tags: ['exam', 'grading', 'cgpa', 'rules', 'evaluation'],
    content: [
      'GRADING (10-point CBCS scale):',
      'O (Outstanding) = 10 | A+ = 9 | A = 8 | B+ = 7 | B = 6 | C = 5 | P (Pass) = 4 | F = 0 (Fail)',
      'Marks: O >= 90, A+ 80-89, A 70-79, B+ 60-69, B 50-59, C 45-49, P 40-44, F < 40.',
      'SGPA = weighted average of grade points by credits. CGPA = cumulative across semesters.',
      '',
      'ASSESSMENT SPLIT: 30 marks internal (mid-sem 15 + quizzes/assignments 10 + attendance 5) + 70 marks end-semester exam.',
      '',
      'RULES:',
      '- Minimum 40% required in end-sem exam AND overall to pass.',
      '- No electronic devices in exam hall; malpractice = semester debarment.',
      '- Re-evaluation: apply within 7 days of result, INR 500/paper.',
      '- Backlog (supplementary) exams held in July/January.',
    ].join('\n'),
  },
  {
    title: 'End-Semester Exam Schedule — December 2025',
    type: 'document',
    tags: ['exam', 'timetable', 'schedule', 'december'],
    content: [
      'Dec 1 (Mon): Engineering Mathematics III (CSE/IT/AI&DS), Thermodynamics (ME), Structural Analysis (CE)',
      'Dec 3 (Wed): Data Structures & Algorithms (CSE), Digital Signal Processing (ECE)',
      'Dec 5 (Fri): Database Management Systems (CSE/IT), Analog Circuits (ECE)',
      'Dec 8 (Mon): Operating Systems (CSE/IT), Fluid Mechanics (ME/CE)',
      'Dec 10 (Wed): Computer Networks (CSE), Machine Design (ME), Electromagnetic Theory (ECE)',
      'Dec 12 (Fri): Elective I (all branches)',
      'Dec 15 (Mon): Open Elective / Humanities elective (all branches)',
      '',
      'Timing: Morning slot 9:30 AM - 12:30 PM | Afternoon slot 2:00 - 5:00 PM',
      'Hall tickets downloadable from Student Portal 7 days before first exam. ID card mandatory.',
    ].join('\n'),
  },
  {
    title: 'Attendance Policy',
    type: 'procedure',
    tags: ['attendance', 'policy', 'rules'],
    content: [
      'Minimum 75% attendance required per course to be eligible for end-semester exams.',
      '65-74%: condonation allowed once per semester with valid medical/emergency proof + INR 500 fine per course.',
      'Below 65%: detained — must repeat the course.',
      '',
      'Attendance marked per lecture via faculty app; synced to student portal within 24 hrs.',
      'Medical leave: submit certificate to class coordinator within 7 days.',
      'Duty leave: official college events, sports, placement drives count as attended (max 10% of classes).',
      'Warning emails auto-sent to parents at 80% and 75% thresholds.',
    ].join('\n'),
  },
  {
    title: 'Credit System (CBCS) Explained',
    type: 'fact',
    tags: ['credits', 'cbcs', 'curriculum', 'electives'],
    content: [
      'B.Tech requires 160 credits over 8 semesters (~20 credits/semester).',
      'Lecture-Tutorial-Practical (L-T-P) format: 1 lecture hour = 1 credit; 2 lab hours = 1 credit.',
      '',
      'COURSE BASKETS:',
      '- Core (PCC): ~90 credits, mandatory.',
      '- Departmental Electives (PE): ~24 credits, choose within branch.',
      '- Open Electives (OE): ~12 credits, any department.',
      '- Humanities (HSMC) & Basic Science (BSC): ~20 credits.',
      '- Project + Internship: 14 credits (final year major project 10, summer internship 4).',
      '',
      'Audit courses (NSS/Yoga/Ethics) are mandatory but non-credit.',
      'Students may register for up to 26 credits/semester (accelerated track for CGPA > 8.5).',
    ].join('\n'),
  },
  {
    title: 'Faculty Directory — Computer Science & Engineering',
    type: 'document',
    tags: ['faculty', 'cse', 'directory', 'professors'],
    content: [
      'Dr. Kavita Deshmukh — Professor & HOD | PhD IIT Bombay | Machine Learning | Room B-301 | k.deshmukh@sitm.edu.in',
      'Dr. Rajan Iyer — Professor | PhD IISc | Distributed Systems | B-302',
      'Dr. Neha Kulkarni — Associate Professor | PhD NIT Trichy | Computer Vision | B-303',
      'Prof. Amitabh Saxena — Associate Professor | M.Tech IIT Delhi | Cybersecurity | B-304',
      'Dr. Farah Siddiqui — Associate Professor | PhD | Natural Language Processing | B-305',
      'Prof. Rohit Verma — Assistant Professor | M.Tech | Databases & Cloud | B-306',
      'Prof. Sneha Patil — Assistant Professor | M.Tech | Web Technologies | B-307',
      'Prof. Vikram Joshi — Assistant Professor | M.Tech | Operating Systems | B-308',
      '',
      'Dept. office: Block B, 3rd floor | cse@sitm.edu.in | Ext. 3300',
    ].join('\n'),
  },
  {
    title: 'Faculty Directory — Electronics, Mechanical & Civil',
    type: 'document',
    tags: ['faculty', 'ece', 'mechanical', 'civil', 'directory'],
    content: [
      'ECE: Dr. Suresh Menon (HOD, VLSI, C-401), Dr. Anita Rao (Embedded Systems, C-402), Prof. Kunal Shah (Communication Systems, C-403), Dr. Lakshmi Nair (Signal Processing, C-404)',
      '',
      'MECHANICAL: Dr. Pradeep Chauhan (HOD, Thermal Engg, D-401), Prof. Harish Gill (Manufacturing, D-402), Dr. Meena Krishnan (Robotics, D-403), Prof. Devendra Pal (CAD/CAM, D-404)',
      '',
      'CIVIL: Dr. Geeta Bansal (HOD, Structures, E-401), Prof. Arun Desai (Transportation, E-402), Dr. Sameer Qureshi (Geotechnical, E-403)',
      '',
      'Consultation hours: Mon/Wed/Fri 3:30-4:30 PM. Email first or book via portal.',
    ].join('\n'),
  },
  {
    title: 'Student Handbook — Code of Conduct',
    type: 'document',
    tags: ['handbook', 'conduct', 'rules', 'discipline'],
    content: [
      '1. Students must carry ID cards on campus at all times.',
      '2. Dress code: formal/decent casual; uniform on Mondays and official events.',
      '3. Mobile phones on silent in academic areas; prohibited in exam halls and labs during assessments.',
      '4. Plagiarism in assignments/projects leads to grade penalty + disciplinary record.',
      '5. Damage to campus property is recoverable with fine.',
      '6. Substance abuse (alcohol/drugs/tobacco) = suspension up to one semester.',
      '7. Harassment/discrimination complaints go to the Internal Complaints Committee (icc@sitm.edu.in).',
      '8. Disciplinary actions: warning -> probation -> suspension -> expulsion.',
      '9. Students are ambassadors of the institute in internships, events, and public forums.',
    ].join('\n'),
  },
  {
    title: 'Central Library — Information & Rules',
    type: 'document',
    tags: ['library', 'books', 'resources', 'rules'],
    content: [
      'Collection: 1,40,000 volumes, 85 journals, IEEE/Springer/Elsevier e-resources, DELNET membership.',
      'Timings: Mon-Sat 8 AM - 9 PM | Sun 9 AM - 5 PM | Exam season: 24x7 reading hall.',
      '',
      'BORROWING: Students 4 books / 14 days | Faculty 8 books / 30 days. Renewal once if no reservation.',
      'Fine: INR 5/day overdue. Lost book = replacement cost + 20% processing fee.',
      'Digital section: 60 systems, e-journal access via campus Wi-Fi or remote login (portal credentials).',
      'Book bank scheme: SC/ST students get full semester set free.',
      'Quiet zones on floors 2-3; discussion rooms bookable via portal (2 hr slots).',
      'Librarian: Dr. Meenakshi Rao | library@sitm.edu.in | Ext. 4400',
    ].join('\n'),
  },
  {
    title: 'Hostel Rules & Facilities',
    type: 'document',
    tags: ['hostel', 'accommodation', 'mess', 'rules'],
    content: [
      'HOSTELS: Adarsh Bhavan (Boys, 400 beds), Kaveri Bhavan (Girls, 350 beds), Nalanda Bhavan (PG, 120 beds).',
      'Room allotment: first-come at admission; roommate requests honored if mutual.',
      'In-time: Boys 10 PM | Girls 9 PM. Late entry requires warden approval.',
      'Mess: veg + non-veg (4 days/week), rotating menu set by student mess committee. Mess timings: Breakfast 7:30-9 AM, Lunch 12:30-2 PM, Snacks 5 PM, Dinner 7:30-9:30 PM.',
      '',
      'Facilities: Wi-Fi 100 Mbps, laundry, gym, common room (TV+indoor games), water coolers, solar hot water.',
      'Visitors: parents/guardians only, 9 AM - 7 PM in visitor lounge.',
      'Wardens: Mr. T. Sharma (Adarsh) Ext. 5501 | Ms. R. Kapoor (Kaveri) Ext. 5502',
    ].join('\n'),
  },
  {
    title: 'CSE Syllabus — Semester 5 (Core Courses)',
    type: 'document',
    tags: ['syllabus', 'cse', 'semester5', 'curriculum'],
    content: [
      'CS-501 Database Management Systems: ER modelling, SQL, normalization (1NF-BCNF), transactions, concurrency control, indexing, NoSQL intro. Text: Silberschatz, Korth.',
      'CS-502 Operating Systems: processes, threads, CPU scheduling, deadlocks, memory management, file systems, Linux internals. Text: Galvin.',
      'CS-503 Computer Networks: OSI/TCP-IP, routing algorithms, TCP/UDP, congestion control, DNS, HTTP, basics of security. Text: Kurose & Ross.',
      'CS-504 Design & Analysis of Algorithms: divide & conquer, greedy, DP, graphs, NP-completeness, approximation. Text: CLRS.',
      'CS-505 Machine Learning: regression, classification, SVM, ensembles, clustering, neural nets intro. Text: Bishop/Murphy.',
      'CS-506 DBMS Lab | CS-507 Networks Lab | CS-508 ML Lab.',
      'Electives offered: Cloud Computing, Information Security, Data Mining, Mobile Computing.',
    ].join('\n'),
  },
  {
    title: 'Placement Statistics 2024-25',
    type: 'fact',
    tags: ['placements', 'statistics', 'recruiters', 'salary'],
    content: [
      'Overall placement: 87.4% of eligible students placed.',
      'Offers: 1,124 total | 214 PPOs from internships.',
      '',
      'SALARY: Highest INR 48 LPA (international, SDE) | Domestic high INR 32 LPA | Average INR 6.8 LPA | Median INR 5.5 LPA.',
      '',
      'BRANCH-WISE PLACED %: CSE 96% | AI&DS 94% | IT 93% | ECE 88% | ME 74% | CE 68% | MBA 91%.',
      '',
      'TOP RECRUITERS: TCS (142 offers), Infosys (118), Wipro (96), Accenture (84), Cognizant (77), Amazon (12), Microsoft (8), Goldman Sachs (6), Deloitte (41), L&T (33), Bosch (28), Hexaware, Capgemini, Persistent, ZS Associates.',
      'Dream offer policy: student may hold 1 regular + 1 dream (>10 LPA) offer.',
    ].join('\n'),
  },
  {
    title: 'Training & Placement Cell — Process',
    type: 'procedure',
    tags: ['placement', 'training', 'tpo', 'recruitment'],
    content: [
      '1. Register on the placement portal in Semester 5 (mandatory for placement assistance).',
      '2. Attend pre-placement training: aptitude (40 hrs), technical (60 hrs), soft skills (20 hrs) during Sem 5-6.',
      '3. Resume vetting by TPC before company applications.',
      '4. Drive flow: PPT -> online test -> technical rounds -> HR round -> offer.',
      '5. Once placed in a regular offer, students sit only for dream (>10 LPA) companies.',
      '6. Debarment: backing out after accepting an offer or skipping drives without approval.',
      '',
      'TPC team: Dr. Sanjay Khanna (TPO), 3 placement officers, 42 student coordinators.',
      'Contact: placements@sitm.edu.in | Block A, Room 210 | Ext. 2100',
    ].join('\n'),
  },
  {
    title: 'Summer Internship Policy',
    type: 'procedure',
    tags: ['internship', 'policy', 'industry'],
    content: [
      'Mandatory 6-8 week internship after Semester 6 (4 credits, evaluated in Sem 7).',
      'Sources: TPC-arranged drives, self-sourced (needs prior approval letter), research internships at IITs/NITs via faculty referral.',
      '',
      'Requirements:',
      '- Offer letter submitted to department coordinator before joining.',
      '- Weekly progress log on portal.',
      '- Final report (20-30 pages) + industry mentor evaluation + viva presentation.',
      'Grading: mentor feedback 40% + report 30% + viva 30%.',
      'Stipend is not mandatory but >90% of TPC-arranged internships are paid (avg INR 12,000/month).',
    ].join('\n'),
  },
  {
    title: 'Student Clubs & Societies',
    type: 'document',
    tags: ['clubs', 'societies', 'extracurricular'],
    content: [
      'TECHNICAL: Coding Club (CodeChef chapter), Robotics & Automation Society, IEEE Student Branch, GDSC (Google Developer Student Club), Drone & Aerospace Club, Cybersecurity Cell (Null chapter).',
      '',
      'CULTURAL: Aagaaz (dramatics), Swaranjali (music), Nrityangana (dance), LensCraft (photography), Kalakriti (fine arts), Literati (debate & literary society).',
      '',
      'SOCIAL & SERVICE: NSS unit, Rotaract Club, Udaan (teaching underprivileged kids), Green Warriors (environment).',
      '',
      'Recruitment: Club Fest in 2nd week of odd semester. Faculty mentor assigned to each club.',
      'Funding: INR 15,000-60,000/club/year based on activity plan; extra via sponsorships.',
    ].join('\n'),
  },
  {
    title: 'Annual Fests & Major Events',
    type: 'document',
    tags: ['fest', 'events', 'cultural', 'technical'],
    content: [
      'TECHNITON (March): Annual techno-management fest — hackathon, robo-wars, paper presentations, RC racing. Footfall ~8,000, budget INR 40L.',
      'SPANDAN (October): Cultural fest — Battle of Bands, EDM night, fashion show, celebrity night.',
      'KRIIDA (February): Inter-college sports meet — cricket, football, basketball, athletics, 22 participating colleges.',
      'TEDxSITM (September): Independently organized TED event, 10 speakers.',
      'ALUMNI MEET: First Sunday of January every year.',
      'FRESHERS (Abhinandan): August | FAREWELL (Aavirbhav): May.',
      'Convocation: November, degrees conferred by the University Vice-Chancellor.',
    ].join('\n'),
  },
  {
    title: 'Sports Facilities & Annual Sports Meet',
    type: 'document',
    tags: ['sports', 'facilities', 'fitness'],
    content: [
      'Outdoor: 400m athletics track, cricket ground, 2 football fields, 3 basketball courts, 2 tennis courts, volleyball courts, kabaddi arena.',
      'Indoor: Badminton hall (4 courts), table tennis (6 tables), chess & carrom room, fully-equipped gym (6-8 AM / 4-8 PM).',
      'Swimming pool: 25m, 6 lanes, coaching available.',
      '',
      'Annual sports meet KRIIDA in February. Inter-branch league runs all year.',
      'Sports quota: 2% seats reserved; athletes get attendance relaxations and kit allowance.',
      'Sports Officer: Mr. Devendra Singh | Ext. 6600 | sports@sitm.edu.in',
    ].join('\n'),
  },
  {
    title: 'Transport & Bus Routes',
    type: 'document',
    tags: ['transport', 'bus', 'routes', 'commute'],
    content: [
      '14 college buses covering the city. Annual fee: INR 18,000-26,000 by distance slab.',
      'Route highlights:',
      '- R1: Railway Station -> Palasia -> Vijay Nagar -> Campus (45 min)',
      '- R3: Airport Road -> Rau Circle -> Campus (50 min)',
      '- R7: Bhawarkua -> Sudama Nagar -> Campus (35 min)',
      '- R12: Nipania -> Bypass -> Campus (40 min)',
      '',
      'First pickup 7:15 AM; evening departures 4:40 PM & 6:10 PM.',
      'Live bus tracking in the SITM Student app (GPS).',
      'Late-evening bus after library hours (9:15 PM) to 3 major stops for hostel-city commuters.',
      'Transport incharge: Mr. R. Tiwari, Ext. 7700.',
    ].join('\n'),
  },
  {
    title: 'Health Center & Medical Facilities',
    type: 'document',
    tags: ['health', 'medical', 'doctor', 'emergency'],
    content: [
      'Campus Health Center: Block A ground floor, 8 AM - 8 PM. Two resident doctors + 4 nurses.',
      '24x7 ambulance on campus; tie-up with City Care Hospital (3 km) for emergencies.',
      'Services: OPD, first aid, basic medicines free, physiotherapy (Tue/Thu), annual health checkup.',
      'Counseling center: 2 psychologists, confidential appointments via portal. Mental health helpline: Ext. 8800.',
      'All students covered under group medical insurance (INR 1 lakh/year, premium included in fees).',
      'Medical leave procedure in Attendance Policy doc.',
    ].join('\n'),
  },
  {
    title: 'Anti-Ragging Policy',
    type: 'procedure',
    tags: ['antiragging', 'policy', 'safety', 'discipline'],
    content: [
      'SITM has ZERO TOLERANCE for ragging (UGC Regulations 2009).',
      'Ragging includes: physical/mental harassment, forced activities, bullying, cyber-ragging, extortion.',
      'Penalties: suspension, expulsion, FIR, debarring from exams/placements, fine up to INR 2.5 lakh.',
      '',
      'Anti-Ragging Squad: proctor + wardens patrol hostels & campus, especially July-September.',
      'Helpline: 1800-180-5522 (UGC) | Campus squad: Ext. 9999 | antiragging@sitm.edu.in',
      'Mandatory anti-ragging affidavit by every student + parent at admission.',
      'Fresher-senior interaction only in designated areas for the first month.',
    ].join('\n'),
  },
  {
    title: 'Grievance Redressal Mechanism',
    type: 'procedure',
    tags: ['grievance', 'complaints', 'redressal'],
    content: [
      'Level 1: Class coordinator / mentor (resolve within 3 working days).',
      'Level 2: Departmental Grievance Cell chaired by HOD (7 days).',
      'Level 3: Institute Grievance Redressal Committee chaired by Dean Student Welfare (15 days).',
      'Appeal: Director\'s office.',
      '',
      'Online: Student Portal > Grievances (ticket tracked with SLA).',
      'Dedicated cells: Internal Complaints Committee (harassment), SC/ST Cell, OBC Cell, Women\'s Cell.',
      'Anonymous reporting available; retaliation against complainants is itself a punishable offence.',
      'Registrar office: registrar@sitm.edu.in | Ext. 1100',
    ].join('\n'),
  },
  {
    title: 'Research Centers & Publications',
    type: 'document',
    tags: ['research', 'centers', 'publications', 'phd'],
    content: [
      'CENTERS OF EXCELLENCE:',
      '- AI & Robotics Lab (DST-funded, INR 1.2 Cr grant)',
      '- Center for Renewable Energy Systems',
      '- VLSI & Embedded Systems Lab',
      '- Materials Testing & Research Lab',
      '- Center for Data Science & Analytics',
      '',
      '2024-25 output: 142 Scopus/WoS papers, 18 patents filed (6 granted), 9 funded projects (DST, AICTE, SERB) worth INR 3.8 Cr.',
      'Undergraduate research: URP (Undergraduate Research Program) — 60 slots/year, INR 10,000 stipend, publication support.',
      'Annual research symposium "Innovancia" every April.',
    ].join('\n'),
  },
  {
    title: 'Alumni Network',
    type: 'document',
    tags: ['alumni', 'network', 'community'],
    content: [
      'SITM Alumni Association: 21,000+ registered alumni across 40 countries.',
      'Chapters: Bangalore, Pune, Hyderabad, Delhi-NCR, Mumbai, Bay Area, Singapore, London.',
      '',
      'Programs:',
      '- Alumni Mentorship Program: 400+ active mentor-mentee pairs.',
      '- Distinguished Alumni Lecture Series (monthly).',
      '- Alumni-funded scholarships: INR 18L disbursed in 2024-25.',
      '- Referral hiring drives with 60+ alumni-led companies.',
      '',
      'Notable alumni: founders of 3 funded startups, 14 IAS/IPS officers, senior leaders at Google, Amazon, ISRO, Deloitte.',
      'Alumni portal: alumni.sitm.edu.in | Coordinator: Ms. Jyoti Verma, Ext. 9900',
    ].join('\n'),
  },
  {
    title: 'Class Timetable — CSE Semester 5 (Section A)',
    type: 'document',
    tags: ['timetable', 'schedule', 'classes', 'cse'],
    content: [
      'Mon: DBMS (9-10), OS (10-11), Networks (11-12) | ML Lab 2-5 PM',
      'Tue: DAA (9-10), DBMS (10-11), Elective-I (11-12) | Networks Lab 2-5 PM',
      'Wed: OS (9-10), ML (10-11), DAA (11-12) | DBMS Lab 2-5 PM',
      'Thu: Networks (9-10), Elective-I (10-11), ML (11-12) | Library/Self-study 2-4, Mentoring 4-5',
      'Fri: DAA (9-10), OS (10-11), DBMS (11-12) | Club hours 2-5 PM',
      'Sat: Remedial/tutorial classes 9-12 (only for notified courses)',
      '',
      'Lunch: 12-1 PM. Venue: Block B, Rooms B-201/B-204 (labs: CSE Lab 1 & 2).',
      'Class Coordinator: Prof. Rohit Verma | CR: to be elected in week 1.',
    ].join('\n'),
  },
  {
    title: 'Student Portal & LMS Guide',
    type: 'procedure',
    tags: ['portal', 'lms', 'erp', 'guide', 'howto'],
    content: [
      'SITM Student Portal (portal.sitm.edu.in) — single sign-on for:',
      '- Attendance tracker & leave applications',
      '- Fee payment & receipts',
      '- Exam registration, hall tickets, results',
      '- Grievance tickets',
      '- Club enrollment & event registration',
      '',
      'Moodle LMS (lms.sitm.edu.in): course materials, assignment submissions, quizzes, discussion forums.',
      'Login: roll number + DOB (first login, then change password).',
      'Forgot password: Helpdesk Block A, Room 108 or helpdesk@sitm.edu.in with ID proof.',
      'Mobile app "SITM Student" (Android/iOS): attendance, timetable, bus tracking, notifications.',
    ].join('\n'),
  },
  {
    title: 'Examination Form & Re-evaluation Process',
    type: 'procedure',
    tags: ['exam form', 'reevaluation', 'procedure', 'backlog'],
    content: [
      'EXAM FORM: fill via portal within 10 days of notification; regular exam fee included in annual fees; backlog fee INR 800/course.',
      'Hall ticket auto-generated 7 days before exams — print + carry ID card.',
      '',
      'RESULT: declared on portal within 21 days; grade card downloadable.',
      '',
      'RE-EVALUATION: apply within 7 days of result, INR 500/paper. Outcome: marks can go up or stay (never reduced). Refund if grade changes.',
      'PHOTOCOPY of answer sheet: INR 300/paper, apply within 5 days of result.',
      'Backlog exams: supplementary held in July & January; maximum 4 attempts per course.',
    ].join('\n'),
  },
  {
    title: 'Holiday List 2025-26',
    type: 'fact',
    tags: ['holidays', 'calendar', 'dates'],
    content: [
      'Aug 15: Independence Day | Aug 27: Ganesh Chaturthi',
      'Oct 2: Gandhi Jayanti | Oct 20-23: Diwali break | Oct 31: Milad-un-Nabi*',
      'Nov 5: Guru Nanak Jayanti',
      'Dec 25: Christmas',
      'Jan 14: Makar Sankranti | Jan 26: Republic Day',
      'Mar 4: Holi | Mar 21: Eid-ul-Fitr*',
      'Apr 10: Ram Navami | May 1: Labour Day',
      '',
      '(* dates per lunar calendar, notified via circular)',
      'Vacations: Winter Dec 16-Jan 4 | Summer May 19-Jul 31 (internship period for pre-final year).',
      'Institute foundation day (Oct 18) is a working day with celebrations after 3 PM.',
    ].join('\n'),
  },
  {
    title: 'Dean & Administration Contacts',
    type: 'fact',
    tags: ['administration', 'dean', 'contacts', 'hod'],
    content: [
      'Director: Dr. S. K. Mahajan | director@sitm.edu.in | Ext. 1000',
      'Dean Academics: Dr. P. R. Sharma | dean.academics@sitm.edu.in | Ext. 1001',
      'Dean Student Welfare: Dr. Anjali Bhat | dsw@sitm.edu.in | Ext. 1002',
      'Registrar: Mr. K. S. Chauhan | registrar@sitm.edu.in | Ext. 1100',
      'Controller of Examinations: Dr. Vivek Nair | coe@sitm.edu.in | Ext. 1200',
      'Chief Proctor (Discipline): Dr. Ramesh Gupta | Ext. 1300',
      'Finance Officer: Mr. S. Agarwal | Ext. 1400',
      'Training & Placement Officer: Dr. Sanjay Khanna | placements@sitm.edu.in | Ext. 2100',
      '',
      'Reception: 0731-2550-000 | Main gate security: Ext. 1111',
    ].join('\n'),
  },
  {
    title: 'IT Infrastructure & Wi-Fi Policy',
    type: 'document',
    tags: ['it', 'wifi', 'infrastructure', 'labs'],
    content: [
      'Campus Wi-Fi (SITM-SECURE): 1 Gbps backbone, WPA2-Enterprise login with portal credentials. Fair use 40 GB/month/student.',
      'Computing: 24 labs, 1,400+ systems; GPU lab (8x NVIDIA RTX A4000) for AI/ML coursework — book via portal.',
      'Software: Microsoft campus license, MATLAB, AutoCAD, SolidWorks, Oracle Academy, AWS Educate credits.',
      'Email: every student gets rollno@sitm.edu.in (Google Workspace for Education).',
      'Acceptable use: no torrenting, crypto mining, or unauthorized access attempts — monitored and logged.',
      'IT Helpdesk: Block A, Room 108 | Ext. 1800 | it-help@sitm.edu.in',
    ].join('\n'),
  },
];

async function run() {
  await initPool();
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    console.log('[edu-seed] Seeding education system knowledge base...\n');

    for (const email of TARGET_EMAILS) {
      const user = await client.query('SELECT id, name FROM users WHERE email=$1', [email]);
      if (!user.rows.length) {
        console.log('  SKIP (no user): ' + email);
        continue;
      }
      const userId = user.rows[0].id as string;

      const ws = await client.query('SELECT id, name FROM workspaces WHERE owner_id=$1 LIMIT 1', [userId]);
      if (!ws.rows.length) {
        console.log('  SKIP (no owned workspace): ' + email);
        continue;
      }
      const wsId = ws.rows[0].id as string;

      const existing = await client.query(
        'SELECT title FROM knowledge_documents WHERE user_id=$1 AND workspace_id=$2',
        [userId, wsId]
      );
      const have = new Set(existing.rows.map((r: { title: string }) => r.title));

      let added = 0;
      for (const doc of DOCS) {
        if (have.has(doc.title)) continue;
        await client.query(
          'INSERT INTO knowledge_documents (id,workspace_id,user_id,title,content,type,tags) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [uuidv4(), wsId, userId, doc.title, doc.content, doc.type, doc.tags]
        );
        added++;
      }
      console.log(`  ${email} (${ws.rows[0].name}): +${added} docs, ${have.size + added} total`);
    }

    await client.query('COMMIT');
    console.log('\n[edu-seed] Done.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('[edu-seed] Failed:', err);
  process.exit(1);
});
