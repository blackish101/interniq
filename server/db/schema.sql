-- =====================================================================
--  InternIQ - PostgreSQL schema
--  AI-Assisted Career and Internship Matching Platform
--  St. Mary's University - Career Services
--
--  Target: PostgreSQL 15+. Runs unmodified on PGlite (embedded, used for
--  this prototype) and on a standalone PostgreSQL server (final project) -
--  only the connection string changes.
--
--  Design notes for the report:
--   * One identity table (app_user) with role-scoped detail tables, so a
--     student, employer, mentor and Career Services admin share login,
--     notifications and messaging but keep separate profile data.
--   * Skills are normalised into skill / skill_category with an alias list
--     consumed by the NLP extractor - never stored as free text on a user.
--   * Every AI match score written to an application is persisted together
--     with its JSONB breakdown, so scoring is auditable (objective 7).
--   * application_event is an append-only status history: gives the real
--     time tracking Career Services currently has on paper.
-- =====================================================================

BEGIN;

-- ---------- reference data -------------------------------------------

CREATE TABLE department (
  id      SERIAL PRIMARY KEY,
  code    TEXT NOT NULL UNIQUE,
  name    TEXT NOT NULL,
  college TEXT NOT NULL
);

CREATE TABLE skill_category (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

-- alias = the surface forms the NLP extractor looks for in a CV,
-- e.g. skill "PostgreSQL" is matched by "postgres", "psql", "pgsql".
CREATE TABLE skill (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  category_id INTEGER NOT NULL REFERENCES skill_category(id) ON DELETE CASCADE,
  aliases     TEXT[] NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_skill_category ON skill(category_id);
CREATE INDEX idx_skill_aliases  ON skill USING GIN (aliases);

-- ---------- identity & role-based access -----------------------------

CREATE TABLE app_user (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('student','employer','mentor','admin')),
  full_name     TEXT NOT NULL,
  avatar_color  TEXT NOT NULL DEFAULT '#32373c',
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_role ON app_user(role) WHERE is_active;

-- Students: internship-eligible, one per app_user of role 'student'.
CREATE TABLE student_profile (
  user_id          BIGINT PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
  student_id       TEXT UNIQUE,
  department_id    INTEGER NOT NULL REFERENCES department(id),
  program          TEXT NOT NULL DEFAULT 'regular' CHECK (program IN ('regular','extension')),
  year_of_study    SMALLINT NOT NULL CHECK (year_of_study BETWEEN 1 AND 7),
  graduation_year  INTEGER CHECK (graduation_year BETWEEN 2000 AND 2100),
  gpa              NUMERIC(3,2) CHECK (gpa BETWEEN 0 AND 4),
  phone            TEXT,
  city             TEXT,
  headline         TEXT,
  bio              TEXT,
  cv_raw_text      TEXT,
  cv_extracted_at  TIMESTAMPTZ,
  interests        TEXT[] NOT NULL DEFAULT '{}',
  target_roles     TEXT[] NOT NULL DEFAULT '{}',
  preferred_format TEXT NOT NULL DEFAULT 'hybrid'
                   CHECK (preferred_format IN ('onsite','remote','hybrid','flexible')),
  available_from   DATE,
  availability_hours SMALLINT CHECK (availability_hours BETWEEN 0 AND 60),
  linkedin         TEXT,
  github           TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_student_department ON student_profile(department_id);

-- Employers: verified by Career Services before postings go live (sec 1.6.1).
CREATE TABLE employer_profile (
  user_id             BIGINT PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
  company_name        TEXT NOT NULL,
  industry            TEXT,
  company_size        TEXT CHECK (company_size IN ('1-10','11-50','51-200','201-500','500+')),
  contact_person      TEXT,
  website             TEXT,
  city                TEXT,
  about               TEXT,
  verification_status TEXT NOT NULL DEFAULT 'pending'
                      CHECK (verification_status IN ('pending','verified','rejected')),
  verified_by         BIGINT REFERENCES app_user(id),
  verified_at         TIMESTAMPTZ,
  hosting_history     SMALLINT NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Alumni / industry mentor: networking extension beyond documented scope.
CREATE TABLE mentor_profile (
  user_id            BIGINT PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
  headline           TEXT,
  company            TEXT,
  role_title         TEXT,
  seniority          TEXT CHECK (seniority IN ('junior','mid','senior','staff','principal','executive')),
  years_experience   NUMERIC(4,1) NOT NULL DEFAULT 0,
  bio                TEXT,
  city               TEXT,
  focus_areas        TEXT[] NOT NULL DEFAULT '{}',
  open_to            TEXT[] NOT NULL DEFAULT '{}',
  availability_hours SMALLINT CHECK (availability_hours BETWEEN 0 AND 40),
  alma_mater         TEXT,
  linkedin           TEXT,
  github             TEXT
);

-- Weighted skill ownership shared by every role.
-- source records whether the level was self-declared or NLP-extracted,
-- which the matching engine uses to discount unverified claims.
CREATE TABLE profile_skill (
  user_id  BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  skill_id INTEGER NOT NULL REFERENCES skill(id) ON DELETE CASCADE,
  level    SMALLINT NOT NULL CHECK (level BETWEEN 1 AND 5),
  source   TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','cv_extraction')),
  PRIMARY KEY (user_id, skill_id)
);

CREATE INDEX idx_profile_skill_skill ON profile_skill(skill_id);

-- Documents a student submits to Career Services during the cycle.
CREATE TABLE submission_document (
  id         BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('cv','assignment_letter','daily_log','evaluation_report','completion_form')),
  filename   TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft','submitted','approved','returned')),
  note       TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_document_student ON submission_document(student_id);

-- ---------- internships (Handshake side) -----------------------------

CREATE TABLE internship (
  id           BIGSERIAL PRIMARY KEY,
  employer_id  BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL,
  responsibilities TEXT[] NOT NULL DEFAULT '{}',
  company      TEXT NOT NULL,
  location     TEXT,
  city         TEXT,
  format       TEXT NOT NULL DEFAULT 'onsite' CHECK (format IN ('onsite','remote','hybrid')),
  level        TEXT NOT NULL DEFAULT 'beginner' CHECK (level IN ('beginner','intermediate','advanced')),
  duration_days SMALLINT NOT NULL DEFAULT 40,
  hours_per_week SMALLINT CHECK (hours_per_week BETWEEN 0 AND 60),
  stipend      TEXT,
  batch        TEXT NOT NULL DEFAULT 'Summer 2026',
  capacity     SMALLINT NOT NULL DEFAULT 1 CHECK (capacity > 0),
  min_year     SMALLINT NOT NULL DEFAULT 3 CHECK (min_year BETWEEN 1 AND 7),
  min_gpa      NUMERIC(3,2) CHECK (min_gpa BETWEEN 0 AND 4),
  status       TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','closed')),
  application_deadline DATE,
  start_date   DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_internship_status ON internship(status, application_deadline);
CREATE INDEX idx_internship_employer ON internship(employer_id);

-- Department-aware eligibility: an internship names the departments it accepts.
CREATE TABLE internship_department (
  internship_id BIGINT NOT NULL REFERENCES internship(id) ON DELETE CASCADE,
  department_id INTEGER NOT NULL REFERENCES department(id) ON DELETE CASCADE,
  PRIMARY KEY (internship_id, department_id)
);

-- Requirements carry an importance weight 1..5 consumed by the scorer.
CREATE TABLE internship_skill (
  internship_id BIGINT NOT NULL REFERENCES internship(id) ON DELETE CASCADE,
  skill_id      INTEGER NOT NULL REFERENCES skill(id) ON DELETE CASCADE,
  required      BOOLEAN NOT NULL DEFAULT TRUE,
  weight        SMALLINT NOT NULL DEFAULT 3 CHECK (weight BETWEEN 1 AND 5),
  PRIMARY KEY (internship_id, skill_id)
);

CREATE INDEX idx_internship_skill ON internship_skill(skill_id);

-- ---------- applications & status tracking ---------------------------

CREATE TABLE application (
  id              BIGSERIAL PRIMARY KEY,
  internship_id   BIGINT NOT NULL REFERENCES internship(id) ON DELETE CASCADE,
  student_id      BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'submitted'
                  CHECK (status IN ('submitted','under_review','shortlisted','accepted',
                                    'rejected','withdrawn','completed')),
  match_score     NUMERIC(5,2),
  match_breakdown JSONB,
  cover_note      TEXT,
  source          TEXT NOT NULL DEFAULT 'student_apply'
                  CHECK (source IN ('student_apply','employer_invite','recommendation')),
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at      TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (internship_id, student_id)
);

CREATE INDEX idx_application_student ON application(student_id, status);
CREATE INDEX idx_application_internship ON application(internship_id, status);

-- Append-only audit trail = the real-time visibility the paper process lacks.
CREATE TABLE application_event (
  id             BIGSERIAL PRIMARY KEY,
  application_id BIGINT NOT NULL REFERENCES application(id) ON DELETE CASCADE,
  from_status    TEXT,
  to_status      TEXT NOT NULL,
  changed_by     BIGINT REFERENCES app_user(id) ON DELETE SET NULL,
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_event_application ON application_event(application_id, id);

-- Placement outcome tracking, feeds the placement-rate analytics.
CREATE TABLE placement (
  id               BIGSERIAL PRIMARY KEY UNIQUE,
  application_id   BIGINT NOT NULL REFERENCES application(id) ON DELETE CASCADE UNIQUE,
  start_date       DATE,
  end_date         DATE,
  supervisor_name  TEXT,
  supervisor_email TEXT,
  evaluation_score NUMERIC(3,1) CHECK (evaluation_score BETWEEN 0 AND 10),
  completion_status TEXT NOT NULL DEFAULT 'in_progress'
                    CHECK (completion_status IN ('in_progress','completed','failed','cancelled')),
  report_submitted BOOLEAN NOT NULL DEFAULT FALSE
);

-- ---------- network & mentorship (LinkedIn-side extension) ----------

CREATE TABLE connection (
  id           BIGSERIAL PRIMARY KEY,
  requester_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  addressee_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL DEFAULT 'network' CHECK (kind IN ('network','mentorship')),
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','revoked')),
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (requester_id < addressee_id)
);

CREATE UNIQUE INDEX idx_connection_pair ON connection(requester_id, addressee_id);
CREATE INDEX idx_connection_status ON connection(status);

-- ---------- messaging (extension: excluded from documented scope) ---

CREATE TABLE conversation (
  id              BIGSERIAL PRIMARY KEY,
  participant_one BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  participant_two BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  topic           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (participant_one < participant_two),
  UNIQUE (participant_one, participant_two)
);

CREATE TABLE message (
  id              BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
  sender_id       BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  body            TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at         TIMESTAMPTZ
);

CREATE INDEX idx_message_thread ON message(conversation_id, id DESC);

-- ---------- notifications -------------------------------------------

CREATE TABLE notification (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('match','deadline','status','connection','message','system')),
  title      TEXT NOT NULL,
  body       TEXT,
  link       TEXT,
  is_read    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notification_user ON notification(user_id, is_read, id DESC);

-- ---------- matching evaluation (objective 7) ------------------------

-- Hand-labelled relevance judgements: the labelled set the accuracy of the
-- AI engine is measured against (precision@k, recall@k).
CREATE TABLE eval_case (
  internship_id BIGINT NOT NULL REFERENCES internship(id) ON DELETE CASCADE,
  student_id    BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  relevant      BOOLEAN NOT NULL,
  rationale     TEXT,
  labelled_by   BIGINT REFERENCES app_user(id),
  PRIMARY KEY (internship_id, student_id)
);

-- ---------- read models ---------------------------------------------

CREATE VIEW v_user AS
SELECT
  u.id, u.email, u.role, u.full_name, u.avatar_color, u.is_active, u.created_at,
  COALESCE(sp.headline, mp.headline, ep.company_name)                    AS headline,
  COALESCE(sp.city, mp.city, ep.city)                                    AS city,
  ep.company_name, ep.verification_status, ep.industry,
  d.name                                                                 AS department,
  d.code                                                                 AS department_code,
  sp.year_of_study, sp.graduation_year, sp.program, sp.gpa,
  sp.preferred_format, sp.interests, sp.target_roles,
  mp.seniority, mp.years_experience, mp.company, mp.focus_areas, mp.alma_mater,
  coalesce(sp.interests, '{}') || coalesce(mp.focus_areas, '{}')          AS affinity_topics
FROM app_user u
LEFT JOIN student_profile  sp ON sp.user_id = u.id
LEFT JOIN mentor_profile   mp ON mp.user_id = u.id
LEFT JOIN employer_profile ep ON ep.user_id = u.id
LEFT JOIN department       d  ON d.id = sp.department_id;

CREATE VIEW v_user_skills AS
SELECT
  ps.user_id,
  jsonb_object_agg(s.name, ps.level)                       AS skill_levels,
  array_agg(s.name ORDER BY ps.level DESC, s.name)         AS skill_names,
  array_agg(DISTINCT sc.name ORDER BY sc.name)              AS categories,
  max(ps.level)                                            AS top_level,
  count(*)                                                 AS skill_count
FROM profile_skill ps
JOIN skill s           ON s.id = ps.skill_id
JOIN skill_category sc ON sc.id = s.category_id
GROUP BY ps.user_id;

CREATE VIEW v_internship_requirement AS
SELECT
  i.id AS internship_id,
  jsonb_object_agg(s.name, ir.weight)                             AS requirement_levels,
  array_agg(s.name ORDER BY ir.weight DESC, s.name)               AS requirement_names,
  count(*) FILTER (WHERE ir.required)                             AS required_count,
  sum(ir.weight) FILTER (WHERE ir.required)                       AS required_weight
FROM internship i
JOIN internship_skill ir ON ir.internship_id = i.id
JOIN skill s             ON s.id = ir.skill_id
GROUP BY i.id;

CREATE VIEW v_internship_departments AS
SELECT
  idt.internship_id,
  array_agg(d.name ORDER BY d.name) AS departments,
  array_agg(d.code ORDER BY d.name) AS department_codes
FROM internship_department idt
JOIN department d ON d.id = idt.department_id
GROUP BY idt.internship_id;

CREATE VIEW v_application_tracking AS
SELECT
  a.id AS application_id,
  a.status,
  a.match_score,
  a.submitted_at,
  a.updated_at,
  s.id AS student_id, s.full_name AS student_name,
  d.code AS department_code, d.name AS department,
  i.id AS internship_id, i.title, i.company, i.batch,
  e.id AS employer_id, e.email AS employer_email,
  (SELECT to_status FROM application_event WHERE application_id = a.id ORDER BY id DESC LIMIT 1) AS last_event
FROM application a
JOIN app_user s           ON s.id = a.student_id
JOIN student_profile sp   ON sp.user_id = s.id
JOIN department d         ON d.id = sp.department_id
JOIN internship i         ON i.id = a.internship_id
JOIN app_user e           ON e.id = i.employer_id;

CREATE VIEW v_placement_rate_by_department AS
SELECT
  d.code,
  d.name                                              AS department,
  count(DISTINCT sp.user_id)                          AS eligible_students,
  count(a.id)                                         AS applications,
  count(*) FILTER (WHERE a.status = 'accepted')       AS accepted,
  count(*) FILTER (WHERE a.status = 'rejected')       AS rejected,
  count(p.id) FILTER (WHERE p.completion_status = 'completed') AS completed_placements,
  round(
    CASE WHEN count(DISTINCT sp.user_id) = 0 THEN 0
         ELSE count(DISTINCT a.student_id) FILTER (WHERE a.status IN ('accepted','completed'))::numeric
              / count(DISTINCT sp.user_id) * 100
    END, 1) AS placement_pct
FROM department d
LEFT JOIN student_profile sp ON sp.department_id = d.id
LEFT JOIN application a      ON a.student_id = sp.user_id
LEFT JOIN placement p        ON p.application_id = a.id
GROUP BY d.id
ORDER BY d.name;

CREATE VIEW v_connection_member AS
SELECT requester_id AS user_id, addressee_id AS other_id, kind, status, updated_at
FROM connection WHERE status = 'accepted'
UNION ALL
SELECT addressee_id, requester_id, kind, status, updated_at
FROM connection WHERE status = 'accepted';

CREATE VIEW v_platform_stats AS
SELECT
  (SELECT count(*) FROM app_user WHERE role='student'  AND is_active) AS students,
  (SELECT count(*) FROM app_user WHERE role='employer' AND is_active) AS employers,
  (SELECT count(*) FROM app_user WHERE role='mentor'   AND is_active) AS mentors,
  (SELECT count(*) FROM employer_profile WHERE verification_status='pending') AS pending_verifications,
  (SELECT count(*) FROM internship WHERE status='published')                  AS published_internships,
  (SELECT count(*) FROM application)                                          AS applications,
  (SELECT count(*) FROM application WHERE status='accepted')                   AS accepted_applications,
  (SELECT count(*) FROM connection WHERE status='accepted')                    AS connections,
  (SELECT round(coalesce(avg(match_score),0),1) FROM application WHERE match_score IS NOT NULL) AS avg_match_score,
  (SELECT count(*) FROM placement WHERE completion_status='completed')          AS completed_placements;

COMMIT;
