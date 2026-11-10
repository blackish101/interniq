import { Router } from 'express';
import { q, q1 } from '../db.js';
import { ah, bad, authRequired, requireRole } from '../http.js';
import { accuracyReport, invalidateMatching } from '../services/matching.js';

export const router = Router();
router.use(authRequired, requireRole('admin'));

const num = (v) => (v == null ? null : Number(v));

/** GET /api/admin/overview - the Career Services analytics dashboard. */
router.get('/overview', ah(async (req, res) => {
  const stats = await q1('select * from v_platform_stats');
  const byDepartment = await q('select * from v_placement_rate_by_department');
  const statusMix = await q("select status, count(*)::int as n from application group by status order by n desc");
  const employerActivity = await q(`
    select e.user_id, e.company_name, e.industry, e.verification_status, e.hosting_history,
           count(distinct i.id)::int as postings,
           count(a.id)::int as applications,
           count(*) filter (where a.status = 'accepted')::int as accepted,
           round(coalesce(avg(a.match_score), 0), 1) as avg_match
    from employer_profile e
    left join internship i on i.employer_id = e.user_id
    left join application a on a.internship_id = i.id
    group by e.user_id order by applications desc, e.company_name
  `);
  const skillDemand = await q(`
    select s.name, sc.name as category, count(*)::int as postings,
           sum(ir.weight)::int as total_weight,
           count(*) filter (where ir.required)::int as required_in
    from internship_skill ir
    join skill s on s.id = ir.skill_id
    join skill_category sc on sc.id = s.category_id
    join internship i on i.id = ir.internship_id and i.status = 'published'
    group by s.name, sc.name order by total_weight desc limit 14
  `);
  const supplyGap = await q(`
    select s.name,
           count(distinct ir.internship_id)::int as demand,
           count(distinct ps.user_id) filter (where ps.level >= 3)::int as supply
    from internship_skill ir
    join skill s on s.id = ir.skill_id
    left join profile_skill ps on ps.skill_id = ir.skill_id
    left join app_user u on u.id = ps.user_id and u.role = 'student'
    group by s.name having count(distinct ir.internship_id) >= 2
    order by count(distinct ir.internship_id) desc nulls last limit 12
  `);
  const timeline = await q(`
    select to_char(date_trunc('week', submitted_at), 'IYYY-"W"IW') as week, count(*)::int as applications,
           count(*) filter (where status in ('accepted','completed'))::int as accepted
    from application group by 1 order by 1
  `);
  const recent = await q(`
    select e.id, e.to_status, e.note, e.created_at, a.student_id, s.full_name as student_name,
           i.title, i.company, u.full_name as changed_by_name
    from application_event e
    join application a on a.id = e.application_id
    join internship i on i.id = a.internship_id
    join app_user s on s.id = a.student_id
    left join app_user u on u.id = e.changed_by
    order by e.id desc limit 12
  `);

  res.json({ stats, by_department: byDepartment, status_mix: statusMix, employer_activity: employerActivity, skill_demand: skillDemand, supply_gap: supplyGap, weekly: timeline, recent_events: recent });
}));

/** Employer verification queue (section 1.6.1: Career Services verifies employers). */
router.get('/verifications', ah(async (req, res) => {
  const rows = await q(`
    select ep.*, u.email, u.full_name, u.created_at, u.is_active,
           (select full_name from app_user where id = ep.verified_by) as verified_by_name,
           (select count(*)::int from internship i where i.employer_id = ep.user_id) as postings
    from employer_profile ep join app_user u on u.id = ep.user_id
    order by case ep.verification_status when 'pending' then 0 when 'verified' then 1 else 2 end, ep.created_at desc
  `);
  res.json({ employers: rows.map((r) => ({ ...r, user_id: num(r.user_id) })) });
}));

router.post('/verifications/:userId', ah(async (req, res) => {
  const userId = Number(req.params.userId);
  const action = req.body?.action;
  if (!['approve', 'reject'].includes(action)) bad(422, "action must be 'approve' or 'reject'");

  const emp = await q1('select * from employer_profile where user_id = $1', [userId]);
  if (!emp) bad(404, 'Employer not found');

  const status = action === 'approve' ? 'verified' : 'rejected';
  await q('update employer_profile set verification_status = $2, verified_by = $3, verified_at = now() where user_id = $1', [userId, status, req.user.id]);
  if (action === 'reject') await q('update internship set status = $2 where employer_id = $1 and status = $3', [userId, 'closed', 'published']);

  await q('insert into notification (user_id, kind, title, body, link) values ($1,$2,$3,$4,$5)', [
    userId, 'system',
    action === 'approve' ? 'Your company is verified' : 'Registration not approved',
    action === 'approve'
      ? 'Career Services approved your registration. You can now publish internship postings to St. Mary\u2019s students.'
      : `Career Services declined the registration for ${emp.company_name}. Contact the office for details.`,
    '/employer/postings',
  ]);
  invalidateMatching();
  res.json({ ok: true, verification_status: status });
}));

/** Placement tracking register - the real-time visibility the paper process lacks. */
router.get('/placements', ah(async (req, res) => {
  const { department, status } = req.query;
  const rows = await q(`
    select a.id as application_id, a.status, a.match_score, a.submitted_at,
           s.id as student_id, s.full_name as student_name, d.code as department_code, d.name as department,
           sp.year_of_study, sp.program, sp.gpa,
           i.id as internship_id, i.title, i.company, i.batch, i.duration_days,
           p.start_date, p.end_date, p.supervisor_name, p.completion_status, p.report_submitted, p.evaluation_score
    from application a
    join internship i on i.id = a.internship_id
    join app_user s on s.id = a.student_id
    join student_profile sp on sp.user_id = s.id
    join department d on d.id = sp.department_id
    left join placement p on p.application_id = a.id
    where a.status in ('accepted','completed')
      and ($1::text is null or d.code = $1)
      and ($2::text is null or coalesce(p.completion_status,'in_progress') = $2)
    order by p.start_date desc nulls last, a.submitted_at desc
    limit 200
  `, [department ?? null, status ?? null]);

  const docs = await q(`
    select d.kind, count(*)::int as n,
           count(*) filter (where d.status='approved')::int as approved,
           count(*) filter (where d.status='submitted')::int as awaiting_review
    from submission_document d group by d.kind order by n desc
  `);

  res.json({
    placements: rows.map((r) => ({ ...r, match_score: r.match_score == null ? null : Number(r.match_score), gpa: r.gpa == null ? null : Number(r.gpa) })),
    documents: docs,
    totals: {
      placed: rows.length,
      report_missing: rows.filter((r) => r.completion_status === 'completed' && !r.report_submitted).length,
      in_progress: rows.filter((r) => r.completion_status === 'in_progress').length,
    },
  });
}));

/** Student register for the office. */
router.get('/users', ah(async (req, res) => {
  const { role, q: term } = req.query;
  const rows = await q(`
    select v.*, u.is_active, u.last_login_at,
           (select count(*)::int from application a where a.student_id = u.id) as applications,
           (select round(max(a.match_score),1) from application a where a.student_id = u.id) as best_match
    from v_user v join app_user u on u.id = v.id
    where ($1::text is null or v.role = $1)
      and ($2::text is null or lower(v.full_name) like '%' || lower($2) || '%' or lower(v.email) like '%' || lower($2) || '%')
    order by v.role, v.full_name
    limit 200
  `, [role ?? null, term ?? null]);
  res.json({ users: rows.map((r) => ({ ...r, id: num(r.id), best_match: r.best_match == null ? null : Number(r.best_match), is_active: r.is_active })) });
}));

router.patch('/users/:id', ah(async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) bad(409, 'You cannot deactivate your own administrator account');
  const row = await q1('select id, role, is_active from app_user where id = $1', [id]);
  if (!row) bad(404, 'User not found');
  const active = req.body?.is_active !== false;
  await q('update app_user set is_active = $2 where id = $1', [id, active]);
  await q('insert into notification (user_id, kind, title, body, link) values ($1,$2,$3,$4,$5)',
    [id, 'system', active ? 'Account reactivated' : 'Account deactivated',
      active ? 'Career Services restored access to your InternIQ account.' : 'Career Services has suspended this account. Contact the office to restore access.', '/account']);
  invalidateMatching();
  res.json({ ok: true, is_active: active });
}));

/** Targeted and broadcast announcements. */
router.post('/announce', ah(async (req, res) => {
  const { title, body, audience = 'all', department_code } = req.body ?? {};
  if (!title || !body) bad(422, 'Title and message are required');

  let where = 'is_active';
  const params = [];
  if (audience === 'students') where += " and role='student'";
  else if (audience === 'employers') where += " and role='employer'";
  else if (audience === 'mentors') where += " and role='mentor'";
  else if (audience === 'department') {
    where += " and role='student'";
    params.push(department_code ?? 'CS');
    where += ` and id in (select user_id from student_profile where department_id = (select id from department where code = $${params.length}))`;
  }

  const targets = await q(`select id from app_user where ${where} order by id`, params);
  for (const t of targets) {
    await q("insert into notification (user_id, kind, title, body, link) values ($1,'system',$2,$3,'/notifications')",
      [num(t.id), title, body]);
  }
  res.json({ ok: true, recipients: targets.length });
}));

/** Objective 7: measured accuracy of the matching engine. */
router.get('/eval', ah(async (req, res) => {
  const report = await accuracyReport();
  const distribution = await q(`
    select case when match_score >= 90 then '90-100' when match_score >= 80 then '80-89'
                when match_score >= 70 then '70-79' when match_score >= 60 then '60-69'
                when match_score >= 40 then '40-59' else 'below 40' end as band,
           count(*)::int as n
    from application where match_score is not null group by 1 order by 1 desc
  `);
  res.json({ ...report, score_distribution: distribution });
}));

/** Re-measure after tuning: label a pair by hand from the UI. */
router.post('/eval/label', ah(async (req, res) => {
  const { internship_id, student_id, relevant, rationale } = req.body ?? {};
  if (!internship_id || !student_id || typeof relevant !== 'boolean') bad(422, 'internship_id, student_id and boolean relevant are required');
  await q(`insert into eval_case (internship_id, student_id, relevant, rationale, labelled_by)
           values ($1,$2,$3,$4,$5)
           on conflict (internship_id, student_id) do update set relevant = excluded.relevant, rationale = excluded.rationale, labelled_by = excluded.labelled_by`,
    [Number(internship_id), Number(student_id), relevant, rationale ?? 'Ad-hoc review in the Matching Lab', req.user.id]);
  res.json({ ok: true });
}));

router.get('/departments', ah(async (req, res) => {
  res.json({ departments: await q('select * from department order by name') });
}));

export default router;
