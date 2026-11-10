import { Router } from 'express';
import { q, q1 } from '../db.js';
import { ah, bad, authRequired, requireRole } from '../http.js';
import { recommendForStudent, previewCv, commitCv, setProfileSkill, removeProfileSkill, invalidateMatching } from '../services/matching.js';

export const router = Router();
const num = (v) => (v == null ? null : Number(v));
const LIST = (v) => (Array.isArray(v) ? v : String(v ?? '').split('|').filter(Boolean));

/** Turns an uploaded CV into plain text. Text/PDF-like paste is handled client side. */
async function cvToText(body) {
  const text = typeof body.text === 'string' ? body.text : '';
  if (text.trim()) return { text, source: body.filename ? `file:${body.filename}` : 'pasted' };

  if (typeof body.base64 === 'string' && body.base64.length) {
    const buffer = Buffer.from(body.base64, 'base64');
    const name = String(body.filename ?? '');
    if (/\.docx$/i.test(name) || body.mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const mammoth = (await import('mammoth')).default;
      const { value } = await mammoth.extractRawText({ buffer });
      return { text: value, source: `docx:${name}` };
    }
    if (/\.txt$|\.md$/i.test(name) || /^text\//.test(String(body.mime ?? ''))) {
      return { text: buffer.toString('utf8'), source: `text:${name}` };
    }
    bad(415, 'The prototype reads text, Markdown and Word (.docx) CVs. Scanned PDFs are a documented limitation - paste the text instead.');
  }
  bad(422, 'Provide the CV as text or as a .docx / .txt attachment');
}

router.get('/me', authRequired, requireRole('student'), ah(async (req, res) => {
  const p = await q1('select * from student_profile where user_id = $1', [req.user.id]);
  if (!p) bad(404, 'Student profile not found');
  const skills = await q(`
    select ps.user_id, ps.skill_id, ps.level, ps.source, s.name, sc.name as category
    from profile_skill ps join skill s on s.id = ps.skill_id join skill_category sc on sc.id = s.category_id
    where ps.user_id = $1 order by ps.level desc, s.name
  `, [req.user.id]);
  const docs = await q('select * from submission_document where student_id = $1 order by uploaded_at desc', [req.user.id]);
  const dept = await q1('select * from department where id = $1', [num(p.department_id)]);
  const stats = await q1(`
    select
      (select count(*)::int from application where student_id=$1) as applications,
      (select count(*)::int from application where student_id=$1 and status='accepted') as offers,
      (select count(*)::int from application where student_id=$1 and status='submitted') as pending,
      (select count(*)::int from connection where status='accepted' and (requester_id=$1 or addressee_id=$1)) as connections
  `, [req.user.id]);

  res.json({
    user: req.user,
    profile: {
      ...p,
      gpa: p.gpa == null ? null : Number(p.gpa),
      availability_hours: p.availability_hours == null ? null : Number(p.availability_hours),
      interests: LIST(p.interests),
      target_roles: LIST(p.target_roles),
      has_cv: Boolean(p.cv_raw_text),
      cv_length: (p.cv_raw_text ?? '').length,
    },
    department: dept,
    skills: skills.map((s) => ({ skill_id: num(s.skill_id), name: s.name, category: s.category, level: num(s.level), source: s.source })),
    documents: docs,
    stats,
  });
}));

router.put('/me', authRequired, requireRole('student'), ah(async (req, res) => {
  const b = req.body ?? {};
  const scalars = ['headline', 'bio', 'city', 'preferred_format', 'available_from', 'linkedin', 'github', 'phone'];
  for (const key of scalars) {
    if (b[key] !== undefined) await q(`update student_profile set ${key} = $2, updated_at = now() where user_id = $1`, [req.user.id, b[key] === '' ? null : b[key]]);
  }
  if (b.year_of_study !== undefined) await q('update student_profile set year_of_study = $2, updated_at = now() where user_id = $1', [req.user.id, num(b.year_of_study)]);
  if (b.availability_hours !== undefined) await q('update student_profile set availability_hours = $2, updated_at = now() where user_id = $1', [req.user.id, num(b.availability_hours)]);
  if (b.gpa !== undefined) await q('update student_profile set gpa = $2, updated_at = now() where user_id = $1', [req.user.id, b.gpa === '' ? null : Number(b.gpa)]);
  if (b.department_code) {
    const d = await q1('select id from department where code = $1', [b.department_code]);
    if (d) await q('update student_profile set department_id = $2, updated_at = now() where user_id = $1', [req.user.id, num(d.id)]);
  }
  if (b.program) await q('update student_profile set program = $2 where user_id = $1', [req.user.id, b.program === 'extension' ? 'extension' : 'regular']);
  if (b.interests !== undefined) await q("update student_profile set interests = string_to_array($2, '|'), updated_at = now() where user_id = $1", [req.user.id, LIST(b.interests).join('|')]);
  if (b.target_roles !== undefined) await q("update student_profile set target_roles = string_to_array($2, '|'), updated_at = now() where user_id = $1", [req.user.id, LIST(b.target_roles).join('|')]);
  if (b.full_name !== undefined) await q('update app_user set full_name = $2 where id = $1', [req.user.id, String(b.full_name).trim()]);

  invalidateMatching();
  res.json({ ok: true });
}));

/** Dry run of the NLP extractor - nothing is written until /cv/commit. */
router.post('/me/cv/preview', authRequired, requireRole('student'), ah(async (req, res) => {
  const { text, source } = await cvToText(req.body ?? {});
  const analysis = await previewCv(text);
  res.json({ ...analysis, source, characters: text.length });
}));

router.post('/me/cv/commit', authRequired, requireRole('student'), ah(async (req, res) => {
  const { text, source } = await cvToText(req.body ?? {});
  const analysis = await previewCv(text);
  const chosen = Array.isArray(req.body?.skills) && req.body.skills.length
    ? req.body.skills.filter((s) => s.skill_id && s.level)
    : analysis.skills.map((s) => ({ skill_id: s.skill_id, level: s.level }));
  if (!chosen.length) bad(422, 'No skills were recognised - add at least one skill manually');

  const result = await commitCv(req.user.id, text, chosen);
  const filename = req.body?.filename ?? `${req.user.email.split('@')[0]}_cv`;
  await q('insert into submission_document (student_id, kind, filename, status, note) values ($1,$2,$3,$4,$5)',
    [req.user.id, 'cv', String(filename).slice(0, 120), 'submitted', `Parsed from ${source}; ${chosen.length} skills extracted.`]);

  res.json({ ...result, extracted: chosen.length, metrics: analysis.metrics });
}));

router.post('/me/skills', authRequired, requireRole('student'), ah(async (req, res) => {
  const { skill, level } = req.body ?? {};
  if (!skill) bad(422, 'Skill name is required');
  const added = await setProfileSkill(req.user.id, String(skill), Math.max(1, Math.min(5, num(level) ?? 3)));
  if (!added) bad(404, `"${skill}" is not in the InternIQ skill catalogue`);
  res.json({ ok: true, ...added });
}));

router.delete('/me/skills/:skillId', authRequired, requireRole('student'), ah(async (req, res) => {
  await removeProfileSkill(req.user.id, Number(req.params.skillId));
  res.json({ ok: true });
}));

/** Recommendations endpoint - the student's ranked internship list. */
router.get('/me/recommendations', authRequired, requireRole('student'), ah(async (req, res) => {
  const out = await recommendForStudent(req.user.id);
  if (!out) bad(404, 'Student profile not found');
  const limit = Math.min(50, Number(req.query.limit ?? 12));
  const eligible = out.results.filter((r) => r.eligible && r.status === 'published');
  const blocked = out.results.filter((r) => !r.eligible).slice(0, 6);

  const skillCount = Object.keys(out.student.skill_levels ?? {}).length;
  const p = out.student;
  const readiness = [
    { key: 'profile', label: 'Academic profile', done: Boolean(p.headline && p.city && p.department_code), hint: 'Set your department, city and headline' },
    { key: 'cv', label: 'CV uploaded', done: (p.cv_text ?? '').length > 200, hint: 'Upload your CV so the extractor has evidence to work with' },
    { key: 'skills', label: 'Skill evidence', done: skillCount >= 6, hint: 'Add at least six skills' },
    { key: 'interests', label: 'Career interests', done: LIST(p.interests).length >= 2, hint: 'List the areas you want to work in' },
    { key: 'logistics', label: 'Availability', done: Boolean(p.availability_hours && p.preferred_format), hint: 'State your weekly availability and preferred work format' },
  ];

  res.json({
    recommendations: eligible.slice(0, limit),
    ineligible: blocked,
    distribution: {
      above_80: eligible.filter((r) => r.score >= 80).length,
      between_60_79: eligible.filter((r) => r.score >= 60 && r.score < 80).length,
      below_60: eligible.filter((r) => r.score < 60).length,
      total: out.results.length,
    },
    readiness,
    profile_complete_pct: Math.round((readiness.filter((r) => r.done).length / readiness.length) * 100),
    skill_count: skillCount,
  });
}));

/** Public student profile used by employers and Career Services. */
router.get('/:id', authRequired, requireRole('employer', 'admin', 'mentor', 'student'), ah(async (req, res) => {
  const id = Number(req.params.id);
  const u = await q1('select * from v_user where id = $1 and role = $2', [id, 'student']);
  if (!u) bad(404, 'Student not found');
  const sp = await q1('select * from student_profile where user_id = $1', [id]);
  const skills = await q(`
    select ps.skill_id, ps.level, ps.source, s.name, sc.name as category
    from profile_skill ps join skill s on s.id = ps.skill_id join skill_category sc on sc.id = s.category_id
    where ps.user_id = $1 order by ps.level desc`, [id]);

  const viewable = req.user.role === 'admin' || req.user.role === 'employer' || req.user.id === id;
  res.json({
    student: { ...u, gpa: u.gpa == null ? null : Number(u.gpa) },
    profile: viewable ? { ...sp, cv_raw_text: undefined, has_cv: Boolean(sp?.cv_raw_text) } : { headline: sp?.headline, city: sp?.city, year_of_study: sp?.year_of_study },
    skills: skills.map((s) => ({ skill_id: num(s.skill_id), name: s.name, category: s.category, level: num(s.level), source: s.source })),
    documents: viewable ? await q('select kind, filename, status, uploaded_at from submission_document where student_id = $1', [id]) : [],
    applications: req.user.role === 'employer'
      ? await q(`select a.id, a.status, a.match_score, i.title, i.company from application a join internship i on i.id=a.internship_id where a.student_id=$1 order by a.submitted_at desc limit 20`, [id])
      : [],
  });
}));

export default router;
