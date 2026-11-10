import { Router } from 'express';
import { q, q1 } from '../db.js';
import { ah, bad, authRequired } from '../http.js';

export const router = Router();
const num = (v) => (v == null ? null : Number(v));

/**
 * Messaging - an extension. Section 1.6.1 of the project document places
 * real-time student/employer messaging outside the initial scope, so this
 * module exists for the LinkedIn-style networking half of the prototype.
 */
router.use(authRequired);

const pairKey = (a, b) => [Math.min(a, b), Math.max(a, b)];

router.get('/conversations', ah(async (req, res) => {
  const rows = await q(`
    select c.id,
           case when c.participant_one = $1 then c.participant_two else c.participant_one end as other_id,
           c.topic, c.created_at,
           (select body from message m where m.conversation_id = c.id order by m.id desc limit 1) as last_body,
           (select created_at from message m where m.conversation_id = c.id order by m.id desc limit 1) as last_at,
           (select count(*)::int from message m where m.conversation_id = c.id and m.sender_id <> $1 and m.read_at is null) as unread
    from conversation c
    where c.participant_one = $1 or c.participant_two = $1
    order by last_at desc nulls last, c.id desc
  `, [req.user.id]);

  const others = rows.length ? await q('select * from v_user where id = any($1::bigint[])', [rows.map((r) => num(r.other_id))]) : [];
  const byId = new Map(others.map((o) => [num(o.id), o]));

  res.json({
    conversations: rows.map((r) => {
      const o = byId.get(num(r.other_id)) ?? {};
      return {
        id: num(r.id), topic: r.topic, last_body: r.last_body, last_at: r.last_at, unread: r.unread,
        other: { id: num(o.id), full_name: o.full_name, role: o.role, headline: o.headline, avatar_color: o.avatar_color },
      };
    }),
    total_unread: rows.reduce((n, r) => n + r.unread, 0),
  });
}));

router.post('/conversations', ah(async (req, res) => {
  const to = Number(req.body?.with_user_id ?? req.body?.to);
  if (!to || to === req.user.id) bad(422, 'Choose who to message');
  const target = await q1('select id, full_name, role, is_active from app_user where id = $1', [to]);
  if (!target || !target.is_active) bad(404, 'That account is not available');

  const [a, b] = pairKey(req.user.id, to);
  const found = await q1('select id from conversation where participant_one = $1 and participant_two = $2', [a, b]);
  if (found) return res.json({ conversation: { id: num(found.id) }, existing: true });

  const created = await q1('insert into conversation (participant_one, participant_two, topic) values ($1,$2,$3) returning id',
    [a, b, req.body?.topic ?? 'Internship enquiry']);
  res.status(201).json({ conversation: { id: num(created.id) } });
}));

router.get('/conversations/:id/messages', ah(async (req, res) => {
  const id = Number(req.params.id);
  const c = await q1('select * from conversation where id = $1', [id]);
  if (!c) bad(404, 'Conversation not found');
  if (![num(c.participant_one), num(c.participant_two)].includes(req.user.id)) bad(403, 'You are not a participant');

  const otherId = num(c.participant_one) === req.user.id ? num(c.participant_two) : num(c.participant_one);
  const other = await q1('select * from v_user where id = $1', [otherId]);

  await q('update message set read_at = now() where conversation_id = $1 and sender_id <> $2 and read_at is null', [id, req.user.id]);

  const messages = await q('select * from message where conversation_id = $1 order by id', [id]);
  res.json({
    conversation: { id, topic: c.topic },
    other: { id: num(other.id), full_name: other.full_name, role: other.role, headline: other.headline, avatar_color: other.avatar_color },
    messages: messages.map((m) => ({ id: num(m.id), sender_id: num(m.sender_id), body: m.body, created_at: m.created_at, mine: num(m.sender_id) === req.user.id, read: Boolean(m.read_at) })),
  });
}));

router.post('/conversations/:id/messages', ah(async (req, res) => {
  const id = Number(req.params.id);
  const body = String(req.body?.body ?? '').trim();
  if (!body) bad(422, 'Message cannot be empty');
  if (body.length > 4000) bad(422, 'Message is too long');

  const c = await q1('select * from conversation where id = $1', [id]);
  if (!c) bad(404, 'Conversation not found');
  if (![num(c.participant_one), num(c.participant_two)].includes(req.user.id)) bad(403, 'You are not a participant');

  const created = await q1('insert into message (conversation_id, sender_id, body) values ($1,$2,$3) returning id, created_at', [id, req.user.id, body]);
  const recipient = num(c.participant_one) === req.user.id ? num(c.participant_two) : num(c.participant_one);
  await q("insert into notification (user_id, kind, title, body, link) values ($1,'message','New message',$2,'/messages')",
    [recipient, `${req.user.full_name}: ${body.slice(0, 90)}`]);

  res.status(201).json({ message: { id: num(created.id), body, created_at: created.created_at, mine: true } });
}));

export default router;
