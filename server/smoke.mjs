const BASE = 'http://localhost:4000/api';
const PW = 'InternIQ2026!';

async function login(email) {
  const r = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PW }) });
  const j = await r.json();
  if (!j.token) throw new Error(`login ${email} -> ${r.status} ${JSON.stringify(j)}`);
  return j.token;
}

async function call(token, method, path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let j = null;
  try { j = await r.json(); } catch { /* non-json */ }
  return { status: r.status, j };
}

const fails = [];
async function check(token, method, path, body, label) {
  const { status, j } = await call(token, method, path, body);
  if (status >= 400) fails.push(`${method} ${path} -> ${status} ${JSON.stringify(j)?.slice(0, 200)}`);
  console.log(`${status < 400 ? 'ok  ' : 'FAIL'} ${String(status)} ${method.padEnd(6)} ${path.padEnd(46)} ${label || ''}`);
  return j;
}

const expect403 = async (token, method, path, label) => {
  const { status } = await call(token, method, path);
  const ok = status === 403;
  if (!ok) fails.push(`guard ${method} ${path} -> ${status} (expected 403)`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${String(status)} ${method.padEnd(6)} ${path.padEnd(46)} ${label}`);
};

const POSTING = {
  title: 'Backend Engineering Intern', description: 'Work on Node.js and PostgreSQL services. Python, Docker and SQL are valued.',
  format: 'hybrid', level: 'beginner', city: 'Addis Ababa', department_codes: ['CS'], min_year: 3, min_gpa: 2.8,
  hours_per_week: 24, duration_days: 40, stipend: 6000, capacity: 3, application_deadline: '2026-12-20', start_date: '2027-01-10',
  responsibilities: ['Build REST APIs', 'Write tests'], requirements: [{ skill: 'Node.js', weight: 4, required: true }, { skill: 'SQL', weight: 3, required: true }],
  status: 'published',
};

const CV = `Yonas Girma\nyonas.girma@student.msu.edu.et\n+251 911 223 344\n\nEDUCATION\nBSc Computer Science, St. Mary's University, expected graduation 2027. GPA 3.71\n\nEXPERIENCE\nData analyst intern, Ethio Telecom. Built Python dashboards with Pandas and SQL, automated ETL, visualised churn with Matplotlib.\nFreelance web developer: React, Node.js, Express, PostgreSQL, Git.\n\nSKILLS\nPython, SQL, JavaScript, React, Pandas, Git, Docker, Machine Learning, Data Analysis\n\nCERTIFICATIONS\nAWS Cloud Practitioner\n`;

const student = await login('yonas.girma@student.msu.edu.et');
const employer = await login('talent@ethiotelecom.et');
const admin = await login('career.services@msu.edu.et');
const mentorAcct = await login('mahlet.yohannes@alumni.msu.edu.et');

console.log('\n== student: discovery + apply ==');
await check(student, 'GET', '/auth/me');
const recs = await check(student, 'GET', '/internships?sort=match');
const scores = (recs?.internships ?? []).map((i) => i.match_score).filter((v) => v != null);
console.log(`   board=${recs?.internships?.length} scored=${scores.length} max=${Math.max(...scores)} min=${Math.min(...scores)}`);
const applyable = recs.internships.filter((i) => i.status === 'published' && !i.already_applied && i.eligible !== false);
const one = applyable[0];
let applied = null;
for (const cand of applyable) {
  const r = await call(student, 'POST', `/internships/${cand.id}/apply`, { note: 'Prototype walkthrough application.' });
  if (r.status === 201) { applied = { id: cand.id, score: r.j.application.match_score }; break; }
  if (r.status !== 409) { fails.push(`apply ${cand.id} -> ${r.status} ${JSON.stringify(r.j)}`); break; }
}
console.log(`   applyable_postings=${applyable.length} submitted=${applied ? `#${applied.id} @ ${applied.score}%` : 'none (all full)'}`);
await check(student, 'GET', `/internships/${one.id}`);
const mine = await check(student, 'GET', '/applications/me');
const app = mine.applications[0];
console.log(`   applications=${mine.applications?.length} first_status=${app?.status} timeline_events=${app?.timeline?.length}`);
await check(student, 'GET', `/applications/${app.id}`);
const acceptedApp = mine.applications.find((a) => a.status === 'accepted');
if (acceptedApp) await check(student, 'POST', `/applications/${acceptedApp.id}/placement`, { supervisor: 'Smoke Test', supervisor_email: 'smoke@example.et', start_date: '2026-11-02', completion_status: 'in_progress', hours_logged: 12 });
await check(student, 'POST', `/applications/${app.id}/withdraw`);
await check(student, 'GET', '/students/me');
await check(student, 'PUT', '/students/me', { headline: 'Year 4 CS student | backend and data intern', interests: ['backend', 'fintech'], target_roles: ['Backend Intern'] });
const preview = await check(student, 'POST', '/students/me/cv/preview', { text: CV });
console.log(`   cv: skills=${preview.skills?.length} unknown=${preview.unknown_candidates?.length} gpa=${preview.entities?.gpa} quality=${preview.quality ?? preview.lexicon_size}`);
await check(student, 'POST', '/students/me/cv/commit', { text: CV, skills: preview.skills.slice(0, 10).map((s) => ({ skill_id: s.skill_id, level: s.level })) });
await check(student, 'POST', '/students/me/skills', { skill: 'TypeScript', level: 3 });
const skillRows = await call(student, 'GET', '/students/me');
const ts = (skillRows.j.skills ?? []).find((s) => /typescript/i.test(s.name));
if (!ts) fails.push('manual skill add did not appear on the profile');
await check(student, 'DELETE', `/students/me/skills/${ts.skill_id}`);
const r2 = await check(student, 'GET', '/students/me/recommendations');
console.log(`   recommendations=${r2?.recommendations?.length} ineligible_but_ranked=${r2?.ineligible?.length} above_80=${r2?.distribution?.above_80}`);

console.log('\n== network + messages (extension surfaces) ==');
const mentors = await check(student, 'GET', '/people?role=mentor');
const m = mentors.people[0];
const person = await check(student, 'GET', `/people/${m.id}`, null, 'was 500: missing v_connection_member');
console.log(`   mentors=${mentors.people?.length} shared_links=${person?.shared_connections} skills=${person?.skills?.length}`);
await check(student, 'GET', `/people/${m.id}/compatibility`);
const conn = await check(student, 'POST', '/connections', { to_user_id: m.id, kind: 'mentorship', note: 'Would you review my CV?' });
if (conn.id) await check(student, 'PATCH', `/connections/${conn.id}`, { status: 'revoked' });
else console.log(`note      (seed already connects these two: status=${conn.status})`);
await check(student, 'GET', '/connections');
const conv = await check(student, 'POST', '/conversations', { with_user_id: m.id, topic: 'Mentorship' });
const cid = conv.conversation.id;
await check(student, 'GET', '/conversations');
await check(student, 'POST', `/conversations/${cid}/messages`, { body: 'Smoke-test message.' });
await check(student, 'GET', `/conversations/${cid}/messages`);

console.log('\n== notifications ==');
await check(student, 'GET', '/notifications');
const dl = await check(student, 'GET', '/notifications/deadlines');
const badDates = (dl.deadlines ?? []).filter((d) => d.days_left < 0);
console.log(`   deadlines=${dl.deadlines?.length} expired=${badDates.length}`);
if (badDates.length) fails.push(`${badDates.length} seeded deadlines are already in the past`);
const meta = await check(student, 'GET', '/notifications/meta/reference');
console.log(`   catalogue=${meta.skills?.length} skills, ${meta.departments?.length} departments`);
await check(student, 'POST', '/notifications/read-all');

console.log('\n== employer: posting + ranking ==');
const own = await check(employer, 'GET', '/internships?status=all');
console.log(`   own postings=${own.total} draft+published included=${own.internships?.some((i) => i.status === 'draft') ?? 'none'}`);
await check(employer, 'GET', '/applications/me', null, 'empty for non-students by design');
const received = await check(employer, 'GET', '/applications/received');
const iid = own.internships[0].id;
const ranked = await check(employer, 'GET', `/internships/${iid}/applicants`);
console.log(`   applicants=${ranked?.applicants?.length} top=${ranked?.applicants?.[0]?.score} lowest=${ranked?.applicants?.at(-1)?.score}`);
const row = ranked.applicants.find((a) => a.has_applied && ['submitted', 'under_review', 'shortlisted'].includes(a.application_status))
  ?? ranked.applicants.find((a) => a.has_applied && a.application_status === 'accepted');
if (row) {
  const next = row.application_status === 'accepted' ? 'shortlisted' : 'accepted';
  await check(employer, 'PATCH', `/applications/${row.application_id}/status`, { status: next, note: `Walkthrough decision: ${next}.` });
}
await check(employer, 'GET', '/people?role=student');
const created = await check(employer, 'POST', '/internships', POSTING);
const newId = created.internship?.id ?? created.id;
await check(employer, 'PUT', `/internships/${newId}`, { ...POSTING, title: 'Backend Engineering Intern (edited)', capacity: 4 });
await check(employer, 'GET', `/internships/${newId}`);
const r3 = await call(employer, 'DELETE', `/internships/${newId}`);
console.log(`${r3.status < 400 ? 'ok  ' : 'note'} ${r3.status} DELETE /internships/${newId} (unpublish/close if deletes are not offered)`);

console.log('\n== admin: Career Services ==');
const ovw = await check(admin, 'GET', '/admin/overview');
console.log(`   stats keys=${Object.keys(ovw?.stats ?? {}).length} departments=${ovw?.by_department?.length ?? ovw?.departments?.length}`);
await check(admin, 'GET', '/admin/verifications');
await check(admin, 'GET', '/admin/placements');
await check(admin, 'GET', '/admin/users');
const evalr = await check(admin, 'GET', '/admin/eval');
const rep = evalr?.report ?? evalr;
console.log(`   MAP=${rep?.metrics?.mean_avg_precision} P@5=${rep?.metrics?.ks?.find((k) => k.k === 5)?.precision} labelled=${rep?.labelled_pairs} postings=${rep?.internships_evaluated}`);
await check(admin, 'POST', '/admin/eval/label', { internship_id: iid, student_id: student ? 2 : 2, relevant: true, rationale: 'Walkthrough relabel' });
await check(admin, 'GET', '/admin/departments');
await check(admin, 'POST', '/admin/announce', { title: 'Prototype walkthrough notice', body: 'Sent by the automated smoke test.', audience: 'all' });

console.log('\n== role guards ==');
await expect403(student, 'GET', '/admin/overview');
await expect403(student, 'GET', '/applications/received');
await expect403(student, 'POST', '/internships', POSTING);
await expect403(mentorAcct ?? student, 'GET', '/admin/users');

console.log(fails.length ? `\n${fails.length} FAILURES:\n${fails.map((f) => ' - ' + f).join('\n')}` : '\nALL CHECKS PASSED');
