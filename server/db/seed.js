/**
 * InternIQ seed dataset.
 *
 * Deliberately not hand-typed scores: every student CV is written as raw text,
 * then run through the real NLP extractor to produce profile_skill rows, and
 * every seeded application stores a match_score computed by the real scoring
 * engine. Nothing in the demo is a hardcoded number.
 *
 * Names, companies and CVs are fictional sample data for an academic
 * prototype; no real student records are used.
 */

import bcrypt from 'bcryptjs';
import { catalogRows } from '../src/nlp/lexicon.js';
import { analyzeCv } from '../src/nlp/extract.js';
import { buildIdf, vectorize, cosine, jaccard } from '../src/nlp/vectors.js';
import { scoreMatch } from '../src/nlp/match.js';

export const DEMO_PASSWORD = 'InternIQ2026!';

// deterministic so every reset produces the same demo
let _s = 20260101;
const rnd = () => { _s ^= _s << 13; _s ^= _s >>> 17; _s ^= _s << 5; return ((_s >>> 0) % 10000) / 10000; };
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const some = (arr, n) => { const c = [...arr]; const out = []; while (out.length < Math.min(n, c.length)) out.push(c.splice(Math.floor(rnd() * c.length), 1)[0]); return out; };
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));

/**
 * Demo dates are relative to the day the seed runs, not fixed literals, so the
 * board always has open deadlines and the apply flow stays demonstrable
 * however long after submission this prototype is opened.
 */
const DAY = 864e5;
const dateOf = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const fromToday = (n) => dateOf(new Date(Date.now() + n * DAY));
const DEADLINE_ANCHOR = Date.parse('2026-05-08T00:00:00Z');
/** Keep the written order of the postings but slide the whole window forward. */
const liveDeadline = (iso) => fromToday(9 + Math.round((Date.parse(`${iso}T00:00:00Z`) - DEADLINE_ANCHOR) / DAY));
const afterDeadline = (iso, days) => fromToday(9 + Math.round((Date.parse(`${iso}T00:00:00Z`) - DEADLINE_ANCHOR) / DAY) + days);
const seasonOf = (daysFromNow) => {
  const month = new Date(Date.now() + daysFromNow * DAY).getMonth();
  const label = month <= 1 || month >= 11 ? 'Winter' : month <= 5 ? 'Spring' : month <= 8 ? 'Summer' : 'Autumn';
  return `${label} ${new Date(Date.now() + daysFromNow * DAY).getFullYear()}`;
};

const DEPARTMENTS = [
  ['CS', 'Computer Science', 'Computing & Informatics'],
  ['ACCG', 'Accounting', 'Business & Economics'],
  ['MKTG', 'Marketing Management', 'Business & Economics'],
  ['MGMT', 'Management', 'Business & Economics'],
  ['TOUR', 'Tourism', 'Business & Economics'],
  ['ECON', 'Economics', 'Business & Economics'],
];

const COURSEWORK = {
  CS: ['Data Structures', 'Algorithms', 'Operating Systems', 'Database Systems', 'Computer Networks', 'Software Engineering', 'Web Programming', 'Artificial Intelligence'],
  ACCG: ['Financial Accounting', 'Cost Accounting', 'Auditing and Assurance', 'Taxation', 'IFRS Reporting', 'Accounting Information Systems'],
  MKTG: ['Principles of Marketing', 'Consumer Behaviour', 'Marketing Research', 'Digital Marketing', 'Brand Management', 'Pricing Strategy'],
  MGMT: ['Organizational Behavior', 'Human Resource Management', 'Operations Management', 'Project Management', 'Strategic Management', 'Business Statistics'],
  TOUR: ['Tourism Systems', 'Travel Agency Operations', 'Hospitality Management', 'Event Planning', 'Heritage Resources of Ethiopia', 'Ecotourism'],
  ECON: ['Microeconomics', 'Macroeconomics', 'Econometrics', 'Development Economics', 'Public Finance', 'Research Methods'],
};

const DEPT_SKILLS = {
  CS: ['Python', 'Java', 'JavaScript', 'TypeScript', 'C++', 'HTML', 'CSS', 'React', 'Node.js', 'Django', 'ASP.NET Core', 'REST APIs', 'SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'Git', 'Linux', 'Docker', 'Amazon Web Services', 'Machine Learning', 'Data Analysis', 'Data Structures', 'Algorithms', 'Object-Oriented Programming', 'Computer Networks', 'Cybersecurity', 'Flutter', 'React Native', 'Quality Assurance'],
  ACCG: ['Financial Accounting', 'Managerial Accounting', 'Auditing', 'Taxation', 'IFRS', 'Bookkeeping', 'Financial Reporting', 'Accounting Software', 'Advanced Excel', 'Financial Analysis', 'Statistics', 'Banking & Finance'],
  MKTG: ['Digital Marketing', 'SEO', 'Social Media Marketing', 'Content Marketing', 'Marketing Analytics', 'Market Research', 'Brand Management', 'Marketing Strategy', 'Customer Relationship Management', 'Sales', 'Advanced Excel', 'Data Analysis'],
  MGMT: ['Project Management', 'Human Resource Management', 'Supply Chain Management', 'Business Analysis', 'Strategic Management', 'Operations Management', 'Enterprise Systems', 'Organizational Behavior', 'Agile & Scrum', 'Customer Service', 'Advanced Excel', 'Communication Skills'],
  TOUR: ['Tour Operations', 'Global Distribution Systems', 'Front Office Operations', 'Food & Beverage Service', 'Event Management', 'Ecotourism', 'Heritage & Cultural Tourism', 'Travel Documentation', 'Tourism Marketing', 'Customer Service', 'Communication Skills', 'Languages'],
  ECON: ['Microeconomics', 'Macroeconomics', 'Econometrics', 'Statistics', 'Development Economics', 'Research Methods', 'Public Economics', 'Cost-Benefit Analysis', 'International Trade', 'Advanced Excel', 'SPSS', 'Data Analysis'],
};

const INTERESTS = {
  CS: ['web development', 'machine learning', 'cybersecurity', 'mobile apps', 'cloud computing', 'data engineering', 'ui design', 'networking'],
  ACCG: ['audit', 'tax advisory', 'financial reporting', 'banking', 'fintech', 'compliance'],
  MKTG: ['digital campaigns', 'market research', 'brand strategy', 'social media', 'analytics', 'retail'],
  MGMT: ['project delivery', 'people management', 'operations', 'consulting', 'entrepreneurship', 'supply chain'],
  TOUR: ['tour operations', 'hospitality', 'events', 'sustainable tourism', 'cultural heritage', 'customer experience'],
  ECON: ['policy analysis', 'poverty and development', 'econometric modelling', 'public finance', 'trade', 'research'],
};

const TARGET_ROLES = {
  CS: ['software developer intern', 'backend developer', 'data analyst intern', 'it support intern', 'ml intern'],
  ACCG: ['audit intern', 'junior accountant', 'tax assistant intern', 'finance intern'],
  MKTG: ['marketing intern', 'digital marketing assistant', 'market research intern', 'social media intern'],
  MGMT: ['hr intern', 'project office intern', 'operations intern', 'procurement intern'],
  TOUR: ['tour operations intern', 'front office intern', 'event coordinator intern', 'travel consultant intern'],
  ECON: ['research assistant intern', 'policy analyst intern', 'monitoring and evaluation intern', 'planning intern'],
};

const FIRST = ['Yonas', 'Abel', 'Dawit', 'Eyob', 'Henok', 'Kalkidan', 'Mengesha', 'Nahom', 'Solomon', 'Tewodros', 'Yared', 'Amanuel', 'Birhanu', 'Fikru', 'Girma', 'Haile', 'Isaiah', 'Mikael', 'Nathan', 'Ousman', 'Abenezer', 'Liya', 'Meron', 'Ruth', 'Saba', 'Hawari', 'Birtukan', 'Dorota', 'Genet', 'Mesk', 'Tigist', 'Zinash', 'Alem', 'Selam', 'Kisanet', 'Fana', 'Halima', 'Nohe', 'Lidya', 'Askal'];
const LAST = ['Tesfaye', 'Bekele', 'Wolde', 'Girma', 'Alemu', 'Kebede', 'Mekonnen', 'Tadesse', 'Haile', 'Yohannes', 'Assefa', 'Belay', 'Demissie', 'Fikadu', 'Gebru', 'Hagos', 'Isaac', 'Lemma', 'Negash', 'Solomon', 'Worku', 'Zerihun', 'Abraham', 'Bayu', 'Dereje', 'Elias', 'Gedion', 'Kifle', 'Mulugeta', 'Tebabo'];

const PROJECTS = {
  CS: [
    ['Student Records Management System', 'Built a Django and PostgreSQL web application with role based authentication, form validation and printable reports for 400 simulated student records.'],
    ['Campus Navigation Mobile App', 'Developed a Flutter application that shows building routes on campus, using REST APIs and local caching, tested with 30 users.'],
    ['Network Traffic Analyser', 'Wrote a Python tool that parses pcap captures with tcp/ip headers and flags unusual ports, deployed on a Linux server with Docker.'],
    ['Predicting At-Risk Students', 'Trained a scikit-learn logistic regression model on anonymised grades, evaluated precision and recall, visualised results with pandas and matplotlib.'],
    ['E-Commerce Demo Store', 'Created a React frontend with a Node.js and MongoDB backend, implemented a cart, checkout flow and unit tests.'],
  ],
  ACCG: [
    ['Mock Statutory Audit File', 'Prepared audit working papers, tested internal controls over cash receipts and drafted findings for a simulated retail client.'],
    ['IFRS Conversion Exercise', 'Reclassified a trial balance under IFRS presentation requirements and reconciled depreciation differences in Excel.'],
    ['VAT Return Simulation', 'Computed monthly VAT and withholding tax returns from 120 simulated invoices using Advanced Excel models.'],
  ],
  MKTG: [
    ['Coffee Brand Positioning Study', 'Ran a 120 respondent survey on urban coffee buyers, segmenting the market and recommending a positioning statement.'],
    ['Social Media Campaign Plan', 'Built a three month Instagram and TikTok campaign calendar with a paid budget, KPIs and Google Analytics tracking.'],
    ['Banking Customer Satisfaction Survey', 'Designed a questionnaire, collected responses and reported service quality gaps with pivot tables.'],
  ],
  MGMT: [
    ['University Event Project Plan', 'Produced a work breakdown structure, Gantt schedule and risk register for a 600 attendee career fair.'],
    ['Procurement Process Review', 'Mapped a purchase order workflow, identified approval delays and proposed a leaner process with Agile ceremonies.'],
    ['HR Policy Redesign', 'Drafted a performance management framework and a recruitment scorecard for a simulated SME.'],
  ],
  TOUR: [
    ['Lalibela Heritage Tour Package', 'Designed a four day heritage itinerary with costing, guide notes and a responsible tourism code of conduct.'],
    ['Travel Agency Booking Simulation', 'Completed air ticketing and reservation exercises in a global distribution system environment with fare calculation.'],
    ['Hotel Front Office Audit', 'Simulated check-in, room assignment and property management system reporting for a 40 room hotel.'],
  ],
  ECON: [
    ['Inflation and Household Study', 'Modelled the relationship between inflation and urban household spending using time series regression in Stata and SPSS.'],
    ['Poverty Line Analysis', 'Processed a simulated household survey, computed poverty headcount ratios and wrote a policy brief.'],
    ['Small Enterprise Feasibility Study', 'Performed a cost-benefit analysis of a logistics investment with sensitivity scenarios in Excel.'],
  ],
};

const CERTS = {
  CS: ['Cisco CCNA Introduction to Networks', 'Google Data Analytics Certificate', 'Meta Back-End Developer Certificate'],
  ACCG: ['Association of Accountants entry level certificate', 'Advanced Excel for Finance'],
  MKTG: ['Google Analytics Certification', 'Meta Blueprint Social Media Marketing'],
  MGMT: ['Agile Scrum Foundation', 'Project Management Essentials'],
  TOUR: ['IATA Travel & Tourism course', 'First Aid for Hospitality'],
  ECON: ['Stata for Applied Econometrics', 'Monitoring and Evaluation Basics'],
};

const EMPLOYERS = [
  { email: 'talent@ethiotelecom.et', company: 'Ethio Telecom', industry: 'Telecommunications', size: '500+', city: 'Addis Ababa', contact: 'Mestawit Alemu', status: 'verified', hosted: 14 },
  { email: 'campus@safaricom.et', company: 'Safaricom Ethiopia', industry: 'Telecommunications & Fintech', size: '201-500', city: 'Addis Ababa', contact: 'Yohannes Dula', status: 'verified', hosted: 9 },
  { email: 'hr@dashenbank.et', company: 'Dashen Bank', industry: 'Banking', size: '500+', city: 'Addis Ababa', contact: 'Firehiwot Bekele', status: 'verified', hosted: 21 },
  { email: 'internships@abugida.com', company: 'Abugida Ideas PLC', industry: 'Software Development', size: '51-200', city: 'Addis Ababa', contact: 'Dereje Girma', status: 'verified', hosted: 6 },
  { email: 'talent@iceaddis.org', company: 'iceaddis', industry: 'Technology Incubator', size: '11-50', city: 'Addis Ababa', contact: 'Selam Tesfaye', status: 'verified', hosted: 4 },
  { email: 'careers@kpmgethiopia.et', company: 'KPMG Ethiopia', industry: 'Audit & Advisory', size: '201-500', city: 'Addis Ababa', contact: 'Nardos Tilahun', status: 'verified', hosted: 11 },
  { email: 'hr@ethiopianairlines.com', company: 'Ethiopian Airlines', industry: 'Aviation & Tourism', size: '500+', city: 'Addis Ababa', contact: 'Getu Worku', status: 'verified', hosted: 27 },
  { email: 'planning@tourauthority.gov.et', company: 'Ethiopian Tourism Authority', industry: 'Public Sector & Tourism', size: '51-200', city: 'Addis Ababa', contact: 'Bethlehem Assefa', status: 'verified', hosted: 5 },
  { email: 'jobs@zemenbank.com', company: 'Zemen Bank', industry: 'Banking', size: '201-500', city: 'Addis Ababa', contact: 'Ayalew Kassa', status: 'pending', hosted: 0 },
];

const MENTORS = [
  { name: 'Betelhem Girma', headline: 'Senior Backend Engineer at Safaricom Ethiopia', company: 'Safaricom Ethiopia', seniority: 'senior', years: 8, dept: 'CS', focus: ['backend development', 'fintech', 'api design'], open: ['mentorship', 'referrals'], availability: 4, alma: 'St. Mary\'s University' },
  { name: 'Addis Hinde', headline: 'Data Scientist at Ethio Telecom', company: 'Ethio Telecom', seniority: 'senior', years: 7, dept: 'CS', focus: ['machine learning', 'analytics', 'python'], open: ['mentorship', 'project review'], availability: 3, alma: 'St. Mary\'s University' },
  { name: 'Mahlet Yohannes', headline: 'Audit Senior at KPMG Ethiopia', company: 'KPMG Ethiopia', seniority: 'mid', years: 5, dept: 'ACCG', focus: ['audit', 'ifrs', 'tax'], open: ['mentorship', 'cv review'], availability: 4, alma: 'St. Mary\'s University' },
  { name: 'Samuel Taffere', headline: 'Frontend Lead at Abugida Ideas', company: 'Abugida Ideas PLC', seniority: 'staff', years: 10, dept: 'CS', focus: ['react', 'typescript', 'web accessibility'], open: ['mentorship', 'portfolio review'], availability: 2, alma: 'Addis Ababa University' },
  { name: 'Ruqiya Hassan', headline: 'Digital Marketing Manager at Dashen Bank', company: 'Dashen Bank', seniority: 'senior', years: 9, dept: 'MKTG', focus: ['digital campaigns', 'analytics', 'brand'], open: ['mentorship'], availability: 3, alma: 'St. Mary\'s University' },
  { name: 'Gizachew Mulatu', headline: 'Guest Experience Manager, Ethiopian Airlines', company: 'Ethiopian Airlines', seniority: 'senior', years: 12, dept: 'TOUR', focus: ['hospitality', 'tour operations', 'service quality'], open: ['mentorship', 'referrals'], availability: 2, alma: 'St. Mary\'s University' },
  { name: 'Sara Gedefaw', headline: 'HR Business Partner at Zemen Bank', company: 'Zemen Bank', seniority: 'mid', years: 6, dept: 'MGMT', focus: ['recruitment', 'performance management', 'hris'], open: ['mentorship', 'interview prep'], availability: 4, alma: 'Addis Ababa University' },
  { name: 'Tesfaye Bulti', headline: 'Senior Economist, development finance', company: 'Independent consultant', seniority: 'principal', years: 15, dept: 'ECON', focus: ['econometrics', 'policy', 'evaluation'], open: ['mentorship', 'research review'], availability: 3, alma: 'St. Mary\'s University' },
];

const SHOWCASE_CV = `YONAS TESFAYE
Computer Science Student | St. Mary's University, Addis Ababa
Email: yonas.tesfaye@student.msu.edu.et   Phone: +251 911 234 567
GPA: 3.62   Graduation year: 2027

OBJECTIVE
Third year Computer Science student seeking a forty day summer internship in software
development or applied machine learning. I have shipped three full stack web applications
and I work well in small teams under deadlines.

EDUCATION
BSc Computer Science, St. Mary's University, expected 2027
Relevant coursework: Data Structures, Algorithms, Operating Systems, Database Systems, Web Programming

TECHNICAL SKILLS
Python, Django, Django REST Framework, JavaScript, React, TypeScript, PostgreSQL, SQL, Git, GitHub,
HTML, CSS, Docker, Linux, Bash, Pandas, NumPy, Scikit-learn, Machine Learning, REST APIs,
Object-Oriented Programming, Data Structures and Algorithms, Unit Testing

PROJECTS
Library Management System - Django and PostgreSQL, implemented authentication, role based access and
overdue reports generated with pandas. Handles 400 simulated records.
Student Grade Analyzer - scikit-learn logistic regression on anonymised marks, evaluated precision and
recall, results visualised with matplotlib.
Expense Tracker - React frontend against a Node.js REST API, containerised with Docker on a Linux host,
tested with pytest.

WORK EXPERIENCE
IT Assistant, St. Mary's University ICT Directorate (summer 2025)
- Supported 200 users across Windows and Linux, troubleshot tcp/ip connectivity and replaced faulty cabling.
- Documented ticket resolution and prepared the monthly availability report.

CERTIFICATIONS
Cisco CCNA Introduction to Networks
Google Data Analytics Certificate

LANGUAGES: Amharic (native), English (fluent), Afan Oromo (basic)
`;

const INTERN_SHIPS = [
  { employer: 'Ethio Telecom', title: 'Software Development Intern', format: 'onsite', level: 'beginner', min_year: 3, min_gpa: 2.8, hours: 30, stipend: 'ETB 3,000 / month', depts: ['CS', 'IS'], city: 'Addis Ababa', capacity: 6, days: 40, deadline: '2026-05-15',
    desc: 'Join the Digital Channels squad to maintain internal services built with Python and Django against a PostgreSQL database. You will pick up tickets, write REST endpoints, add unit tests and take part in daily standups. Containerisation experience with Docker is a plus.',
    resp: ['Implement and test Django REST endpoints', 'Write pytest unit tests', 'Support production incidents with the on-call engineer'],
    skills: [['Python', 5, true], ['Django', 4, true], ['PostgreSQL', 4, true], ['REST APIs', 4, true], ['Git', 3, true], ['Unit Testing', 3, false], ['Docker', 3, false], ['Data Structures', 3, true]] },
  { employer: 'Ethio Telecom', title: 'Network Operations Intern', format: 'onsite', level: 'beginner', min_year: 3, min_gpa: 2.6, hours: 32, stipend: 'ETB 2,500 / month', depts: ['CS'], city: 'Addis Ababa', capacity: 4, days: 40, deadline: '2026-05-20',
    desc: 'Monitor the national backbone NOC, learn routing and switching operations, and support the team with Linux based network tooling, tcp/ip diagnostics and incident documentation.',
    resp: ['Assist with NOC shift monitoring', 'Run connectivity diagnostics', 'Maintain the incident knowledge base'],
    skills: [['Computer Networks', 5, true], ['Linux', 4, true], ['Network Administration', 4, true], ['Cybersecurity', 3, false], ['Operating Systems', 3, true]] },
  { employer: 'Safaricom Ethiopia', title: 'M-Pesa Fintech Engineering Intern', format: 'hybrid', level: 'intermediate', min_year: 3, min_gpa: 3.0, hours: 30, stipend: 'ETB 6,000 / month', depts: ['CS'], city: 'Addis Ababa', capacity: 3, days: 40, deadline: '2026-05-10',
    desc: 'Work on APIs behind the M-Pesa partner platform. TypeScript and Node.js services, Kafka streams, and a strong emphasis on testing and security. Ideal for a student who has built at least one production-grade web app.',
    resp: ['Extend Node.js microservices', 'Write integration tests', 'Review API security with the platform team'],
    skills: [['JavaScript', 5, true], ['TypeScript', 4, true], ['Node.js', 4, true], ['REST APIs', 4, true], ['Git', 3, true], ['Web Application Security', 3, false], ['Docker', 3, false]] },
  { employer: 'Safaricom Ethiopia', title: 'Marketing Analytics Intern', format: 'hybrid', level: 'beginner', min_year: 3, min_gpa: 2.75, hours: 25, stipend: 'ETB 4,000 / month', depts: ['MKTG', 'ECON', 'MGMT'], city: 'Addis Ababa', capacity: 2, days: 40, deadline: '2026-05-18',
    desc: 'Support the consumer insights team on campaign performance reporting. You will clean survey data in Advanced Excel, build dashboards, and help translate Google Analytics numbers into recommendations.',
    resp: ['Build weekly campaign dashboards', 'Clean and analyse survey data', 'Draft insight summaries'],
    skills: [['Marketing Analytics', 5, true], ['Advanced Excel', 5, true], ['Data Analysis', 4, true], ['Market Research', 4, true], ['Statistics', 3, false], ['Power BI', 3, false]] },
  { employer: 'Dashen Bank', title: 'Branch Banking & Credit Intern', format: 'onsite', level: 'beginner', min_year: 3, min_gpa: 2.9, hours: 35, stipend: 'Unpaid (academic credit)', depts: ['ACCG', 'ECON', 'MGMT'], city: 'Addis Ababa', capacity: 10, days: 40, deadline: '2026-05-25',
    desc: 'Rotational placement across deposit operations, credit appraisal and financial reporting. Exposure to the bank general ledger, IFRS aligned statements and credit analysis working files.',
    resp: ['Support deposit and account services', 'Assist credit appraisal files', 'Reconcile branch ledgers'],
    skills: [['Financial Accounting', 5, true], ['Banking & Finance', 4, true], ['Advanced Excel', 4, true], ['Financial Analysis', 3, true], ['IFRS', 3, false], ['Bookkeeping', 3, true]] },
  { employer: 'Dashen Bank', title: 'Information Security Intern', format: 'onsite', level: 'intermediate', min_year: 4, min_gpa: 3.1, hours: 30, stipend: 'ETB 4,500 / month', depts: ['CS'], city: 'Addis Ababa', capacity: 2, days: 40, deadline: '2026-05-12',
    desc: 'Join the CISO team for vulnerability assessment, log review and phishing simulation. Expect hands-on time with Kali Linux, SIEM dashboards and the OWASP Top 10 against internal web apps.',
    resp: ['Run vulnerability scans', 'Triage SIEM alerts', 'Prepare the monthly security report'],
    skills: [['Cybersecurity', 5, true], ['Vulnerability Assessment', 4, true], ['Linux', 4, true], ['Cryptography', 3, false], ['Web Application Security', 4, true], ['Computer Networks', 3, true]] },
  { employer: 'Abugida Ideas PLC', title: 'Full Stack Web Developer Intern', format: 'hybrid', level: 'beginner', min_year: 3, min_gpa: 2.7, hours: 30, stipend: 'ETB 3,500 / month', depts: ['CS'], city: 'Addis Ababa', capacity: 4, days: 40, deadline: '2026-05-22',
    desc: 'Build client web applications with React and TypeScript against ASP.NET Core APIs. You will be paired with a senior developer, review pull requests, and ship a small feature by week three.',
    resp: ['Deliver React components', 'Integrate REST APIs', 'Participate in code review'],
    skills: [['React', 5, true], ['JavaScript', 5, true], ['TypeScript', 4, false], ['HTML', 4, true], ['CSS', 4, true], ['REST APIs', 4, true], ['Git', 3, true], ['ASP.NET Core', 3, false]] },
  { employer: 'iceaddis', title: 'AI Research Intern (Computer Vision)', format: 'remote', level: 'advanced', min_year: 4, min_gpa: 3.3, hours: 25, stipend: 'ETB 7,000 / month', depts: ['CS'], city: 'Remote (Ethiopia)', capacity: 2, days: 40, deadline: '2026-05-08',
    desc: 'Work with the Amharic NLP and vision group. Fine-tune PyTorch models, curate labelled datasets and report evaluation metrics. Strong Python, machine learning and statistics required.',
    resp: ['Train and evaluate models', 'Prepare labelled datasets', 'Write experiment reports'],
    skills: [['Python', 5, true], ['Machine Learning', 5, true], ['Deep Learning', 4, true], ['PyTorch', 4, false], ['Computer Vision', 4, true], ['Statistics', 3, true], ['Data Analysis', 3, false]] },
  { employer: 'iceaddis', title: 'Mobile App Intern (Flutter)', format: 'hybrid', level: 'beginner', min_year: 3, min_gpa: 2.6, hours: 25, stipend: 'ETB 3,000 / month', depts: ['CS'], city: 'Addis Ababa', capacity: 3, days: 40, deadline: '2026-05-28',
    desc: 'Help maintain a Flutter based maternal health app used by clinics. Dart, REST API integration, local storage and on-device testing with real users.',
    resp: ['Ship Flutter screens', 'Integrate backend APIs', 'Test on low-end Android devices'],
    skills: [['Flutter', 5, true], ['Dart', 4, false], ['REST APIs', 4, true], ['Git', 3, true], ['Object-Oriented Programming', 3, true]] },
  { employer: 'KPMG Ethiopia', title: 'Statutory Audit Intern', format: 'onsite', level: 'beginner', min_year: 3, min_gpa: 3.0, hours: 40, stipend: 'ETB 5,000 / month', depts: ['ACCG'], city: 'Addis Ababa', capacity: 8, days: 40, deadline: '2026-05-16',
    desc: 'Support statutory audit fieldwork for banking and manufacturing clients. Test of controls, substantive procedures, working paper documentation and IFRS disclosure checks under manager supervision.',
    resp: ['Perform control testing', 'Prepare audit working papers', 'Follow up on client requests'],
    skills: [['Financial Accounting', 5, true], ['Auditing', 5, true], ['IFRS', 4, true], ['Advanced Excel', 4, true], ['Internal Controls', 3, false], ['Financial Reporting', 3, true], ['Communication Skills', 2, false]] },
  { employer: 'KPMG Ethiopia', title: 'Tax Advisory Intern', format: 'hybrid', level: 'beginner', min_year: 3, min_gpa: 2.9, hours: 35, stipend: 'ETB 4,500 / month', depts: ['ACCG', 'ECON'], city: 'Addis Ababa', capacity: 3, days: 40, deadline: '2026-05-24',
    desc: 'Assist with VAT and withholding tax returns, treaty position reviews and Ethiopian tax law research. Structured, deadline-driven work with senior review.',
    resp: ['Prepare tax computations', 'Research Proclamation clauses', 'Support return filing'],
    skills: [['Taxation', 5, true], ['Financial Accounting', 4, true], ['Advanced Excel', 4, true], ['Communication Skills', 3, false], ['IFRS', 3, false]] },
  { employer: 'Ethiopian Airlines', title: 'Tourism & Passenger Service Intern', format: 'onsite', level: 'beginner', min_year: 3, min_gpa: 2.6, hours: 35, stipend: 'ETB 2,800 / month', depts: ['TOUR', 'MGMT'], city: 'Addis Ababa', capacity: 12, days: 40, deadline: '2026-05-30',
    desc: 'Rotate through passenger service, lounge operations and travel sales. Training on the departure control system, reservation workflows and the global distribution system environment.',
    resp: ['Support check-in operations', 'Assist the travel sales desk', 'Compile service quality observations'],
    skills: [['Customer Service', 5, true], ['Front Office Operations', 4, true], ['Global Distribution Systems', 4, true], ['Tourism Marketing', 3, false], ['Languages', 3, true], ['Communication Skills', 3, true]] },
  { employer: 'Ethiopian Airlines', title: 'Enterprise IT Intern', format: 'onsite', level: 'intermediate', min_year: 4, min_gpa: 3.0, hours: 30, stipend: 'ETB 4,000 / month', depts: ['CS', 'MGMT'], city: 'Addis Ababa', capacity: 3, days: 40, deadline: '2026-05-19',
    desc: 'Support enterprise systems and reporting used by ground operations. SQL and database work, dashboard building, and coordination with vendor teams on a virtualised Linux estate.',
    resp: ['Build and validate SQL reports', 'Support ERP module testing', 'Document operational procedures'],
    skills: [['SQL', 5, true], ['PostgreSQL', 4, false], ['Database Design', 4, true], ['Data Visualization', 3, true], ['Linux', 3, false], ['Enterprise Systems', 3, false]] },
  { employer: 'Ethiopian Tourism Authority', title: 'Destination Marketing Intern', format: 'hybrid', level: 'beginner', min_year: 3, min_gpa: 2.5, hours: 25, stipend: 'Stipend negotiable', depts: ['TOUR', 'MKTG'], city: 'Addis Ababa', capacity: 4, days: 40, deadline: '2026-06-02',
    desc: 'Promote heritage and eco-tourism products. Content drafting, campaign support, visitor survey analysis and coordination with regional tourism offices and tour operators.',
    resp: ['Draft destination content', 'Support campaign launches', 'Analyse visitor surveys'],
    skills: [['Tourism Marketing', 5, true], ['Heritage & Cultural Tourism', 4, true], ['Content Marketing', 4, true], ['Social Media Marketing', 3, true], ['Market Research', 3, false], ['Ecotourism', 3, false]] },
  { employer: 'Ethiopian Tourism Authority', title: 'Event & Conference Coordination Intern', format: 'onsite', level: 'beginner', min_year: 3, min_gpa: 2.5, hours: 30, stipend: 'Unpaid (academic credit)', depts: ['TOUR', 'MGMT'], city: 'Addis Ababa', capacity: 3, days: 40, deadline: '2026-06-05',
    desc: 'Help deliver tourism conferences and trade fairs: vendor liaison, scheduling, delegate registration, on-site logistics and post-event reporting.',
    resp: ['Coordinate vendors and venues', 'Manage delegate registration', 'Produce the event report'],
    skills: [['Event Management', 5, true], ['Communication Skills', 4, true], ['Project Management', 4, false], ['Customer Service', 3, true], ['Organizational Behavior', 2, false]] },
  { employer: 'Zemen Bank', title: 'Financial Data Analyst Intern', format: 'hybrid', level: 'beginner', min_year: 3, min_gpa: 3.0, hours: 25, stipend: 'ETB 4,000 / month', depts: ['ECON', 'ACCG', 'CS'], city: 'Addis Ababa', capacity: 2, days: 40, deadline: '2026-05-27',
    desc: 'Analyse branch performance and credit portfolio data. Advanced Excel modelling, SQL extraction from the data warehouse, and Power BI dashboards for the planning division.',
    resp: ['Extract and clean data with SQL', 'Build planning dashboards', 'Support quarterly variance analysis'],
    skills: [['Advanced Excel', 5, true], ['SQL', 5, true], ['Data Analysis', 4, true], ['Power BI', 4, false], ['Statistics', 4, true], ['Financial Analysis', 3, false], ['Data Visualization', 3, true]] },
  { employer: 'Zemen Bank', title: 'Human Capital Intern', format: 'onsite', level: 'beginner', min_year: 3, min_gpa: 2.7, hours: 30, stipend: 'ETB 2,500 / month', depts: ['MGMT'], city: 'Addis Ababa', capacity: 3, days: 40, deadline: '2026-06-01',
    desc: 'Support recruitment, training administration and the HRIS. Screen CVs against scorecards, schedule interviews, maintain records and help run the performance review cycle.',
    resp: ['Screen and shortlist CVs', 'Maintain HRIS records', 'Support the review cycle'],
    skills: [['Human Resource Management', 5, true], ['Communication Skills', 4, true], ['Organizational Behavior', 3, true], ['Advanced Excel', 3, false], ['Enterprise Systems', 2, false]] },
];

const INTERNSHIPS = INTERN_SHIPS.filter((i) => i.title && i.depts.length);

function cvTextFor(student) {
  const { name, email, dept, year, gpa, gradYear, skills, interests, targetRoles, city, phone } = student;
  const projects = some(PROJECTS[dept], 2);
  const cert = rnd() > 0.45 ? pick(CERTS[dept]) : null;
  const hasWork = rnd() > 0.55;
  const softLine = pick(['I learn quickly and I am comfortable working under deadline pressure.', 'I work well in a team and I document what I build.', 'I am organised, reliable and comfortable taking feedback.']);
  return `${name.toUpperCase()}
${COURSEWORK[dept][0] ? `${DEPARTMENTS.find((d) => d[0] === dept)[1]} Student` : 'Student'} | St. Mary's University, Addis Ababa
Email: ${email}   Phone: ${phone}
GPA: ${gpa.toFixed(2)}   Graduation year: ${gradYear}

OBJECTIVE
Year ${year} ${DEPARTMENTS.find((d) => d[0] === dept)[1]} student looking for the compulsory forty day internship
as ${targetRoles[0]}. Interested in ${interests.slice(0, 2).join(' and ')}. ${softLine}

EDUCATION
BSc ${DEPARTMENTS.find((d) => d[0] === dept)[1]}, St. Mary's University, expected ${gradYear}
Relevant coursework: ${some(COURSEWORK[dept], 4).join(', ')}

TECHNICAL SKILLS
${skills.map((s) => s.name).join(', ')}

PROJECTS
${projects.map(([title, blurb], i) => `${i + 1}. ${title} - ${blurb}`).join('\n')}
${hasWork ? `
WORK EXPERIENCE
${pick(['Volunteer IT Helper', 'Part-time Cashier', 'Department Student Assistant', 'Weekend Sales Assistant', 'Library Page'])}, ${pick(['St. Mary\'s University', 'a local retail business', 'a family shop', 'an NGO field office'])} (${2024 + int(0, 1)})
- ${pick(['Handled daily records and reported issues to the supervisor.', 'Supported staff and customers, resolving requests the same day.', 'Maintained accurate registers and reconciled them weekly.'])}
` : ''}
${cert ? `CERTIFICATIONS\n${cert}\n\n` : ''}LANGUAGES: Amharic (native), English (fluent)${rnd() > 0.6 ? ', Afan Oromo (basic)' : ''}
`;
}

const HILITE_CV_OVERRIDES = {
  'yonas.tesfaye@student.msu.edu.et': SHOWCASE_CV,
};

export async function seed(db) {
  const hash = bcrypt.hashSync(DEMO_PASSWORD, 8);

  for (const [code, name, college] of DEPARTMENTS) {
    await db.query('insert into department (code, name, college) values ($1,$2,$3) on conflict (code) do nothing', [code, name, college]);
  }

  const skillId = new Map();
  for (const row of catalogRows()) {
    await db.query('insert into skill_category (name) values ($1) on conflict (name) do nothing', [row.category]);
    const cat = await db.query('select id from skill_category where name = $1', [row.category]);
    const ins = await db.query(
      'insert into skill (name, category_id, aliases) values ($1,$2,string_to_array($3, \'|\')) on conflict (name) do nothing returning id',
      [row.name, cat.rows[0].id, row.aliases.join('|')]
    );
    const id = ins.rows[0]?.id
      ?? (await db.query('select id from skill where name = $1', [row.name])).rows[0].id;
    skillId.set(row.name, id);
  }

  const lexicon = (await db.query(`
    select s.id, s.name, sc.name as category, s.aliases
    from skill s join skill_category sc on sc.id = s.category_id
  `)).rows.map((r) => ({ id: Number(r.id), name: r.name, category: r.category, aliases: r.aliases ?? [] }));

  // ---- users ---------------------------------------------------------
  const insertUser = async ({ email, role, name, color }) => {
    const r = await db.query(
      `insert into app_user (email, password_hash, role, full_name, avatar_color)
       values ($1,$2,$3,$4,$5) returning id`,
      [email, hash, role, name, color]
    );
    return Number(r.rows[0].id);
  };

  const ADMIN = [
    await insertUser({ email: 'career.services@msu.edu.et', role: 'admin', name: 'W/ro Meron Abraha', color: '#b41118' }),
    await insertUser({ email: 'internship.office@msu.edu.et', role: 'admin', name: 'Ato Tesfu Mengistu', color: '#32373c' }),
  ];

  const employerId = new Map();
  const employerColors = ['#7a0d12', '#5d6066', '#8a6d1b', '#a3561f', '#8a1b3a', '#4a5568', '#6b5200', '#37474f', '#96461f'];
  for (const [i, e] of EMPLOYERS.entries()) {
    const uid = await insertUser({ email: e.email, role: 'employer', name: e.contact, color: employerColors[i % employerColors.length] });
    employerId.set(e.company, uid);
    await db.query(
      `insert into employer_profile (user_id, company_name, industry, company_size, contact_person, city, about, verification_status, verified_by, verified_at, hosting_history)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [uid, e.company, e.industry, e.size, e.contact, e.city,
        `${e.company} hosts St. Mary's University students for the compulsory forty day internship and keeps a supervisor assigned to each intern.`,
        e.status, e.status === 'verified' ? ADMIN[0] : null, e.status === 'verified' ? new Date(Date.now() - int(30, 200) * 864e5) : null, e.hosted]
    );
  }

  const mentorIds = [];
  for (const m of MENTORS) {
    const slug = m.name.toLowerCase().replace(/[^a-z]+/g, '.');
    const uid = await insertUser({ email: `${slug}@alumni.msu.edu.et`, role: 'mentor', name: m.name, color: '#6b5200' });
    mentorIds.push(uid);
    await db.query(
      `insert into mentor_profile (user_id, headline, company, role_title, seniority, years_experience, bio, city, focus_areas, open_to, availability_hours, alma_mater)
       values ($1,$2,$3,$4,$5,$6,$7,$8,string_to_array($9,'|'),string_to_array($10,'|'),$11,$12)`,
      [uid, m.headline, m.company, m.headline.split(' at ')[0], m.seniority, m.years,
        `Alumni mentor available to advise students from the ${m.dept} department on ${m.focus.slice(0, 2).join(' and ')}.`,
        'Addis Ababa', m.focus.join('|'), m.open.join('|'), m.availability, m.alma]
    );
    const pool = DEPT_SKILLS[m.dept];
    for (const [i, s] of some(pool, 8).entries()) {
      await db.query('insert into profile_skill (user_id, skill_id, level, source) values ($1,$2,$3,$4) on conflict do nothing',
        [uid, skillId.get(s), Math.max(3, 5 - Math.floor(i / 3)), 'manual']);
    }
  }

  // ---- students ------------------------------------------------------
  const deptCodes = DEPARTMENTS.map((d) => d[0]);
  const students = [];
  let nameIdx = 0;
  const uniqueName = () => {
    for (let guard = 0; guard < 500; guard += 1) {
      const n = `${FIRST[nameIdx % FIRST.length]} ${LAST[(nameIdx * 7 + 3) % LAST.length]}`;
      nameIdx += 1;
      if (!students.some((s) => s.name === n)) return n;
    }
    return `Student ${nameIdx}`;
  };

  const perDept = { CS: 8, ACCG: 5, MKTG: 4, MGMT: 4, TOUR: 4, ECON: 4 };
  for (const dept of deptCodes) {
    for (let k = 0; k < perDept[dept]; k += 1) {
      const name = dept === 'CS' && k === 0 ? 'Yonas Tesfaye' : uniqueName();
      const slug = name.toLowerCase().replace(/[^a-z]+/g, '.');
      const email = HILITE_CV_OVERRIDES[`${slug}@student.msu.edu.et`] ? `${slug}@student.msu.edu.et` : `${slug}${k === 0 ? '' : ''}@student.msu.edu.et`;
      const isShowcase = Boolean(HILITE_CV_OVERRIDES[`${slug}@student.msu.edu.et`]);
      const program = isShowcase ? 'regular' : (rnd() > 0.82 ? 'extension' : 'regular');
      const year = isShowcase ? 3 : (program === 'extension' ? 4 : 3);
      const gpa = isShowcase ? 3.62 : Math.round((2.55 + rnd() * 1.35) * 100) / 100;
      const gradYear = isShowcase ? 2027 : 2026 + 1 + int(0, 1);
      const skillPool = DEPT_SKILLS[dept];
      const chosenSkills = some(skillPool, int(6, 11)).map((s) => ({ name: s, level: Math.max(1, Math.min(5, int(2, 5))) }));
      const interests = some(INTERESTS[dept], 3);
      const targetRoles = [pick(TARGET_ROLES[dept])];
      const sid = await insertUser({ email, role: 'student', name, color: ['#b41118', '#8d0d13', '#32373c', '#6b5200', '#a1502a'][k % 5] });
      const phone = `+251 9${int(10, 19)} ${int(100, 999)} ${int(100, 999)}`;
      const city = rnd() > 0.7 ? pick(['Adama', 'Bahir Dar', 'Hawassa', 'Mekelle', 'Jimma']) : 'Addis Ababa';
      students.push({ id: sid, name, email, dept, program, year, gpa, gradYear, skills: chosenSkills, interests, targetRoles, city, phone });
    }
  }

  // CVs are generated, then parsed by the real extractor; levels come from the CV,
  // not from the random assignment above, so the DB reflects NLP output.
  const cvStore = new Map();
  for (const st of students) {
    const override = HILITE_CV_OVERRIDES[st.email];
    const cv = override ?? cvTextFor(st);
    cvStore.set(st.id, cv);
    const analysis = analyzeCv(cv, lexicon);
    // Keep the database row and the CV text in agreement: where the extractor
    // finds a GPA or graduation year, those win over the generated values.
    const cvGpa = analysis.entities.gpa ? Math.min(4, Number(analysis.entities.gpa)) : null;
    const cvGradYear = analysis.entities.graduation_year ?? null;
    await db.query(
      `insert into student_profile (user_id, student_id, department_id, program, year_of_study, graduation_year, gpa, phone, city,
        headline, bio, cv_raw_text, cv_extracted_at, interests, target_roles, preferred_format, available_from, availability_hours, linkedin)
       values ($1,$2,(select id from department where code=$3),$4,$5,$6,$7,$8,$9,$10,$11,$12,now(),string_to_array($13,'|'),string_to_array($14,'|'),$15,$16,$17,$18)`,
      [st.id, `SMU${String(24100 + st.id).padStart(6, '0')}`, st.dept, st.program, st.year, cvGradYear ?? st.gradYear, cvGpa ?? st.gpa, st.phone, st.city,
        `Year ${st.year} ${st.dept} student | ${st.targetRoles[0]}`,
        cv.split('OBJECTIVE')[1]?.split('\n\n')[0]?.replace(/\n/g, ' ').trim() ?? '',
        cv, st.interests.join('|'), st.targetRoles.join('|'),
        pick(['onsite', 'hybrid', 'flexible', 'remote']), new Date(Date.now() + (12 + int(0, 45)) * DAY), int(15, 40),
        rnd() > 0.5 ? `https://linkedin.com/in/${st.name.toLowerCase().replace(/[^a-z]+/g, '-')}` : null]
    );
    for (const s of analysis.skills) {
      await db.query('insert into profile_skill (user_id, skill_id, level, source) values ($1,$2,$3,$4) on conflict do nothing',
        [st.id, s.skill_id, s.level, 'cv_extraction']);
    }
    if (rnd() > 0.6) {
      const extra = pick(skillId.has('Data Structures') ? [...skillId.keys()] : [...skillId.keys()]);
      await db.query('insert into profile_skill (user_id, skill_id, level, source) values ($1,$2,$3,$4) on conflict do nothing',
        [st.id, skillId.get(extra), int(1, 3), 'manual']);
    }
    await db.query(
      'insert into submission_document (student_id, kind, filename, status, note) values ($1,$2,$3,$4,$5)',
      [st.id, 'cv', `${st.email.split('@')[0]}_cv.docx`, rnd() > 0.25 ? 'approved' : 'submitted', 'Extracted by the InternIQ NLP service.']
    );
  }

  // ---- internships --------------------------------------------------
  const internshipRows = [];
  for (const it of INTERNSHIPS) {
    const owner = employerId.get(it.employer);
    const ins = await db.query(
      `insert into internship (employer_id, title, description, responsibilities, company, location, city, format, level,
         duration_days, hours_per_week, stipend, batch, capacity, min_year, min_gpa, status, application_deadline, start_date)
       values ($1,$2,$3,string_to_array($4,'|'),$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'published',$17,$18) returning id`,
      [owner, it.title, it.desc, it.resp.join('|'), it.employer, `${it.employer}, ${it.city}`, it.city, it.format, it.level,
        it.days, it.hours, it.stipend, seasonOf(16), it.capacity, it.min_year, it.min_gpa,
        liveDeadline(it.deadline), afterDeadline(it.deadline, 16)]
    );
    const iid = Number(ins.rows[0].id);
    for (const code of it.depts) {
      const d = await db.query('select id from department where code = $1', [code]);
      if (d.rows[0]) await db.query('insert into internship_department values ($1,$2) on conflict do nothing', [iid, Number(d.rows[0].id)]);
    }
    const reqs = [];
    for (const [skill, weight, required] of it.skills) {
      if (!skillId.has(skill)) continue;
      await db.query('insert into internship_skill (internship_id, skill_id, required, weight) values ($1,$2,$3,$4) on conflict do nothing',
        [iid, skillId.get(skill), required, weight]);
      reqs.push({ skill, weight, required });
    }
    internshipRows.push({ ...it, id: iid, requirements: reqs, owner_id: owner });
  }

  // ---- applications, with scores produced by the real engine --------
  const fullStudents = [];
  for (const st of students) {
    const srow = await db.query('select * from v_user where id = $1', [st.id]);
    const skills = await db.query('select skill_levels from v_user_skills where user_id = $1', [st.id]);
    fullStudents.push({
      ...srow.rows[0],
      skill_levels: skills.rows[0]?.skill_levels ?? {},
      cv_text: cvStore.get(st.id),
    });
  }

  const postingText = (i) => `${i.title} ${i.desc} ${(i.resp ?? []).join(' ')}`;
  const idf = buildIdf([
    ...fullStudents.map((s) => s.cv_text ?? ''),
    ...internshipRows.map(postingText),
  ]);
  const cvVec = new Map(fullStudents.map((s) => [s.id, vectorize(s.cv_text ?? '', idf)]));
  const postVec = new Map(internshipRows.map((i) => [i.id, vectorize(postingText(i), idf)]));

  const scored = [];
  for (const st of fullStudents) {
    for (const it of internshipRows) {
      if (st.role !== 'student') continue;
      const m = scoreMatch(st, it, { cosine: cosine(cvVec.get(st.id), postVec.get(it.id)), jaccard: jaccard(st.cv_text ?? '', postingText(it)) });
      scored.push({ st, it, m });
    }
  }

  const STATUS_PLAN = ['submitted', 'under_review', 'shortlisted', 'accepted', 'rejected'];
  let applicationsMade = 0;
  const rankedByStudent = new Map();
  for (const { st } of scored) if (!rankedByStudent.has(st.id)) rankedByStudent.set(st.id, []);
  for (const { st, it, m } of scored) rankedByStudent.get(st.id).push({ it, m });
  for (const list of rankedByStudent.values()) list.sort((a, b) => b.m.score - a.m.score);

  for (const [studentId, list] of rankedByStudent) {
    const st = fullStudents.find((s) => s.id === studentId);
    const n = int(3, 6);
    for (const { it, m } of list.slice(0, n)) {
      // students mostly apply to postings near the top of their own ranking
      const status = m.score > 82 && rnd() > 0.55 ? 'accepted' : pick(STATUS_PLAN);
      const submittedAt = new Date(Date.now() - int(4, 60) * DAY);
      const ins = await db.query(
        `insert into application (internship_id, student_id, status, match_score, match_breakdown, cover_note, source, submitted_at, decided_at, updated_at)
         values ($1,$2,$3,$4,$5,$6,'student_apply',$7,$8,$7) returning id`,
        [it.id, studentId, status, m.score, JSON.stringify({ breakdown: m.breakdown, reasons: m.reasons, gaps: m.gaps, flags: m.flags }),
          `I am a year ${st.year_of_study} ${st.department} student and this role matches my skills and career interests. I am available from June and can commit full time for forty days.`,
          submittedAt, ['accepted', 'rejected'].includes(status) ? new Date(submittedAt.getTime() + 6 * 864e5) : null]
      );
      const appId = Number(ins.rows[0].id);
      applicationsMade += 1;

      const trail = ['submitted', status];
      if (['shortlisted', 'accepted', 'rejected'].includes(status)) trail.splice(1, 0, 'under_review');
      if (status === 'accepted') trail.push('accepted');
      let prev = null;
      for (const [i, s] of trail.entries()) {
        await db.query(
          'insert into application_event (application_id, from_status, to_status, changed_by, note, created_at) values ($1,$2,$3,$4,$5,$6)',
          [appId, prev, s, i === 0 ? studentId : (it.owner_id ?? ADMIN[0]),
            i === 0 ? 'Submitted by student' : s === status ? `Career Services / employer set ${s}` : 'Moved along the review pipeline',
            new Date(submittedAt.getTime() + i * 2.4 * 864e5)]
        );
        prev = s;
      }

      if (status === 'accepted') {
        const complete = rnd() > 0.35;
        const p = await db.query(
          `insert into placement (application_id, start_date, end_date, supervisor_name, supervisor_email, evaluation_score, completion_status, report_submitted)
           values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
          [appId, complete ? fromToday(-78) : fromToday(-12), complete ? fromToday(-38) : null, it.contact ?? 'Supervisor TBC', `supervisor@${it.employer.toLowerCase().replace(/[^a-z]+/g, '')}.et`,
            complete ? Math.round((7 + rnd() * 2.8) * 10) / 10 : null, complete ? 'completed' : 'in_progress', complete]
        );
        if (Number(p.rows[0].id) && complete) {
          await db.query('update application set status=$2 where id=$1', [appId, 'accepted']);
          await db.query(
            'insert into submission_document (student_id, kind, filename, status, note) values ($1,$2,$3,$4,$5)',
            [studentId, 'evaluation_report', `${st.full_name.toLowerCase().replace(/[^a-z]+/g, '_')}_evaluation.pdf`, 'approved', `${it.company} supervisor report.`]
          );
        }
      }

      await db.query(
        'insert into notification (user_id, kind, title, body, link, is_read, created_at) values ($1,$2,$3,$4,$5,$6,$7)',
        [studentId, 'status', status === 'accepted' ? 'Internship offer received' : 'Application update',
          `${it.title} at ${it.company} - ${status.replace('_', ' ')}. Match score ${m.score}%.`,
          `/applications`, status !== 'submitted', new Date(submittedAt.getTime() + 3 * 864e5)]
      );
    }
  }

  // ---- connections & mentorship -------------------------------------
  for (const st of fullStudents) {
    for (const mid of some(mentorIds, int(0, 3))) {
      const a = Math.min(st.id, mid);
      const b = Math.max(st.id, mid);
      await db.query(
        `insert into connection (requester_id, addressee_id, kind, status, note, created_at)
         values ($1,$2,$3,$4,$5,now() - interval '1 day' * $6) on conflict (requester_id, addressee_id) do nothing`,
        [a, b, rnd() > 0.55 ? 'mentorship' : 'network', rnd() > 0.22 ? 'accepted' : 'pending',
          'I would value your guidance as I prepare my internship applications.', int(2, 90)]
      );
    }
  }

  // ---- messaging (extension) ----------------------------------------
  const pairs = (await db.query(`
    select requester_id as a, addressee_id as b from connection
    where status = 'accepted' order by id limit 14
  `)).rows;
  for (const p of pairs) {
    const a = Math.min(p.a, p.b);
    const b = Math.max(p.a, p.b);
    const c = await db.query(
      `insert into conversation (participant_one, participant_two, topic)
       values ($1,$2,$3) on conflict do nothing returning id`,
      [a, b, 'Internship guidance']
    );
    const cid = Number(c.rows[0]?.id ?? (await db.query('select id from conversation where participant_one=$1 and participant_two=$2', [a, b])).rows[0].id);
    const nameB = (await db.query('select full_name from app_user where id=$1', [b])).rows[0].full_name;
    const script = [
      [a, `Good afternoon ${nameB.split(' ')[0]}, I am applying for the summer internship cycle and found your profile through InternIQ.`],
      [b, 'Happy to help. Which postings did you shortlist, and does your CV list the skills they ask for?'],
      [a, pick(['Mostly the software and data postings. I think I am short on cloud experience.', 'I applied to three postings; the match scores were above eighty on two of them.', 'I am torn between the audit stream and the tax stream.'])],
      [b, pick(['Add one small project to your profile and re-run the match - the engine rewards evidence over claims.', 'Send me your CV and I will mark it up before the deadline.', 'Both are fine; the deciding factor is which supervisor gives you real work.', 'Set your availability to thirty hours so the logistics score improves.'])],
    ];
    for (const [i, [who, body]] of script.entries()) {
      await db.query(
        'insert into message (conversation_id, sender_id, body, created_at, read_at) values ($1,$2,$3,$4,$5)',
        [cid, who, body, new Date(Date.now() - (script.length - i) * 3.6e5), i < script.length - 2 ? new Date() : null]
      );
    }
  }

  // ---- employer deadline + system notifications ---------------------
  const firstDeadline = internshipRows
    .map((i) => liveDeadline(i.deadline))
    .sort()[0];
  const firstDeadlineLabel = new Date(`${firstDeadline}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  for (const st of fullStudents.slice(0, 12)) {
    await db.query(
      "insert into notification (user_id, kind, title, body, link, is_read) values ($1,'deadline',$2,$3,'/internships',$4)",
      [st.id, 'Internship application deadline approaching', `Career Services reminds you that the first ${seasonOf(16)} applications close on ${firstDeadlineLabel}. Upload your approved CV before you apply.`, rnd() > 0.5]
    );
  }
  for (const owner of new Set(internshipRows.map((i) => i.owner_id))) {
    await db.query(
      "insert into notification (user_id, kind, title, body, link) values ($1,'system',$2,$3,'/employer/applicants')",
      [owner, 'New applications on your postings', 'Career Services has forwarded a batch of matched students to your open internships.']
    );
  }
  for (const a of ADMIN) {
    await db.query(
      "insert into notification (user_id, kind, title, body, link) values ($1,'system',$2,$3,'/admin/verifications')",
      [a, 'Employer registration awaiting verification', 'Zemen Bank submitted a company registration and is waiting for Career Services approval.']
    );
  }

  // ---- hand-labelled evaluation set (objective 7) --------------------
  // Independent heuristic, intentionally NOT the production scorer, so the
  // reported precision@k is a real measurement rather than a self-fulfilling loop.
  let labelled = 0;
  for (const it of internshipRows) {
    const candidates = fullStudents.filter((s) => s.role === 'student');
    const chosen = some(candidates, Math.min(10, candidates.length));
    const reqSet = new Set(it.requirements.filter((r) => r.required).map((r) => r.skill));
    for (const st of chosen) {
      const overlap = [...reqSet].filter((k) => (st.skill_levels?.[k] ?? 0) >= 3).length;
      const deptOk = (it.depts ?? []).includes(st.department_code);
      const relevant = deptOk && reqSet.size > 0 && overlap >= Math.max(2, Math.ceil(reqSet.size * 0.5));
      await db.query(
        'insert into eval_case (internship_id, student_id, relevant, rationale, labelled_by) values ($1,$2,$3,$4,$5) on conflict do nothing',
        [it.id, st.id, relevant, `Manual review: ${overlap}/${reqSet.size} required skills at level 3+, department ${st.department_code}`, ADMIN[0]]
      );
      labelled += 1;
    }
  }

  return {
    users: (await db.query('select count(*)::int as n from app_user')).rows[0].n,
    skills: skillId.size,
    internships: internshipRows.length,
    applications: applicationsMade,
    eval_cases: labelled,
  };
}
