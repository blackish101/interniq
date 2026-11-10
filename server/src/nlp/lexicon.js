/**
 * InternIQ skill lexicon.
 *
 * Drives two things: (1) the rows inserted into skill/skill_category, and
 * (2) the NLP extractor, which looks for each skill's canonical name plus its
 * surface forms (aliases) inside a CV. Aliases are why "psql", "RDBMS" or
 * "ML" still resolve to a real catalog skill instead of being missed.
 *
 * Coverage follows the departments named in the project document: Computer
 * Science, Accounting, Marketing Management, Management, Tourism and Economics.
 */

export const CATALOG = {
  'Programming': [
    ['Python', ['python3', 'python programming']],
    ['Java', ['java8', 'java se', 'j2ee']],
    ['C++', ['cpp', 'c plus plus']],
    ['C#', ['csharp', 'c sharp', '.net', 'dotnet']],
    ['JavaScript', ['js', 'es6', 'ecmascript', 'vanilla js']],
    ['TypeScript', ['ts']],
    ['PHP', ['php8', 'laravel php']],
    ['Go', ['golang']],
    ['Rust', ['rustlang']],
    ['Kotlin', ['kotlin android']],
    ['R', ['r language', 'rstudio']],
    ['MATLAB', ['simulink']],
    ['Shell Scripting', ['bash', 'zsh', 'bash scripting']],
  ],

  'Web & Software Engineering': [
    ['HTML', ['html5', 'semantic html']],
    ['CSS', ['css3', 'styling']],
    ['React', ['reactjs', 'react.js', 'react hooks']],
    ['Angular', ['angularjs', 'angular 2+']],
    ['Vue', ['vuejs', 'vue.js']],
    ['Node.js', ['nodejs', 'express', 'express.js']],
    ['Next.js', ['nextjs']],
    ['Django', ['flask', 'fastapi']],
    ['Spring Boot', ['spring framework', 'spring mvc']],
    ['Laravel', ['eloquent']],
    ['ASP.NET Core', ['asp.net', 'mvc']],
    ['REST APIs', ['restful', 'rest api', 'api development', 'web api']],
    ['GraphQL', ['apollo']],
    ['Tailwind CSS', ['bootstrap', 'material ui', 'mui']],
    ['Software Architecture', ['design patterns', 'solid principles', 'clean architecture']],
    ['Microservices', ['service oriented architecture', 'soa']],
  ],

  'Data, AI & Analytics': [
    ['Machine Learning', ['ml', 'supervised learning', 'unsupervised learning']],
    ['Deep Learning', ['neural networks', 'cnn', 'rnn', 'transformers']],
    ['Natural Language Processing', ['nlp', 'text mining', 'spaCy', 'sentence transformers']],
    ['Computer Vision', ['opencv', 'image processing']],
    ['Data Analysis', ['data analytics', 'exploratory data analysis', 'eda']],
    ['Data Visualization', ['dataviz', 'charts', 'dashboards']],
    ['Statistics', ['statistical analysis', 'hypothesis testing', 'regression analysis']],
    ['Pandas', ['numpy', 'scipy']],
    ['Scikit-learn', ['sklearn']],
    ['TensorFlow', ['keras']],
    ['PyTorch', ['torch']],
    ['Power BI', ['powerbi', 'dax']],
    ['Tableau', ['qlik']],
    ['Advanced Excel', ['ms excel', 'excel', 'pivot tables', 'vlookup', 'excel macros', 'spreadsheet']],
    ['SPSS', ['amos']],
    ['Big Data', ['hadoop', 'spark', 'pyspark', 'hive', 'data warehouse']],
    ['ETL', ['data pipeline', 'airflow', 'data integration']],
    ['Recommendation Systems', ['recommender systems', 'collaborative filtering']],
  ],

  'Databases': [
    ['SQL', ['structured query language', 'queries', 't-sql', 'pl/sql', 'plsql']],
    ['PostgreSQL', ['postgres', 'psql', 'pgsql', 'rdbms', 'relational database']],
    ['MySQL', ['mariadb']],
    ['SQL Server', ['ms sql', 'microsoft sql server', 'ssms']],
    ['Oracle Database', ['oracle db', 'oracle 11g', 'oracle 12c']],
    ['MongoDB', ['nosql', 'document database']],
    ['Redis', ['caching', 'in-memory store']],
    ['Firebase', ['firestore', 'supabase']],
    ['Database Design', ['erd', 'entity relationship diagram', 'normalization', 'data modeling', 'schema design']],
    ['Elasticsearch', ['solr', 'full text search']],
  ],

  'Systems & Networks': [
    ['Operating Systems', ['os concepts', 'linux administration', 'unix', 'windows server', 'operating system']],
    ['Linux', ['ubuntu', 'debian', 'fedora', 'centos', 'shell linux', 'linux command line']],
    ['Computer Networks', ['networking', 'tcp/ip', 'osi model', 'dns', 'dhcp']],
    ['Network Administration', ['cisco', 'ccna', 'routing and switching', 'vlan', 'switch configuration', 'router configuration']],
    ['Distributed Systems', ['consensus', 'load balancing', 'scalability']],
    ['System Design', ['high level design', 'low level design']],
    ['Embedded Systems', ['microcontroller', 'microcontrollers', 'arduino', 'raspberry pi', 'stm32', 'fpga', 'real time systems']],
    ['Internet of Things', ['iot', 'sensor networks', 'mqtt']],
    ['Virtualization', ['vmware', 'virtualbox', 'hypervisor', 'containers']],
  ],

  'Cybersecurity': [
    ['Cybersecurity', ['information security', 'infosec', 'network security', 'data security']],
    ['Penetration Testing', ['ethical hacking', 'pentesting', 'red team', 'offensive security']],
    ['Cryptography', ['encryption', 'hashing', 'public key infrastructure', 'pki']],
    ['Web Application Security', ['owasp', 'owasp top 10', 'sql injection', 'xss']],
    ['Security Monitoring', ['siem', 'ids', 'ips', 'splunk', 'incident response']],
    ['Vulnerability Assessment', ['vulnerability scanning', 'nessus', 'nmap', 'burp suite', 'kali linux']],
    ['Identity and Access Management', ['iam', 'oauth', 'jwt', 'single sign on', 'active directory']],
  ],

  'Cloud & DevOps': [
    ['Amazon Web Services', ['aws', 'ec2', 's3', 'lambda', 'cloudformation']],
    ['Microsoft Azure', ['azure']],
    ['Google Cloud Platform', ['gcp', 'bigquery']],
    ['Docker', ['containerization', 'docker-compose', 'podman']],
    ['Kubernetes', ['k8s', 'helm', 'container orchestration']],
    ['CI/CD', ['continuous integration', 'continuous deployment', 'jenkins', 'github actions', 'gitlab ci', 'pipelines']],
    ['Git', ['version control', 'github', 'gitlab', 'bitbucket']],
    ['Infrastructure as Code', ['terraform', 'ansible', 'pulumi', 'cloudformation']],
    ['Observability', ['monitoring', 'prometheus', 'grafana', 'logging', 'ELK stack']],
    ['Agile & Scrum', ['scrum', 'kanban', 'agile methodology', 'jira', 'sprint planning']],
  ],

  'Mobile Development': [
    ['Android Development', ['android studio', 'android sdk', 'jetpack compose']],
    ['iOS Development', ['swift', 'swiftui', 'xcode', 'objective-c']],
    ['Flutter', ['dart', 'dartlang']],
    ['React Native', ['expo', 'cross platform mobile']],
    ['Mobile UI', ['responsive design', 'mobile first']],
  ],

  'CS Fundamentals': [
    ['Data Structures', ['data structures and algorithms', 'dsa', 'trees', 'graphs', 'linked lists']],
    ['Algorithms', ['algorithm design', 'complexity analysis', 'big o', 'dynamic programming']],
    ['Object-Oriented Programming', ['oop', 'object oriented', 'inheritance', 'polymorphism']],
    ['Discrete Mathematics', ['logic', 'combinatorics', 'graph theory']],
    ['Linear Algebra', ['matrix operations', 'vectors']],
    ['Probability & Calculus', ['calculus', 'probability theory', 'differential equations']],
    ['Compiler Design', ['parsing', 'lexical analysis', 'automata', 'theory of computation']],
    ['Computer Architecture', ['assembly language', 'computer organization', 'digital logic']],
    ['Numerical Methods', ['numerical analysis', 'optimization methods']],
    ['Quality Assurance', ['unit testing', 'test automation', 'selenium', 'jest', 'playwright', 'tdd', 'software testing']],
  ],

  'Accounting & Finance': [
    ['Financial Accounting', ['accounting', 'financial statements', 'general ledger', 'double entry bookkeeping']],
    ['Managerial Accounting', ['management accounting', 'cost accounting', 'costing', 'budgeting', 'variance analysis']],
    ['Auditing', ['internal audit', 'external audit', 'assurance', 'internal controls', 'fraud examination']],
    ['Taxation', ['tax', 'vat', 'withholding tax', 'income tax', 'ethiopian tax law', 'tax return']],
    ['IFRS', ['international financial reporting standards', 'gaap', 'accounting standards', 'proclamation']],
    ['Bookkeeping', ['journal entries', 'trial balance', 'accounts payable', 'accounts receivable', 'bank reconciliation', 'payroll']],
    ['Financial Reporting', ['reporting', 'consolidation', 'disclosure', 'annual report']],
    ['Accounting Software', ['quickbooks', 'tally', 'sage', 'peachtree', 'ifmis', 'general ledger software', 'zoho books']],
    ['Financial Analysis', ['financial modeling', 'valuation', 'ratio analysis', 'cash flow analysis', 'investment analysis']],
    ['Banking & Finance', ['commercial banking', 'credit analysis', 'loan processing', 'treasury', 'fintech', 'digital payments']],
  ],

  'Economics': [
    ['Microeconomics', ['micro economic', 'market structures', 'consumer theory']],
    ['Macroeconomics', ['macro economic', 'gdp', 'inflation', 'monetary policy', 'fiscal policy']],
    ['Econometrics', ['econometric analysis', 'time series analysis', 'panel data', 'stata', 'eviews', 'grete']],
    ['Development Economics', ['poverty analysis', 'impact evaluation', 'sustainable development']],
    ['International Trade', ['trade policy', 'balance of payments', 'foreign exchange', 'export import']],
    ['Public Economics', ['public finance', 'public policy', 'policy analysis', 'government expenditure']],
    ['Research Methods', ['survey design', 'questionnaire design', 'sampling', 'field research', 'data collection', 'descriptive statistics']],
    ['Cost-Benefit Analysis', ['feasibility study', 'project appraisal', 'roi analysis', 'economic evaluation']],
  ],

  'Marketing': [
    ['Digital Marketing', ['online marketing', 'internet marketing', 'performance marketing']],
    ['SEO', ['search engine optimization', 'sem', 'google ads', 'ppc']],
    ['Social Media Marketing', ['facebook ads', 'meta business suite', 'instagram marketing', 'linkedin marketing', 'tiktok marketing']],
    ['Content Marketing', ['copywriting', 'content creation', 'storytelling', 'blog writing']],
    ['Marketing Analytics', ['google analytics', 'ga4', 'marketing metrics', 'conversion tracking', 'data driven marketing']],
    ['Market Research', ['consumer behavior', 'customer segmentation', 'stp', 'swot analysis', 'pestel', 'competitor analysis']],
    ['Brand Management', ['branding', 'positioning', 'corporate identity', 'public relations']],
    ['Marketing Strategy', ['marketing mix', '4ps', 'go-to-market', 'pricing strategy', 'product marketing']],
    ['Customer Relationship Management', ['crm', 'salesforce', 'hubspot', 'customer retention', 'loyalty programs']],
    ['Sales', ['telesales', 'b2b sales', 'negotiation', 'lead generation', 'key account management']],
  ],

  'Business & Management': [
    ['Project Management', ['pmp', 'PRINCE2', 'project planning', 'work breakdown structure', 'gantt', 'monitoring and evaluation', 'm&e']],
    ['Human Resource Management', ['hrm', 'recruitment', 'talent acquisition', 'performance management', 'employee relations', 'compensation and benefits', 'hris']],
    ['Supply Chain Management', ['logistics', 'procurement', 'inventory management', 'warehouse management', 'purchasing', 'demand planning']],
    ['Business Analysis', ['requirement gathering', 'brd', 'process mapping', 'business process', 'data gathering']],
    ['Strategic Management', ['strategic planning', 'business strategy', 'balanced scorecard', 'organizational development']],
    ['Operations Management', ['process improvement', 'quality management', 'iso 9001', 'six sigma', 'lean', 'total quality management']],
    ['Enterprise Systems', ['erp', 'sap', 'odoo', 'crm software', 'business information system', 'mis']],
    ['Entrepreneurship', ['business plan', 'startup', 'feasibility study', 'small business management']],
    ['Organizational Behavior', ['leadership', 'teamwork', 'motivation', 'change management', 'conflict management']],
    ['Customer Service', ['client relations', 'call center', 'customer support', 'service quality']],
  ],

  'Tourism & Hospitality': [
    ['Tour Operations', ['travel agency', 'tour packaging', 'itinerary planning', 'tour guiding', 'tour guide']],
    ['Global Distribution Systems', ['gds', 'amadeus', 'galileo', 'sabre', 'sita', 'reservation system']],
    ['Front Office Operations', ['hotel reception', 'check-in', 'property management system', 'pms', 'foh']],
    ['Housekeeping Management', ['accommodation operations', 'facility services']],
    ['Food & Beverage Service', ['restaurant operations', 'catering', 'barista', 'hospitality']],
    ['Event Management', ['conference planning', 'mice', 'meeting planning', 'exhibition management']],
    ['Ecotourism', ['sustainable tourism', 'community based tourism', 'nature guiding']],
    ['Heritage & Cultural Tourism', ['museum', 'archaeology', 'unesco site', 'cultural heritage', 'historical sites']],
    ['Travel Documentation', ['visa processing', 'air ticketing', 'iyta', 'travel insurance', 'immigration rules']],
    ['Tourism Marketing', ['destination marketing', 'tourism promotion', 'hospitality sales']],
  ],

  'Professional Skills': [
    ['Communication Skills', ['presentation', 'public speaking', 'report writing', 'technical writing']],
    ['Teamwork', ['collaboration', 'cross functional teamwork', 'group work']],
    ['Problem Solving', ['critical thinking', 'analytical skills', 'troubleshooting']],
    ['Time Management', ['organization skills', 'ability to work under pressure', 'deadline oriented']],
    ['Languages', ['amharic', 'english', 'afan oromo', 'tigrinya', 'arabic', 'french']],
  ],
};

/** Skills that must never be treated as CV evidence because they are generic. */
export const STOP_TERMS = new Set([
  'teamwork', 'communication', 'hard working', 'fast learner', 'microsoft office',
]);

/** Flattened [name, categoryIdHint, aliases] triples used by the seeder. */
export function catalogRows() {
  const rows = [];
  for (const [category, skills] of Object.entries(CATALOG)) {
    for (const [name, aliases] of skills) rows.push({ category, name, aliases });
  }
  return rows;
}
