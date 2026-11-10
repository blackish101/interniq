/**
 * Matching service: loads profiles and postings from PostgreSQL, runs the NLP
 * pipeline, and caches the result set. Cache is versioned and invalidated by
 * any write that can change a score (CV upload, skill edit, posting edit).
 */

import { q, q1 } from '../db.js';
import { analyzeCv } from '../nlp/extract.js';
import { buildIdf, vectorize, cosine, jaccard } from '../nlp/vectors.js';
import { scoreMatch, evaluateRanking, WEIGHTS } from '../nlp/match.js';

let version = 0;
let cache = { version: -1, students: null, internships: null, lexicon: null };

export function invalidateMatching() {
  version += 1;
}

const num = (v) => (v == null ? null : Number(v));

export async function lexicon() {
  if (cache.version === version && cache.lexicon) return cache.lexicon;
  cache.lexicon = (await q(`
    select s.id, s.name, sc.name as category, s.aliases
    from skill s join skill_category sc on sc.id = s.category_id
    order by sc.name, s.name
  `)).map((r) => ({ id: num(r.id), name: r.name, category: r.category, aliases: r.aliases ?? [] }));
  cache.version = version;
  return cache.lexicon;
}

async function loadStudents() {
  const rows = await q(`
    select u.*, us.skill_levels, s.cv_raw_text, s.headline as student_headline, s.bio, s.interests, s.target_roles,
           s.preferred_format, s.city, s.availability_hours, s.year_of_study, s.gpa, s.program, s.graduation_year,
           s.available_from, s.student_id as matric, d.name as department_name
    from v_user u
    join student_profile s on s.user_id = u.id
    join department d on d.id = s.department_id
    left join v_user_skills us on us.user_id = u.id
    where u.role = 'student' and u.is_active
  `);
  return rows.map((r) => ({
    ...r,
    id: num(r.id),
    year_of_study: num(r.year_of_study),
    gpa: r.gpa == null ? null : Number(r.gpa),
    availability_hours: r.availability_hours == null ? 30 : Number(r.availability_hours),
    skill_levels: r.skill_levels ?? {},
    cv_text: r.cv_raw_text ?? '',
  }));
}

export async function loadInternships({ status = 'published', includeDrafts = false } = {}) {
  const where = includeDrafts ? 'true' : status === 'all' ? 'true' : `i.status = $1`;
  const rows = await q(`
    select i.*, coalesce(vd.departments, '{}') as departments, coalesce(vd.department_codes, '{}') as department_codes
    from internship i
    left join v_internship_departments vd on vd.internship_id = i.id
    where ${where}
    order by i.application_deadline asc nulls last
  `, includeDrafts || status === 'all' ? [] : [status]);

  const reqRows = await q(`
    select ir.internship_id, s.name as skill, ir.weight, ir.required
    from internship_skill ir join skill s on s.id = ir.skill_id
  `);
  const byInternship = new Map();
  for (const r of reqRows) {
    const id = num(r.internship_id);
    if (!byInternship.has(id)) byInternship.set(id, []);
    byInternship.get(id).push({ skill: r.skill, weight: num(r.weight), required: r.required });
  }
  return rows.map((r) => ({
    ...r,
    id: num(r.id),
    employer_id: num(r.employer_id),
    min_year: num(r.min_year),
    min_gpa: r.min_gpa == null ? 0 : Number(r.min_gpa),
    hours_per_week: r.hours_per_week == null ? 30 : Number(r.hours_per_week),
    capacity: num(r.capacity),
    duration_days: num(r.duration_days),
    topics: r.topics ?? [],
    requirements: byInternship.get(num(r.id)) ?? [],
  }));
}

function postingText(i) {
  return `${i.title} ${i.description} ${(i.responsibilities ?? []).join(' ')} ${i.company}`;
}

/** Scores a single student against every (filtered) posting. */
export async function recommendForStudent(studentId, filter = {}) {
  const [students, internships] = await Promise.all([loadStudents(), loadInternships(filter.status ? { status: filter.status } : {})]);
  const student = students.find((s) => s.id === Number(studentId));
  if (!student) return null;

  const texts = [student.cv_text, ...internships.map(postingText)];
  const idf = buildIdf(texts);
  const vStudent = vectorize(student.cv_text, idf);

  const applied = new Set((await q('select internship_id from application where student_id = $1', [studentId])).map((r) => num(r.internship_id)));

  const out = internships.map((i) => {
    const vPost = vectorize(postingText(i), idf);
    const m = scoreMatch(student, i, { cosine: cosine(vStudent, vPost), jaccard: jaccard(student.cv_text, postingText(i)) });
    return {
      internship_id: i.id,
      title: i.title,
      company: i.company,
      format: i.format,
      city: i.city,
      level: i.level,
      stipend: i.stipend,
      duration_days: i.duration_days,
      application_deadline: i.application_deadline,
      departments: i.departments,
      required_skills: i.requirements.filter((r) => r.required).map((r) => r.skill),
      already_applied: applied.has(i.id),
      status: i.status,
      score: m.score,
      eligible: m.eligible,
      flags: m.flags,
      reasons: m.reasons,
      gaps: m.gaps,
      breakdown: m.breakdown,
    };
  });

  out.sort((a, b) => b.score - a.score || String(a.application_deadline).localeCompare(String(b.application_deadline)));
  return { student, results: out, corpus_size: internships.length };
}

/** Scores every eligible-looking student against one posting (employer view). */
export async function applicantsForInternship(internshipId, { limit = 40 } = {}) {
  const [students, allInternships] = await Promise.all([loadStudents(), loadInternships({ includeDrafts: true })]);
  const posting = allInternships.find((i) => i.id === Number(internshipId));
  if (!posting) return null;

  const idf = buildIdf([...students.map((s) => s.cv_text), postingText(posting)]);
  const vPost = vectorize(postingText(posting), idf);

  const apps = await q('select * from application where internship_id = $1', [internshipId]);
  const appByStudent = new Map(apps.map((a) => [num(a.student_id), a]));

  const ranked = students.map((s) => {
    const v = vectorize(s.cv_text, idf);
    const m = scoreMatch(s, posting, { cosine: cosine(v, vPost), jaccard: jaccard(s.cv_text, postingText(posting)) });
    const app = appByStudent.get(s.id);
    return {
      student_id: s.id,
      full_name: s.full_name,
      avatar_color: s.avatar_color,
      department: s.department,
      department_code: s.department_code,
      year_of_study: s.year_of_study,
      gpa: s.gpa,
      city: s.city,
      headline: s.headline,
      top_skills: Object.entries(s.skill_levels).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v2]) => ({ skill: k, level: v2 })),
      skill_count: Object.keys(s.skill_levels).length,
      score: m.score,
      eligible: m.eligible,
      flags: m.flags,
      reasons: m.reasons,
      gaps: m.gaps,
      breakdown: m.breakdown,
      has_applied: Boolean(app),
      application_id: app ? num(app.id) : null,
      application_status: app?.status ?? null,
    };
  }).sort((a, b) => b.score - a.score);

  return { posting, applicants: ranked, applied_count: apps.length, limit };
}

/** One-off explanation used by the "why this score" panel. */
export async function explainMatch(studentId, internshipId) {
  const rec = await recommendForStudent(studentId);
  if (!rec) return null;
  return rec.results.find((r) => r.internship_id === Number(internshipId)) ?? null;
}

/** Runs the extractor over raw CV text without writing anything. */
export async function previewCv(text) {
  const lex = await lexicon();
  const analysis = analyzeCv(text, lex);
  const existing = new Map();
  return { ...analysis, lexicon_size: lex.length };
}

/** Commits an extraction result into profile_skill rows. */
export async function commitCv(userId, text, skills) {
  await q1('update student_profile set cv_raw_text = $2, cv_extracted_at = now(), updated_at = now() where user_id = $1', [userId, text]);
  await q("delete from profile_skill where user_id = $1 and source = 'cv_extraction'", [userId]);
  let inserted = 0;
  for (const s of skills) {
    const res = await q(
      'insert into profile_skill (user_id, skill_id, level, source) values ($1,$2,$3,$4) on conflict (user_id, skill_id) do update set level = excluded.level, source = excluded.source returning skill_id',
      [userId, s.skill_id, s.level, 'cv_extraction']
    );
    if (res.length) inserted += 1;
  }
  invalidateMatching();
  return { inserted };
}

export async function setProfileSkill(userId, skillName, level, source = 'manual') {
  const skill = await q1('select id from skill where lower(name) = lower($1)', [skillName]);
  if (!skill) return null;
  await q(
    'insert into profile_skill (user_id, skill_id, level, source) values ($1,$2,$3,$4) on conflict (user_id, skill_id) do update set level = excluded.level',
    [userId, num(skill.id), level, source]
  );
  invalidateMatching();
  return { skill: skillName, level };
}

export async function removeProfileSkill(userId, skillId) {
  await q('delete from profile_skill where user_id = $1 and skill_id = $2', [userId, skillId]);
  invalidateMatching();
  return true;
}

/**
 * Accuracy report over the hand-labelled set: rank students for each labelled
 * posting and measure precision@k / recall@k / MAP. Objective 7 of the project.
 */
export async function accuracyReport(ks = [1, 3, 5, 10]) {
  const labels = await q('select internship_id, student_id, relevant from eval_case');
  if (!labels.length) return { available: false };

  const grouped = new Map();
  for (const l of labels) {
    const key = num(l.internship_id);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push({ student_id: num(l.student_id), isRelevant: l.relevant });
  }

  const labelPairs = new Map(labels.map((l) => [[num(l.internship_id), num(l.student_id)], l.relevant]));
  const rankedLists = new Map();
  for (const internshipId of grouped.keys()) {
    const res = await applicantsForInternship(internshipId, { limit: 100 });
    if (!res) continue;
    rankedLists.set(internshipId, res.applicants.map((a) => ({ student_id: a.student_id, score: a.score })));
  }

  const evalResult = evaluateRanking(rankedLists, labelPairs);
  const relevantTotal = labels.filter((l) => l.relevant).length;
  const coverage = [...grouped.entries()].map(([iid, list]) => {
    const ranked = rankedLists.get(iid) ?? [];
    const posRank = new Map(ranked.map((r, idx) => [r.student_id, idx + 1]));
    const judged = list.map((c) => ({ ...c, engine_rank: posRank.get(c.student_id) ?? null, engine_score: ranked.find((r) => r.student_id === c.student_id)?.score ?? null }));
    return { internship_id: iid, judged: judged.length, relevant: list.filter((c) => c.isRelevant).length, judged_rows: judged };
  });

  return {
    available: true,
    weights: WEIGHTS,
    k_values: ks,
    metrics: evalResult,
    labelled_pairs: labels.length,
    relevant_pairs: relevantTotal,
    internships_evaluated: grouped.size,
    students_judged: new Set(labels.map((l) => num(l.student_id))).size,
    coverage,
  };
}

export { loadStudents };
