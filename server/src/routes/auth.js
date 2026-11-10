import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { q, q1 } from '../db.js';
import { ah, bad, signToken, authRequired } from '../http.js';
import { DEMO_PASSWORD } from '../../db/seed.js';

export const router = Router();
export default router;

const publicUser = (u) => ({
  id: Number(u.id),
  email: u.email,
  role: u.role,
  full_name: u.full_name,
  avatar_color: u.avatar_color,
  headline: u.headline,
  department: u.department,
  department_code: u.department_code,
  year_of_study: u.year_of_study,
  company_name: u.company_name,
  verification_status: u.verification_status,
  city: u.city,
  seniority: u.seniority,
});

router.post('/login', ah(async (req, res) => {
  const email = String(req.body.email ?? '').trim().toLowerCase();
  const password = String(req.body.password ?? '');
  if (!email || !password) bad(422, 'Email and password are required');

  const row = await q1('select * from app_user where lower(email) = lower($1)', [email]);
  if (!row || !bcrypt.compareSync(password, row.password_hash)) bad(401, 'Email or password is incorrect');
  if (!row.is_active) bad(403, 'This account has been deactivated by Career Services');

  const user = await q1('select * from v_user where id = $1', [row.id]);
  await q('update app_user set last_login_at = now() where id = $1', [row.id]);
  res.json({ token: signToken(row), user: publicUser(user) });
}));

router.get('/me', authRequired, (req, res) => res.json({ user: publicUser(req.user) }));

/** Curated logins so the prototype can be demonstrated without typing passwords. */
router.get('/demo-accounts', ah(async (req, res) => {
  const rows = await q(`
    select u.id, u.email, u.role, u.full_name, v.headline, v.department, v.company_name, v.verification_status, v.year_of_study, v.seniority
    from app_user u join v_user v on v.id = u.id
    where u.is_active
    order by case u.role when 'student' then 1 when 'employer' then 2 when 'admin' then 3 else 4 end, u.id
  `);
  const taken = new Set();
  const chosen = [];
  const pick = (role, where) => {
    const found = rows.find((r) => r.role === role && !taken.has(r.id) && (!where || where(r)));
    if (found) { taken.add(found.id); chosen.push(found); }
  };
  for (const role of ['student', 'student', 'student', 'employer', 'employer', 'admin', 'mentor']) {
    pick(role, role === 'student' ? (r) => r.department === 'Computer Science' : null);
  }
  for (let i = 0; i < 2; i += 1) pick('student', (r) => r.department !== 'Computer Science');

  res.json({
    password: DEMO_PASSWORD,
    accounts: chosen.map((c) => ({
      email: c.email,
      role: c.role,
      name: c.full_name,
      subtitle: c.company_name ?? c.headline ?? c.department,
      note: c.role === 'student'
        ? `Year ${c.year_of_study} ${c.department}`
        : c.role === 'employer'
          ? `${c.company_name} - ${c.verification_status}`
          : c.role === 'admin' ? 'Career Services administrator' : c.seniority,
    })),
  });
}));

router.post('/register', ah(async (req, res) => {
  const { email, password, full_name: name, role } = req.body;
  if (!email || !password || !name) bad(422, 'Email, password and full name are required');
  if (String(password).length < 8) bad(422, 'Password must be at least 8 characters');
  if (!['student', 'employer', 'mentor'].includes(role)) bad(422, 'Choose a student, employer or mentor account');
  if (/@(student\.)?msu\.edu\.et$/i.test(email) && role !== 'student' && role !== 'mentor') bad(422, 'University addresses must register as student or mentor');

  const clash = await q1('select id from app_user where lower(email) = lower($1)', [email]);
  if (clash) bad(409, 'An account with that email already exists');

  const colors = ['#b41118', '#8d0d13', '#32373c', '#6b5200', '#a1502a'];
  const created = await q1(
    'insert into app_user (email, password_hash, role, full_name, avatar_color) values ($1,$2,$3,$4,$5) returning id',
    [String(email).trim().toLowerCase(), bcrypt.hashSync(password, 8), role, name.trim(), colors[Math.floor(Math.random() * colors.length)]]
  );
  const id = Number(created.id);

  if (role === 'student') {
    const dept = await q1('select id from department where code = $1', [req.body.department_code ?? 'CS']);
    await q(
      `insert into student_profile (user_id, student_id, department_id, program, year_of_study, graduation_year, preferred_format, availability_hours, city)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, `SMU${String(24100 + id).padStart(6, '0')}`, dept?.id ?? 1, req.body.program ?? 'regular',
        Number(req.body.year_of_study ?? 3), Number(req.body.graduation_year ?? 2027),
        req.body.preferred_format ?? 'hybrid', Number(req.body.availability_hours ?? 30), req.body.city ?? 'Addis Ababa']
    );
  } else if (role === 'employer') {
    await q(
      `insert into employer_profile (user_id, company_name, industry, company_size, contact_person, city, about, verification_status, hosting_history)
       values ($1,$2,$3,$4,$5,$6,$7,'pending',0)`,
      [id, req.body.company_name ?? name, req.body.industry ?? null, req.body.company_size ?? '11-50', name, req.body.city ?? 'Addis Ababa', req.body.about ?? null]
    );
    await q(
      "insert into notification (user_id, kind, title, body, link) select $1,'system','Registration sent to Career Services','Your company registration is pending verification. You can prepare an internship posting while you wait.','/account'",
      [id]
    );
    const admins = await q("select id from app_user where role='admin'");
    const label = req.body.company_name ?? req.body.company ?? name;
    for (const admin of admins) {
      await q(
        "insert into notification (user_id, kind, title, body, link) values ($1,'system','Employer registration awaiting verification',$2,'/admin/verifications')",
        [Number(admin.id), `${label} registered and needs verification.`]
      );
    }
  } else {
    await q(
      'insert into mentor_profile (user_id, headline, company, seniority, years_experience, city, availability_hours, open_to) values ($1,$2,$3,$4,$5,$6,$7,$8)',
      [id, req.body.headline ?? null, req.body.company ?? null, req.body.seniority ?? 'mid', Number(req.body.years_experience ?? 5),
        req.body.city ?? 'Addis Ababa', Number(req.body.availability_hours ?? 3), 'mentorship']
    );
  }

  const user = await q1('select * from v_user where id = $1', [id]);
  res.status(201).json({ token: signToken({ id, role, full_name: name }), user: publicUser(user) });
}));

router.post('/password', authRequired, ah(async (req, res) => {
  const { current, next } = req.body;
  const row = await q1('select password_hash from app_user where id = $1', [req.user.id]);
  if (!bcrypt.compareSync(String(current ?? ''), row.password_hash)) bad(401, 'Current password is incorrect');
  if (!next || String(next).length < 8) bad(422, 'New password must be at least 8 characters');
  await q('update app_user set password_hash = $2 where id = $1', [req.user.id, bcrypt.hashSync(String(next), 8)]);
  res.json({ ok: true });
}));
