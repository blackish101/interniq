import { Router } from 'express';
import { q, q1, tx } from '../db.js';
import { ah, bad, authRequired, requireRole } from '../http.js';
import { explainMatch, recommendForStudent } from '../services/matching.js';

export const router = Router();
const num = (v) => (v == null ? null : Number(v));

const PIPELINE = ['submitted', 'under_review', 'shortlisted', 'accepted', 'rejected', 'withdrawn', 'completed'];

async function notify(userId, kind, title, body, link) {
  await q('insert into notification (user_id, kind, title, body, link) values ($1,$2,$3,$4,$5)', [userId, kind, title, body, link]);
}

/** POST /api/internships/:id/apply - student submits with the live score attached. */
router.post('/internships/:id/apply', authRequired, requireRole('student'), ah(async (req, res) => {
  const internshipId = Number(req.params.id);
  const post = await q1('select id, title, company, status, employer_id, capacity from internship where id = $1', [internshipId]);
  if (!post) bad(404, 'Internship not found');
  if (post.status !== 'published') bad(409, 'This posting is not accepting applications');

  const skills = await q1('select skill_levels from v_user_skills where user_id = $1', [req.user.id]);
  if (!skills || !Object.keys(skills.skill_levels ?? {}).length) {
    bad(422, 'Upload your CV or add skills to your profile before applying - the matcher needs evidence to score you.');
  }

  const dup = await q1('select id, status, cover_note from application where internship_id = $1 and student_id = $2', [internshipId, req.user.id]);
  if (dup && dup.status !== 'withdrawn') return res.status(200).json({ application: { id: num(dup.id), status: dup.status }, already_applied: true });

  const match = await explainMatch(req.user.id, internshipId);
  if (!match) bad(422, 'No match could be computed for this posting');

  const filled = await q1('select count(*)::int as n from application where internship_id = $1 and status = $2', [internshipId, 'accepted']);
  if (num(post.capacity) <= num(filled.n)) bad(409, 'All places on this internship have been accepted');

  if (!match.eligible) bad(403, `Your department is not on this posting's eligibility list (${match.gaps.join('; ')})`, { flags: match.flags });

  const appId = await tx(async () => {
    const row = req.user.role === 'student'
      ? await q1('select student_id from student_profile where user_id = $1', [req.user.id])
      : null;
    const ins = dup
      ? await q1(
        `update application set status='submitted', match_score=$3, match_breakdown=$4, cover_note=$5, submitted_at=now(), decided_at=null, updated_at=now()
         where id=$1 returning id`, [num(dup.id), req.user.id, match.score, JSON.stringify({ breakdown: match.breakdown, reasons: match.reasons, gaps: match.gaps, flags: match.flags }), req.body.note ?? dup.cover_note ?? null])
      : await q1(
        `insert into application (internship_id, student_id, status, match_score, match_breakdown, cover_note, source)
         values ($1,$2,'submitted',$3,$4,$5,'student_apply') returning id`,
        [internshipId, req.user.id, match.score, JSON.stringify({ breakdown: match.breakdown, reasons: match.reasons, gaps: match.gaps, flags: match.flags }), req.body.note ?? null]);
    await q('insert into application_event (application_id, from_status, to_status, changed_by, note) values ($1,$2,$3,$4,$5)',
      [num(ins.id), dup ? 'withdrawn' : null, 'submitted', req.user.id, 'Submitted by student']);
    await notify(num(post.employer_id), 'status', 'New application received',
      `${req.user.full_name} applied to ${post.title} with a ${match.score}% compatibility score.`, '/employer/applicants');
    await notify(req.user.id, 'status', 'Application submitted',
      `Your application to ${post.title} at ${post.company} was recorded. Compatibility ${match.score}%.`, '/applications');
    return num(ins.id);
  });

  res.status(201).json({ application: { id: appId, status: 'submitted', match_score: match.score, breakdown: match.breakdown, reasons: match.reasons, gaps: match.gaps } });
}));

/** GET /api/applications/me - student pipeline view with event history. */
router.get('/applications/me', authRequired, ah(async (req, res) => {
  const rows = await q(`
    select a.*, i.title, i.company, i.format, i.city, i.status as internship_status, i.application_deadline, i.employer_id,
           p.completion_status, p.start_date, p.end_date, p.report_submitted, p.evaluation_score, p.supervisor_name
    from application a
    join internship i on i.id = a.internship_id
    left join placement p on p.application_id = a.id
    where a.student_id = $1
    order by a.submitted_at desc
  `, [req.user.id]);

  const events = await q(`
    select e.* from application_event e
    join application a on a.id = e.application_id
    where a.student_id = $1 order by e.application_id, e.id
  `, [req.user.id]);

  const grouped = new Map();
  for (const e of events) {
    const id = num(e.application_id);
    if (!grouped.has(id)) grouped.set(id, []);
    grouped.get(id).push({ id: num(e.id), from: e.from_status, to: e.to_status, note: e.note, created_at: e.created_at });
  }

  res.json({
    applications: rows.map((r) => ({
      id: num(r.id),
      internship_id: num(r.internship_id),
      title: r.title,
      company: r.company,
      format: r.format,
      city: r.city,
      status: r.status,
      match_score: r.match_score == null ? null : Number(r.match_score),
      breakdown: r.match_breakdown ?? null,
      cover_note: r.cover_note,
      submitted_at: r.submitted_at,
      decided_at: r.decided_at,
      deadline: r.application_deadline,
      employer_id: num(r.employer_id),
      placement: r.completion_status ? { completion_status: r.completion_status, start_date: r.start_date, end_date: r.end_date, report_submitted: r.report_submitted, evaluation_score: r.evaluation_score == null ? null : Number(r.evaluation_score), supervisor: r.supervisor_name } : null,
      timeline: grouped.get(num(r.id)) ?? [],
    })),
    counts: PIPELINE.reduce((acc, s) => ({ ...acc, [s]: rows.filter((r) => r.status === s).length }), {}),
  });
}));

/** GET /api/applications/received - employer's applicant queue across their postings. */
router.get('/applications/received', authRequired, requireRole('employer', 'admin'), ah(async (req, res) => {
  const scope = req.user.role === 'employer' ? 'and i.employer_id = $1' : '';
  const params = req.user.role === 'employer' ? [req.user.id] : [];
  const rows = await q(`
    select a.id, a.status, a.match_score, a.submitted_at, a.cover_note,
           i.id as internship_id, i.title as internship_title, i.company,
           s.id as student_id, s.full_name as student_name, s.avatar_color,
           d.code as department_code, d.name as department, sp.year_of_study, sp.gpa, sp.city,
           us.skill_names
    from application a
    join internship i on i.id = a.internship_id
    join app_user s on s.id = a.student_id
    join student_profile sp on sp.user_id = s.id
    join department d on d.id = sp.department_id
    left join v_user_skills us on us.user_id = s.id
    where true ${scope}
    order by a.match_score desc nulls last, a.submitted_at desc
    limit ${Math.min(200, Number(req.query.limit ?? 100))}
  `, params);

  res.json({
    applications: rows.map((r) => ({
      application_id: num(r.id), status: r.status, match_score: r.match_score == null ? null : Number(r.match_score),
      submitted_at: r.submitted_at, cover_note: r.cover_note,
      internship: { id: num(r.internship_id), title: r.internship_title, company: r.company },
      student: { id: num(r.student_id), name: r.student_name, color: r.avatar_color, department: r.department, department_code: r.department_code, year: r.year_of_study, gpa: r.gpa == null ? null : Number(r.gpa), city: r.city, skills: (r.skill_names ?? []).slice(0, 10) },
    })),
  });
}));

router.get('/applications/:id', authRequired, ah(async (req, res) => {
  const id = Number(req.params.id);
  const a = await q1('select * from application where id = $1', [id]);
  if (!a) bad(404, 'Application not found');
  const post = await q1('select * from internship where id = $1', [num(a.internship_id)]);
  const isOwner = req.user.role === 'admin' || num(post.employer_id) === req.user.id;
  if (a.student_id !== req.user.id && !isOwner) bad(403, 'You can only view your own applications');

  const events = await q('select * from application_event where application_id = $1 order by id', [id]);
  const student = await q1('select * from v_user where id = $1', [num(a.student_id)]);
  res.json({
    application: { ...a, match_score: a.match_score == null ? null : Number(a.match_score) },
    internship: post,
    student,
    timeline: events.map((e) => ({ id: num(e.id), from: e.from_status, to: e.to_status, note: e.note, created_at: e.created_at, by: num(e.changed_by) })),
  });
}));

/** PATCH /api/applications/:id/status - employer or Career Services moves the pipeline. */
router.patch('/applications/:id/status', authRequired, requireRole('employer', 'admin'), ah(async (req, res) => {
  const id = Number(req.params.id);
  const { status, note } = req.body ?? {};
  if (!PIPELINE.includes(status)) bad(422, `status must be one of ${PIPELINE.join(', ')}`);

  const a = await q1('select a.*, i.employer_id, i.title from application a join internship i on i.id = a.internship_id where a.id = $1', [id]);
  if (!a) bad(404, 'Application not found');
  if (req.user.role === 'employer' && num(a.employer_id) !== req.user.id) bad(403, 'Not your posting');
  if (a.status === status) bad(409, `Application is already ${status}`);

  await tx(async () => {
    await q('update application set status = $2, decided_at = case when $2 in (\'accepted\',\'rejected\') then now() else decided_at end, updated_at = now() where id = $1', [id, status]);
    await q('insert into application_event (application_id, from_status, to_status, changed_by, note) values ($1,$2,$3,$4,$5)',
      [id, a.status, status, req.user.id, note ?? `${req.user.role} moved this application to ${status}`]);

    if (status === 'accepted') {
      await q(`insert into placement (application_id, start_date, completion_status)
               values ($1, coalesce((select start_date from internship where id = $2), date '2026-06-15'), 'in_progress')
               on conflict (application_id) do nothing`, [id, num(a.internship_id)]);
      await q("update employer_profile set hosting_history = hosting_history + 1 where user_id = $1", [num(a.employer_id)]);
    }
    await notify(num(a.student_id), 'status',
      status === 'accepted' ? 'Internship offer - congratulations' : `Application ${status.replace('_', ' ')}`,
      `${a.title}: your application is now marked ${status.replace('_', ' ')}.`, '/applications');
    if (req.user.role === 'admin') {
      await notify(num(a.employer_id), 'status', 'Career Services updated an application', `${req.user.full_name} set ${a.title} application #${id} to ${status}.`, '/employer/applicants');
    }
  });

  res.json({ application: { id, status } });
}));

/** Student pulls themselves out of the running. */
router.post('/applications/:id/withdraw', authRequired, requireRole('student'), ah(async (req, res) => {
  const id = Number(req.params.id);
  const a = await q1('select a.*, i.employer_id, i.title from application a join internship i on i.id = a.internship_id where a.id = $1 and a.student_id = $2', [id, req.user.id]);
  if (!a) bad(404, 'Application not found');
  if (a.status === 'withdrawn') bad(409, 'Already withdrawn');
  if (a.status === 'completed') bad(409, 'A completed placement cannot be withdrawn');

  await q("update application set status='withdrawn', updated_at=now() where id=$1", [id]);
  await q('insert into application_event (application_id, from_status, to_status, changed_by, note) values ($1,$2,$3,$4,$5)',
    [id, a.status, 'withdrawn', req.user.id, req.body?.note ?? 'Withdrawn by student']);
  await notify(num(a.employer_id), 'status', 'Application withdrawn', `${req.user.full_name} withdrew from ${a.title}.`, '/employer/applicants');
  res.json({ ok: true, status: 'withdrawn' });
}));

/** Placement paperwork + completion reporting for Career Services visibility. */
router.post('/applications/:id/placement', authRequired, ah(async (req, res) => {
  const id = Number(req.params.id);
  const a = await q1('select * from application where id = $1 and student_id = $2', [id, req.user.id]);
  if (!a) bad(404, 'Application not found for this student');
  if (!['accepted', 'completed'].includes(a.status)) bad(409, 'Only accepted placements can be reported');

  const b = req.body ?? {};
  await q(`insert into placement (application_id, start_date, end_date, supervisor_name, supervisor_email, evaluation_score, completion_status, report_submitted)
           values ($1,$2,$3,$4,$5,$6,$7,$8)
           on conflict (application_id) do update set
             start_date = coalesce(excluded.start_date, placement.start_date),
             end_date = coalesce(excluded.end_date, placement.end_date),
             supervisor_name = coalesce(excluded.supervisor_name, placement.supervisor_name),
             supervisor_email = coalesce(excluded.supervisor_email, placement.supervisor_email),
             completion_status = excluded.completion_status,
             report_submitted = excluded.report_submitted`,
    [id, b.start_date ?? null, b.end_date ?? null, b.supervisor_name ?? null, b.supervisor_email ?? null,
      b.evaluation_score ?? null, b.completion_status ?? 'in_progress', Boolean(b.report_submitted)]);
  if (b.completion_status === 'completed') {
    await q("update application set status='completed', updated_at=now() where id=$1", [id]);
    await q('insert into application_event (application_id, from_status, to_status, changed_by, note) values ($1,$2,$3,$4,$5)',
      [id, a.status, 'completed', req.user.id, 'Internship completed and report submitted']);
  }
  res.json({ ok: true });
}));

export default router;
