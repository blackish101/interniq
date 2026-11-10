import { Router } from 'express';
import { q, q1, tx } from '../db.js';
import { ah, bad, authRequired, authOptional, requireRole } from '../http.js';
import { loadInternships, recommendForStudent, applicantsForInternship, invalidateMatching } from '../services/matching.js';

export const router = Router();

const num = (v) => (v == null ? null : Number(v));
const ARR = (v) => (Array.isArray(v) ? v : String(v ?? '').split('|').filter(Boolean));

function shape(i) {
  return {
    id: num(i.id),
    title: i.title,
    company: i.company,
    employer_id: num(i.employer_id),
    description: i.description,
    responsibilities: ARR(i.responsibilities),
    location: i.location,
    city: i.city,
    format: i.format,
    level: i.level,
    duration_days: i.duration_days,
    hours_per_week: i.hours_per_week,
    stipend: i.stipend,
    batch: i.batch,
    capacity: i.capacity,
    min_year: i.min_year,
    min_gpa: i.min_gpa == null ? null : Number(i.min_gpa),
    status: i.status,
    application_deadline: i.application_deadline,
    start_date: i.start_date,
    departments: i.departments ?? [],
    department_codes: i.department_codes ?? [],
    requirements: i.requirements ?? [],
  };
}

/**
 * GET /api/internships
 * Search + filter board. When a student is signed in, every row carries the
 * live match score so the board and the recommender agree.
 */
router.get('/', authOptional, ah(async (req, res) => {
  const {
    q: term, department, format, level, type, status = 'published',
    sort = 'deadline', city, min_gpa,
  } = req.query;

  const includeDrafts = req.user?.role === 'employer' || req.user?.role === 'admin';
  let rows = await loadInternships({ status: includeDrafts && status === 'all' ? 'all' : status, includeDrafts });

  const filters = [];
  if (term) {
    const t = String(term).toLowerCase();
    filters.push((i) => [i.title, i.company, i.description, i.city].join(' ').toLowerCase().includes(t));
  }
  if (department) filters.push((i) => (i.department_codes ?? []).includes(department) || (i.departments ?? []).some((d) => d.toLowerCase() === String(department).toLowerCase()));
  if (format) filters.push((i) => i.format === format);
  if (level) filters.push((i) => i.level === level);
  if (city) filters.push((i) => (i.city ?? '').toLowerCase().includes(String(city).toLowerCase()));
  if (min_gpa) filters.push((i) => Number(i.min_gpa ?? 0) <= Number(min_gpa));
  if (req.user?.role === 'employer') filters.push((i) => num(i.employer_id) === req.user.id);
  if (type === 'mine' && req.user) filters.push((i) => num(i.employer_id) === req.user.id);

  rows = rows.filter((i) => filters.every((f) => f(i)));

  let scored = null;
  if (req.user?.role === 'student') {
    scored = await recommendForStudent(req.user.id, { status: 'published' });
    const byId = new Map(scored.results.map((r) => [r.internship_id, r]));
    rows = rows.map((i) => {
      const s = byId.get(i.id);
      return s ? { ...shape(i), match_score: s.score, eligible: s.eligible, flags: s.flags, top_reason: s.reasons[0] ?? null, already_applied: s.already_applied } : { ...shape(i) };
    });
    if (sort === 'match') rows.sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0));
    else if (sort === 'company') rows.sort((a, b) => String(a.company).localeCompare(String(b.company)));
    else rows.sort((a, b) => String(a.application_deadline ?? '9999').localeCompare(String(b.application_deadline ?? '9999')));
  } else {
    rows = rows.map(shape);
    const apps = await q(`select internship_id, count(*)::int as applications, count(*) filter (where status='accepted')::int as accepted from application group by internship_id`);
    const byId = new Map(apps.map((a) => [num(a.internship_id), a]));
    rows = rows.map((i) => ({ ...i, applications: byId.get(i.id)?.applications ?? 0, accepted: byId.get(i.id)?.accepted ?? 0 }));
    if (sort === 'match') rows.sort((a, b) => String(b.title).localeCompare(String(a.title)));
  }

  res.json({
    internships: rows,
    total: rows.length,
    scored_against: scored ? scored.corpus_size : null,
    facets: {
      departments: [...new Set(rows.flatMap((i) => i.departments ?? []))].sort(),
      formats: [...new Set(rows.map((i) => i.format))].sort(),
      levels: [...new Set(rows.map((i) => i.level))].sort(),
    },
  });
}));

router.get('/stats/overview', ah(async (req, res) => {
  const s = await q1('select * from v_platform_stats');
  const byDept = await q('select * from v_placement_rate_by_department');
  const upcoming = await q("select id, title, company, application_deadline from internship where status='published' and application_deadline::date >= current_date order by application_deadline limit 6");
  res.json({ stats: s, by_department: byDept, upcoming_deadlines: upcoming });
}));

/** GET /api/internships/:id - detail incl. requirements and viewer-specific state. */
router.get('/:id', authOptional, ah(async (req, res) => {
  const id = Number(req.params.id);
  const all = await loadInternships({ includeDrafts: true, status: 'all' });
  const i = all.find((x) => x.id === id);
  if (!i) bad(404, 'Internship not found');

  const employer = await q1('select * from v_user where id = $1', [i.employer_id]);
  const seats = await q1("select count(*)::int as n from application where internship_id = $1 and status = 'accepted'", [id]);
  const applied = req.user ? await q1('select * from application where internship_id = $1 and student_id = $2', [id, req.user.id]) : null;
  const other = req.user?.role === 'student' ? await recommendForStudent(req.user.id) : null;
  const mine = other?.results.find((r) => r.internship_id === id) ?? null;

  res.json({
    internship: { ...shape(i), seats_taken: num(seats.n) },
    employer: employer ? { id: num(employer.id), company_name: employer.company_name, industry: employer.industry, city: employer.city, verification_status: employer.verification_status, full_name: employer.full_name } : null,
    match: mine,
    application: applied ? { id: num(applied.id), status: applied.status, submitted_at: applied.submitted_at, match_score: Number(applied.match_score) } : null,
    similar: (other?.results ?? []).filter((r) => r.internship_id !== id && r.eligible).slice(0, 4).map((r) => ({ internship_id: r.internship_id, title: r.title, company: r.company, score: r.score })),
  });
}));

/** POST /api/internships - employer or admin creates a posting. */
router.post('/', authRequired, requireRole('employer', 'admin'), ah(async (req, res) => {
  const b = req.body ?? {};
  if (!b.title || !b.description) bad(422, 'Title and description are required');

  const employer = req.user.role === 'employer' ? req.user : null;
  if (employer && employer.verification_status !== 'verified') {
    bad(403, 'Career Services must verify your company before you can publish an internship');
  }

  const deptIds = [];
  for (const code of ARR(b.department_codes)) {
    const d = await q1('select id from department where lower(code) = lower($1)', [code]);
    if (d) deptIds.push(num(d.id));
  }
  if (!deptIds.length) bad(422, 'Select at least one eligible department');

  const company = employer ? employer.company_name : b.company ?? req.user.full_name;
  const ownerId = employer ? employer.id : req.user.id;

  const created = await tx(async () => {
    const ins = await q1(
      `insert into internship (employer_id, title, description, responsibilities, company, location, city, format, level,
         duration_days, hours_per_week, stipend, batch, capacity, min_year, min_gpa, status, application_deadline, start_date)
       values ($1,$2,$3,string_to_array($4,'|'),$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) returning id`,
      [ownerId, b.title, b.description, ARR(b.responsibilities).join('|'), company, b.location ?? company, b.city ?? 'Addis Ababa',
        b.format ?? 'onsite', b.level ?? 'beginner', num(b.duration_days) ?? 40, num(b.hours_per_week) ?? 30, b.stipend || null,
        b.batch ?? 'Summer 2026', num(b.capacity) ?? 1, num(b.min_year) ?? 3,
        b.min_gpa == null || b.min_gpa === '' ? null : Number(b.min_gpa), b.publish === false ? 'draft' : 'published',
        b.application_deadline || null, b.start_date || null]
    );
    const id = num(ins.id);
    for (const d of deptIds) await q('insert into internship_department values ($1,$2) on conflict do nothing', [id, d]);
    for (const r of (b.requirements ?? [])) {
      const s = await q1('select id from skill where lower(name) = lower($1)', [r.skill]);
      if (s) await q('insert into internship_skill (internship_id, skill_id, required, weight) values ($1,$2,$3,$4) on conflict do nothing',
        [id, num(s.id), r.required !== false, Math.max(1, Math.min(5, num(r.weight) ?? 3))]);
    }
    return id;
  });

  invalidateMatching();
  const fresh = (await loadInternships({ includeDrafts: true, status: 'all' })).find((x) => x.id === created);
  res.status(201).json({ internship: shape(fresh) });
}));

router.put('/:id', authRequired, requireRole('employer', 'admin'), ah(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await q1('select employer_id, status from internship where id = $1', [id]);
  if (!existing) bad(404, 'Internship not found');
  if (req.user.role === 'employer' && num(existing.employer_id) !== req.user.id) bad(403, 'You can only edit your own postings');

  const b = req.body ?? {};
  const editable = ['title', 'description', 'format', 'level', 'city', 'stipend', 'capacity', 'hours_per_week', 'duration_days', 'min_year', 'application_deadline', 'start_date', 'batch', 'location'];
  for (const key of editable) {
    if (b[key] !== undefined) await q(`update internship set ${key} = $2, updated_at = now() where id = $1`, [id, b[key] === '' ? null : b[key]]);
  }
  if (b.min_gpa !== undefined) await q('update internship set min_gpa = $2, updated_at = now() where id = $1', [id, b.min_gpa === '' ? null : Number(b.min_gpa)]);
  if (b.status) await q("update internship set status = $2, updated_at = now() where id = $1 and $2 in ('draft','published','closed')", [id, b.status]);

  if (b.department_codes) {
    await q('delete from internship_department where internship_id = $1', [id]);
    for (const code of ARR(b.department_codes)) {
      const d = await q1('select id from department where lower(code) = lower($1)', [code]);
      if (d) await q('insert into internship_department values ($1,$2) on conflict do nothing', [id, num(d.id)]);
    }
  }
  if (b.requirements) {
    await q('delete from internship_skill where internship_id = $1', [id]);
    for (const r of b.requirements) {
      const s = await q1('select id from skill where lower(name) = lower($1)', [r.skill]);
      if (s) await q('insert into internship_skill (internship_id, skill_id, required, weight) values ($1,$2,$3,$4) on conflict do nothing',
        [id, num(s.id), r.required !== false, Math.max(1, Math.min(5, num(r.weight) ?? 3))]);
    }
  }

  invalidateMatching();
  const fresh = (await loadInternships({ includeDrafts: true, status: 'all' })).find((x) => x.id === id);
  res.json({ internship: shape(fresh) });
}));

/** GET /api/internships/:id/applicants - ranked students for the employer. */
router.get('/:id/applicants', authRequired, requireRole('employer', 'admin'), ah(async (req, res) => {
  const id = Number(req.params.id);
  const post = await q1('select employer_id, title from internship where id = $1', [id]);
  if (!post) bad(404, 'Internship not found');
  if (req.user.role === 'employer' && num(post.employer_id) !== req.user.id) bad(403, 'Not your posting');

  const res2 = await applicantsForInternship(id, { limit: Number(req.query.limit ?? 40) });
  const ranked = res2.applicants.map((a, idx) => ({ ...a, rank: idx + 1 }));
  res.json({
    posting: shape(res2.posting),
    applicants: ranked,
    applied_count: res2.applied_count,
    summary: {
      above_70: ranked.filter((a) => a.score >= 70).length,
      applied: ranked.filter((a) => a.has_applied).length,
      accepted: ranked.filter((a) => a.application_status === 'accepted').length,
    },
  });
}));

export default router;
