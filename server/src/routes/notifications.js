import { Router } from 'express';
import { q, q1 } from '../db.js';
import { ah, authRequired } from '../http.js';

export const router = Router();
const num = (v) => (v == null ? null : Number(v));

router.get('/', authRequired, ah(async (req, res) => {
  const onlyUnread = req.query.unread === 'true';
  const rows = await q(`
    select * from notification
    where user_id = $1 ${onlyUnread ? 'and not is_read' : ''}
    order by id desc limit 80
  `, [req.user.id]);
  res.json({
    notifications: rows.map((n) => ({ id: num(n.id), kind: n.kind, title: n.title, body: n.body, link: n.link, is_read: n.is_read, created_at: n.created_at })),
    unread: rows.filter((n) => !n.is_read).length,
  });
}));

/** Deadline alerts computed live, so the demo always shows a real upcoming date. */
router.get('/deadlines', authRequired, ah(async (req, res) => {
  const rows = await q(`
    select i.id, i.title, i.company, i.application_deadline,
           (i.application_deadline::date - current_date)::int as days_left,
           (select count(*)::int from application a where a.internship_id = i.id and a.student_id = $1) as applied
    from internship i
    where i.status = 'published' and i.application_deadline is not null
      and i.application_deadline::date >= current_date
      and ($1::bigint is null or exists (
            select 1 from internship_department idt join student_profile sp on sp.department_id = idt.department_id
            where idt.internship_id = i.id and sp.user_id = $1)
         or $1::bigint is null)
    order by i.application_deadline
    limit 10
  `, [req.user.role === 'student' ? req.user.id : null]);

  const milestones = req.user.role === 'student' ? await q(`
    select a.id, i.title, i.company, a.status, p.start_date, p.end_date, p.report_submitted
    from application a
    join internship i on i.id = a.internship_id
    left join placement p on p.application_id = a.id
    where a.student_id = $1 and a.status in ('accepted','completed')
    order by p.start_date nulls last limit 5
  `, [req.user.id]) : [];

  res.json({ deadlines: rows, milestones });
}));

router.patch('/:id/read', authRequired, ah(async (req, res) => {
  await q('update notification set is_read = true where id = $1 and user_id = $2', [Number(req.params.id), req.user.id]);
  res.json({ ok: true });
}));

router.post('/read-all', authRequired, ah(async (req, res) => {
  const n = await q('update notification set is_read = true where user_id = $1 and not is_read returning id', [req.user.id]);
  res.json({ ok: true, marked: n.length });
}));

/** Reference data used by forms across the app. */
router.get('/meta/reference', authRequired, ah(async (req, res) => {
  const [departments, categories, skills] = await Promise.all([
    q('select * from department order by name'),
    q('select * from skill_category order by name'),
    q('select id, name, category_id from skill order by name'),
  ]);
  res.json({
    departments,
    skill_categories: categories,
    skills: skills.map((s) => ({ id: num(s.id), name: s.name, category_id: num(s.category_id) })),
  });
}));

export default router;
