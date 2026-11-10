import { Router } from 'express';
import { q, q1 } from '../db.js';
import { ah, bad, authRequired, requireRole } from '../http.js';

export const router = Router();
const num = (v) => (v == null ? null : Number(v));
const LIST = (v) => (Array.isArray(v) ? v : String(v ?? '').split('|').filter(Boolean));

/**
 * People directory (LinkedIn-style extension of the documented scope).
 * Students can search mentors and alumni; employers and Career Services can
 * look students up.
 */
router.get('/people', authRequired, ah(async (req, res) => {
  const { role = 'mentor', q: term, department, skill, seniority } = req.query;
  const rows = await q(`
    select v.*, us.skill_names, us.skill_levels, us.categories,
           (select count(*)::int from connection c where c.status='accepted' and (c.requester_id=v.id or c.addressee_id=v.id)) as network_size,
           case when exists (select 1 from connection c where c.status='accepted' and ((c.requester_id=v.id and c.addressee_id=$2) or (c.addressee_id=v.id and c.requester_id=$2))) then 'connected'
                when exists (select 1 from connection c where c.status='pending' and ((c.requester_id=v.id and c.addressee_id=$2) or (c.addressee_id=v.id and c.requester_id=$2))) then 'pending'
                else 'none' end as relation
    from v_user v
    left join v_user_skills us on us.user_id = v.id
    where v.role = $1 and v.is_active
      and ($3::text is null or lower(v.full_name) like '%'||lower($3)||'%' or lower(coalesce(v.headline,'')) like '%'||lower($3)||'%' or lower(coalesce(v.company_name,'')) like '%'||lower($3)||'%')
      and ($4::text is null or v.department = $4)
      and ($5::text is null or $5 = any(coalesce(us.skill_names,'{}')))
      and ($6::text is null or v.seniority = $6)
    order by network_size desc, v.full_name
    limit 60
  `, [role, req.user.id, term ?? null, department ?? null, skill ?? null, seniority ?? null]);

  res.json({
    people: rows.map((r) => ({
      id: num(r.id), role: r.role, full_name: r.full_name, avatar_color: r.avatar_color, headline: r.headline,
      city: r.city, department: r.department, department_code: r.department_code, company: r.company ?? r.company_name,
      seniority: r.seniority, years_experience: r.years_experience == null ? null : Number(r.years_experience),
      year_of_study: r.year_of_study, gpa: r.gpa == null ? null : Number(r.gpa),
      focus_areas: LIST(r.focus_areas), interests: LIST(r.interests), alma_mater: r.alma_mater,
      skills: (r.skill_names ?? []).slice(0, 14), categories: r.categories ?? [], network_size: r.network_size, relation: r.relation,
      open_to: LIST(r.open_to), availability_hours: r.availability_hours == null ? null : Number(r.availability_hours),
    })),
  });
}));

router.get('/people/:id', authRequired, ah(async (req, res) => {
  const id = Number(req.params.id);
  const p = await q1('select v.*, us.skill_levels, us.skill_names from v_user v left join v_user_skills us on us.user_id=v.id where v.id = $1', [id]);
  if (!p) bad(404, 'Person not found');

  const skills = await q(`
    select ps.skill_id, ps.level, ps.source, s.name, sc.name as category
    from profile_skill ps join skill s on s.id = ps.skill_id join skill_category sc on sc.id = s.category_id
    where ps.user_id = $1 order by ps.level desc`, [id]);

  const shared = await q(`
    select other_id as id from v_connection_member where user_id = $1
    intersect select other_id as id from v_connection_member where user_id = $2
  `, [req.user.id, id]);

  const relation = await q1(`
    select id, status, kind from connection
    where (requester_id = least($1::bigint,$2::bigint) and addressee_id = greatest($1::bigint,$2::bigint))
  `, [req.user.id, id]);

  res.json({
    person: {
      id: num(p.id), role: p.role, full_name: p.full_name, avatar_color: p.avatar_color, headline: p.headline, city: p.city,
      department: p.department, year_of_study: p.year_of_study, gpa: p.gpa == null ? null : Number(p.gpa),
      company: p.company ?? p.company_name, seniority: p.seniority, years_experience: p.years_experience == null ? null : Number(p.years_experience),
      alma_mater: p.alma_mater, focus_areas: LIST(p.focus_areas), interests: LIST(p.interests), open_to: LIST(p.open_to),
      availability_hours: p.availability_hours == null ? null : Number(p.availability_hours), bio: p.bio,
    },
    skills: skills.map((s) => ({ name: s.name, category: s.category, level: num(s.level), source: s.source })),
    shared_connections: shared.length,
    relation: relation ? { id: num(relation.id), status: relation.status, kind: relation.kind } : null,
  });
}));

/**
 * Mentor compatibility - deliberately a simpler formula than the internship
 * engine: skill overlap, topical affinity, then availability. Kept separate so
 * the documented scoring model is not diluted by the extension feature.
 */
router.get('/people/:id/compatibility', authRequired, requireRole('student'), ah(async (req, res) => {
  const id = Number(req.params.id);
  const me = await q1('select * from v_user where id = $1', [req.user.id]);
  const them = await q1('select * from v_user where id = $1', [id]);
  if (!them) bad(404, 'Person not found');

  const mine = new Set(LIST(me.skill_names));
  const theirs = new Set(LIST(them.skill_names));
  const overlap = [...mine].filter((s) => theirs.has(s));
  const unionSize = new Set([...mine, ...theirs]).size || 1;

  const myTopics = new Set([...LIST(me.interests), ...LIST(me.target_roles)].map((t) => String(t).toLowerCase()));
  const theirTopics = new Set([...LIST(them.focus_areas), ...LIST(them.open_to)].map((t) => String(t).toLowerCase()));
  const topicHits = [...myTopics].filter((t) => [...theirTopics].some((x) => x.includes(t) || t.includes(x)));

  const sameAlma = me.institution || them.alma_mater ? 1 : 0.5;
  const skillScore = Math.min(1, overlap.length / Math.max(3, mine.size * 0.6));
  const topicScore = myTopics.size ? Math.min(1, topicHits.length / 2) : 0.5;
  const availability = them.availability_hours ? Math.min(1, Number(them.availability_hours) / 4) : 0.5;

  const score = Math.round((skillScore * 0.5 + topicScore * 0.3 + availability * 0.2) * 100);
  res.json({
    mentor_id: id,
    score,
    components: [
      { label: 'Shared skills', score: Math.round(skillScore * 100), detail: `${overlap.length} of ${mine.size} of your skills are also theirs: ${overlap.slice(0, 6).join(', ') || 'none'}` },
      { label: 'Topical fit', score: Math.round(topicScore * 100), detail: topicHits.length ? `They advise on ${topicHits.join(', ')}` : 'No stated topic overlap' },
      { label: 'Capacity to meet', score: Math.round(availability * 100), detail: them.availability_hours ? `${them.availability_hours} hours per week offered` : 'Availability not stated' },
      { label: 'Institution', score: Math.round(sameAlma * 100), detail: them.alma_mater ? `${them.alma_mater} alumni` : 'Alma mater not recorded' },
    ],
    shared_skills: overlap,
  });
}));

router.get('/connections', authRequired, ah(async (req, res) => {
  const rows = await q(`
    select c.*, case when c.requester_id = $1 then c.addressee_id else c.requester_id end as other_id
    from connection c where c.requester_id = $1 or c.addressee_id = $1
    order by case c.status when 'pending' then 0 else 1 end, c.created_at desc
  `, [req.user.id]);

  const ids = rows.map((r) => num(r.other_id));
  const people = ids.length ? await q(`select * from v_user where id = any($1::bigint[])`, [ids]) : [];
  const byId = new Map(people.map((p) => [num(p.id), p]));

  res.json({
    connections: rows.map((r) => {
      const p = byId.get(num(r.other_id)) ?? {};
      return {
        id: num(r.id), status: r.status, kind: r.kind, note: r.note, created_at: r.created_at,
        direction: num(r.requester_id) === req.user.id ? 'outgoing' : 'incoming',
        person: { id: num(p.id), full_name: p.full_name, role: p.role, headline: p.headline, avatar_color: p.avatar_color, department: p.department, company: p.company ?? p.company_name },
      };
    }),
    counts: rows.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {}),
  });
}));

router.post('/connections', authRequired, ah(async (req, res) => {
  const to = Number(req.body?.to_user_id ?? req.body?.to);
  const kind = req.body?.kind === 'mentorship' ? 'mentorship' : 'network';
  if (!to || to === req.user.id) bad(422, 'Choose a person to connect with');

  const target = await q1('select id, full_name, role, is_active from app_user where id = $1', [to]);
  if (!target || !target.is_active) bad(404, 'That account is not available');

  const a = Math.min(req.user.id, to);
  const b = Math.max(req.user.id, to);
  const existing = await q1('select * from connection where requester_id = $1 and addressee_id = $2', [a, b]);
  if (existing && existing.status === 'accepted') return res.json({ ok: true, status: 'accepted', already: true });

  if (existing) {
    await q("update connection set status='pending', kind=$3, note=$4, updated_at=now() where id=$1", [num(existing.id), kind, req.body?.note ?? null]);
  } else {
    await q('insert into connection (requester_id, addressee_id, kind, status, note) values ($1,$2,$3,$4,$5)',
      [a, b, kind, 'pending', req.body?.note ?? null]);
  }

  await q('insert into notification (user_id, kind, title, body, link) values ($1,$2,$3,$4,$5)',
    [to, 'connection', kind === 'mentorship' ? 'Mentorship request' : 'New connection request',
      `${req.user.full_name} sent you a ${kind === 'mentorship' ? 'mentorship' : 'network'} request.`, '/network']);

  const c = await q1('select id from connection where requester_id=$1 and addressee_id=$2', [a, b]);
  res.status(201).json({ ok: true, id: num(c.id), status: 'pending' });
}));

router.patch('/connections/:id', authRequired, ah(async (req, res) => {
  const id = Number(req.params.id);
  const c = await q1('select * from connection where id = $1', [id]);
  if (!c) bad(404, 'Request not found');
  if (num(c.addressee_id) !== req.user.id && num(c.requester_id) !== req.user.id) bad(403, 'Not your request');

  const status = req.body?.status;
  if (!['accepted', 'declined', 'revoked'].includes(status)) bad(422, 'status must be accepted, declined or revoked');
  if (status === 'revoked' && num(c.requester_id) !== req.user.id && num(c.addressee_id) !== req.user.id) bad(403, 'Only a participant can revoke');

  await q('update connection set status = $2, updated_at = now() where id = $1', [id, status]);
  const other = num(c.requester_id) === req.user.id ? num(c.addressee_id) : num(c.requester_id);
  if (other !== req.user.id) {
    await q('insert into notification (user_id, kind, title, body, link) values ($1,$2,$3,$4,$5)',
      [other, 'connection', status === 'accepted' ? 'Request accepted' : 'Request declined',
        `${req.user.full_name} ${status === 'accepted' ? 'accepted your' : 'declined your'} ${c.kind} request.`, '/network']);
  }
  res.json({ ok: true, status });
}));

export default router;
