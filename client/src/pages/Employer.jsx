import React, { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, fmtDate, qs } from '../api.js';
import { useAuth } from '../auth.jsx';
import {
  Avatar, Breakdown, Empty, ErrorNote, Field, Loading, Metric, Modal, Note,
  Panel, ScoreBar, ScoreDial, StatusTag, Tag, useAsync, useFetch,
} from '../components.jsx';

const BLANK = {
  title: '', description: '', responsibilities: '', location: '', city: 'Addis Ababa',
  format: 'onsite', level: 'beginner', duration_days: 40, hours_per_week: 30, stipend: '',
  batch: 'Summer 2026', capacity: 1, min_year: 3, min_gpa: '', application_deadline: '', start_date: '',
  department_codes: [], requirements: [],
};

function PostingForm({ initial, onSaved, onCancel }) {
  const src = initial ?? BLANK;
  const [f, setF] = useState({
    ...BLANK,
    ...src,
    responsibilities: Array.isArray(src.responsibilities) ? src.responsibilities.join('\n') : (src.responsibilities ?? ''),
    department_codes: src.department_codes ?? [],
    requirements: src.requirements ?? [],
  });
  const ref = useFetch('/notifications/meta/reference');
  const { busy, error, call } = useAsync();
  const [skillQuery, setSkillQuery] = useState('');

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const toggleDept = (code) => setF({ ...f, department_codes: f.department_codes.includes(code) ? f.department_codes.filter((c) => c !== code) : [...f.department_codes, code] });

  const suggestions = useMemo(() => {
    const all = ref.data?.skills ?? [];
    if (!skillQuery.trim()) return [];
    const t = skillQuery.toLowerCase();
    return all.filter((s) => s.name.toLowerCase().includes(t) && !f.requirements.some((r) => r.skill === s.name)).slice(0, 8);
  }, [ref.data, skillQuery, f.requirements]);

  const addSkill = (name) => { setF({ ...f, requirements: [...f.requirements, { skill: name, weight: 3, required: true }] }); setSkillQuery(''); };

  const save = (publish) => call(async () => {
    const body = {
      ...f,
      responsibilities: f.responsibilities.split('\n').map((s) => s.trim()).filter(Boolean),
      min_gpa: f.min_gpa === '' ? null : Number(f.min_gpa),
      publish,
    };
    if (f.id) await api.put(`/internships/${f.id}`, { ...body, status: f.status });
    else await api.post('/internships', body);
    onSaved();
  }, 'Saved.');

  if (ref.loading && !ref.data) return <Loading text="Loading reference data" />;

  return (
    <Panel title={f.id ? `Edit ${f.title}` : 'New internship posting'} sub="Requirements are what the matching engine scores students against">
      <ErrorNote error={error} />
      <div className="grid-2">
        <Field label="Title"><input value={f.title} onChange={set('title')} placeholder="Summer Software Engineering Intern" /></Field>
        <Field label="Batch"><input value={f.batch} onChange={set('batch')} /></Field>
        <Field label="City"><input value={f.city} onChange={set('city')} /></Field>
        <Field label="Location / site"><input value={f.location} onChange={set('location')} placeholder="Bole, Addis Ababa" /></Field>
        <Field label="Format"><select value={f.format} onChange={set('format')}>{['onsite', 'hybrid', 'remote'].map((x) => <option key={x} value={x}>{x}</option>)}</select></Field>
        <Field label="Level"><select value={f.level} onChange={set('level')}>{['beginner', 'intermediate', 'advanced'].map((x) => <option key={x} value={x}>{x}</option>)}</select></Field>
        <Field label="Duration (days)" hint="The university requirement is 40 days."><input type="number" value={f.duration_days} onChange={set('duration_days')} /></Field>
        <Field label="Hours per week"><input type="number" value={f.hours_per_week} onChange={set('hours_per_week')} /></Field>
        <Field label="Places available"><input type="number" min="1" value={f.capacity} onChange={set('capacity')} /></Field>
        <Field label="Stipend" hint="Leave blank if unpaid."><input value={f.stipend} onChange={set('stipend')} placeholder="ETB 6,000 / month" /></Field>
        <Field label="Minimum year of study"><select value={f.min_year} onChange={set('min_year')}>{[2, 3, 4, 5].map((y) => <option key={y} value={y}>Year {y}</option>)}</select></Field>
        <Field label="Minimum GPA" hint="Blank = no threshold."><input type="number" step="0.05" value={f.min_gpa} onChange={set('min_gpa')} /></Field>
        <Field label="Application deadline"><input type="date" value={f.application_deadline} onChange={set('application_deadline')} /></Field>
        <Field label="Start date"><input type="date" value={f.start_date} onChange={set('start_date')} /></Field>
      </div>

      <Field label="Description"><textarea value={f.description} onChange={set('description')} placeholder="What the intern will work on, the team, and what they should learn." /></Field>
      <Field label="Responsibilities" hint="One per line."><textarea value={f.responsibilities} onChange={set('responsibilities')} /></Field>

      <Field label="Eligible departments">
        <div className="chips">
          {(ref.data?.departments ?? []).map((d) => (
            <Tag key={d.code} tone={f.department_codes.includes(d.code) ? 'brand' : 'line'} onClick={() => toggleDept(d.code)} title="Toggle eligibility">
              {d.code} — {d.name}
            </Tag>
          ))}
        </div>
      </Field>

      <Field label="Required skills" hint="Weight 5 = critical, 1 = nice to have. Marked required if students must have evidence.">
        <div className="chips mb">
          {f.requirements.map((r) => (
            <span className="tag tag--brand" key={r.skill}>
              {r.skill}
              <select
                value={r.weight}
                onChange={(e) => setF({ ...f, requirements: f.requirements.map((x) => x.skill === r.skill ? { ...x, weight: Number(e.target.value) } : x) })}
                style={{ width: 'auto', padding: '0 .2rem', marginLeft: '.3rem' }}
                aria-label={`Weight for ${r.skill}`}
              >
                {[1, 2, 3, 4, 5].map((w) => <option key={w} value={w}>w{w}</option>)}
              </select>
              <label className="check" style={{ marginLeft: '.3rem' }}>
                <input
                  type="checkbox"
                  checked={r.required}
                  onChange={(e) => setF({ ...f, requirements: f.requirements.map((x) => x.skill === r.skill ? { ...x, required: e.target.checked } : x) })}
                />
                must
              </label>
              <span className="tag__remove" onClick={() => setF({ ...f, requirements: f.requirements.filter((x) => x.skill !== r.skill) })}>×</span>
            </span>
          ))}
        </div>
        <input
          value={skillQuery}
          onChange={(e) => setSkillQuery(e.target.value)}
          placeholder="Search the skill catalogue (e.g. Python, IFRS, Revenue management)"
          aria-label="Add required skill"
        />
        {suggestions.length > 0 && (
          <div className="chips mt">
            {suggestions.map((s) => <Tag key={s.id} tone="line" onClick={() => addSkill(s.name)}>+ {s.name}</Tag>)}
          </div>
        )}
      </Field>

      <div className="btn__row mt">
        <button type="button" className="btn btn--primary" onClick={() => save(true)} disabled={busy || !f.title || !f.description || !f.department_codes.length}>
          {f.id ? 'Save changes' : 'Publish to students'}
        </button>
        {!f.id && <button type="button" className="btn btn--soft" onClick={() => save(false)} disabled={busy || !f.title}>Save as draft</button>}
        <button type="button" className="btn btn--ghost" onClick={onCancel}>Cancel</button>
      </div>
      {!f.department_codes.length && <p className="hint mt">Select at least one eligible department — the matcher flags students outside this list.</p>}
    </Panel>
  );
}

function Applicants({ postId }) {
  const { data, error, loading, reload } = useFetch(postId ? `/internships/${postId}/applicants` : null, { guard: Boolean(postId) });
  const { busy, call } = useAsync();
  const [expanded, setExpanded] = useState(null);

  const move = (a, status) => call(async () => { await api.patch(`/applications/${a.application_id}/status`, { status }); reload(); });

  if (!postId) return <Panel title="Applicants"><Note tone="info">Choose a posting to see its ranked queue.</Note></Panel>;
  if (loading) return <Loading text="Ranking students" />;
  if (error) return <Panel title="Applicants"><ErrorNote error={error} /></Panel>;

  const rows = data.applicants ?? [];
  return (
    <Panel
      title={`Ranked applicants — ${data.posting.title}`}
      sub={`${data.applied_count} applied · ${rows.filter((r) => r.eligible).length} of ${rows.length} eligible students scored`}
      right={<Link className="btn btn--ghost btn--sm" to={`/internships/${postId}`}>View posting</Link>}
    >
      <div className="metrics mb">
        <Metric label="Applied" value={data.summary.applied} />
        <Metric label="Scoring ≥70%" value={data.summary.above_70} tone="ok" />
        <Metric label="Accepted" value={data.summary.accepted} />
        <Metric label="Places" value={data.posting.capacity} />
      </div>

      <Note tone="info">
        Everyone is scored, not only those who applied — so you can spot a strong student who never saw the posting
        and invite them through a message.
      </Note>

      <ul className="list" style={{ margin: '1rem 0 0', padding: 0 }}>
        {rows.slice(0, 25).map((a) => (
          <li key={a.student_id} className="row" style={{ listStyle: 'none', gridTemplateColumns: '34px 46px minmax(0,1fr) auto' }}>
            <b className="muted">{a.rank}</b>
            <Avatar name={a.full_name} color={a.avatar_color} />
            <div className="grow">
              <div className="flex flex--wrap">
                <Link to={`/people/${a.student_id}`} className="row__title">{a.full_name}</Link>
                <span className="muted tiny">{a.department_code} · Year {a.year_of_study}{a.gpa ? ` · GPA ${a.gpa}` : ''} · {a.city}</span>
                {a.has_applied ? <StatusTag status={a.application_status} /> : <Tag tone="line">not applied</Tag>}
                {!a.eligible && <Tag tone="danger">eligibility rule</Tag>}
              </div>
              <div className="muted tiny">{a.headline}</div>
              <div className="chips" style={{ marginTop: '.3rem' }}>
                {a.top_skills.slice(0, 8).map((s) => <Tag key={s.skill} tone="brand">{s.skill} L{s.level}</Tag>)}
              </div>
              {a.gaps.length > 0 && <div className="tiny" style={{ color: 'var(--warn)', marginTop: '.25rem' }}>Gaps: {a.gaps.slice(0, 2).join('; ')}</div>}
              {expanded === a.student_id && (
                <div className="mt" style={{ background: '#fbfcfd', border: '1px solid var(--line)', borderRadius: 8, padding: '.8rem' }}>
                  <Breakdown breakdown={a.breakdown} reasons={a.reasons} gaps={a.gaps} flags={a.flags} />
                </div>
              )}
            </div>
            <div className="row__actions">
              <ScoreDial value={a.score} />
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setExpanded(expanded === a.student_id ? null : a.student_id)}>
                {expanded === a.student_id ? 'Hide' : 'Why?'}
              </button>
              {a.has_applied && a.application_status !== 'accepted' && (
                <button type="button" className="btn btn--primary btn--sm" onClick={() => move(a, 'accepted')} disabled={busy}>Accept</button>
              )}
              {a.has_applied && !['rejected', 'withdrawn'].includes(a.application_status) && (
                <button type="button" className="btn btn--danger btn--sm" onClick={() => move(a, 'rejected')} disabled={busy}>Reject</button>
              )}
              {!a.has_applied && <Link className="btn btn--soft btn--sm" to={`/messages?to=${a.student_id}`}>Invite</Link>}
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export default function Employer() {
  const { user } = useAuth();
  const { tab: routeTab } = useParams();
  const [params] = useSearchParams();
  const tab = routeTab === 'applicants' ? 'applicants' : 'postings';
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);

  const board = useFetch('/internships?status=all');

  const mine = useMemo(() => (board.data?.internships ?? []).filter((i) => i.employer_id === user?.id || user?.role === 'admin'), [board.data, user]);

  const close = () => { setEditing(null); setCreating(false); board.reload(); };

  const statusOf = (i) => (i.status === 'published' ? 'ok' : i.status === 'draft' ? 'warn' : 'danger');
  const setStatus = (id, status) => api.put(`/internships/${id}`, { status }).then(board.reload);

  if (user?.role === 'admin') {
    return <EmployerAsAdmin />;
  }

  if (user?.verification_status !== 'verified') {
    return (
      <div className="stack">
        <Panel title={`${user.company_name ?? 'Your company'} — registration`}>
          <Note tone={user.verification_status === 'pending' ? 'warn' : 'err'}>
            {user.verification_status === 'pending'
              ? 'Career Services is reviewing your registration. You can prepare a posting; it publishes only after verification.'
              : 'Career Services declined this registration. Contact the office to resolve it.'}
          </Note>
          <div className="btn__row mt">
            <button type="button" className="btn btn--soft" onClick={() => setCreating(true)}>Draft a posting</button>
          </div>
        </Panel>
        {creating && <PostingForm initial={BLANK} onSaved={close} onCancel={() => setCreating(false)} />}
      </div>
    );
  }

  return (
    <div className="cols">
      <div className="stack">
        <div className="pill-nav">
          <Link to="/employer/postings" className={tab === 'postings' ? 'is-active' : ''}>My postings</Link>
          <Link to="/employer/applicants" className={tab === 'applicants' ? 'is-active' : ''}>Applicants</Link>
          <button type="button" onClick={() => setCreating(true)}>+ New posting</button>
        </div>

        {creating || editing ? (
          <PostingForm initial={editing ?? BLANK} onSaved={close} onCancel={close} />
        ) : tab === 'applicants' ? (
          <Applicants postId={params.get('post') ? Number(params.get('post')) : mine[0]?.id} />
        ) : (
          <Panel title="My postings" sub={board.loading ? 'Loading' : `${mine.length} total`}>
            <ErrorNote error={board.error} />
            {mine.length === 0 && !board.loading ? (
              <Empty title="No postings yet" hint="Publish one so students can find you on the board." action={<button type="button" className="btn btn--primary btn--sm mt" onClick={() => setCreating(true)}>New posting</button>} />
            ) : (
              <ul className="list" style={{ margin: 0, padding: 0 }}>
                {mine.map((i) => (
                  <li key={i.id} className="row" style={{ listStyle: 'none', gridTemplateColumns: '46px minmax(0,1fr) auto' }}>
                    <Avatar name={i.title} color="var(--brand-dark)" />
                    <div className="grow">
                      <Link to={`/internships/${i.id}`} className="row__title">{i.title}</Link>
                      <div className="row__sub">
                        {i.applications ?? 0} applications · {i.accepted ?? 0} accepted · {i.capacity} place{i.capacity > 1 ? 's' : ''}
                        · deadline {fmtDate(i.application_deadline)}
                      </div>
                      <div className="chips" style={{ marginTop: '.35rem' }}>
                        {(i.department_codes ?? []).map((d) => <Tag key={d}>{d}</Tag>)}
                        <Tag tone="line">{(i.requirements ?? []).length} weighted skills</Tag>
                      </div>
                    </div>
                    <div className="row__actions">
                      <Tag tone={statusOf(i)}>{i.status}</Tag>
                      <Link className="btn btn--soft btn--sm" to={`/employer/applicants?post=${i.id}`}>Applicants</Link>
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setEditing(i); setCreating(false); }}>Edit</button>
                      {i.status === 'published'
                        ? <button type="button" className="btn btn--danger btn--sm" onClick={() => setStatus(i.id, 'closed')}>Close</button>
                        : i.status === 'draft' && <button type="button" className="btn btn--primary btn--sm" onClick={() => setStatus(i.id, 'published')}>Publish</button>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}
      </div>

      <aside className="stack">
        <Panel title="Funnel">
          {board.loading ? <Loading /> : (
            <div className="metrics">
              <Metric label="Postings live" value={mine.filter((i) => i.status === 'published').length} />
              <Metric label="Applications" value={mine.reduce((n, i) => n + (i.applications ?? 0), 0)} />
              <Metric label="Accepted" value={mine.reduce((n, i) => n + (i.accepted ?? 0), 0)} tone="ok" />
            </div>
          )}
          <p className="hint mt">
            Total applications {mine.reduce((n, i) => n + (i.applications ?? 0), 0)} across {mine.length} postings.
            Students see your verification badge, so keeping records current matters.
          </p>
        </Panel>

        <Panel title="Scoring students">
          <p className="hint">
            Each applicant carries a compatibility score made of six weighted components - skill evidence from their
            CV, semantic similarity to your text, department fit, academics, logistics and stated interests. Open
            “Why?” beside a name to see the split.
          </p>
          {mine[0]?.requirements?.length > 0 && (
            <div className="mt">
              <div className="card__title">Weights you set for {mine[0].title}</div>
              {mine[0].requirements.slice(0, 6).map((r) => (
                <ScoreBar key={r.skill} label={r.skill} score={(r.weight / 5) * 100} detail={`Requirement weight ${r.weight} of 5`} />
              ))}
            </div>
          )}
        </Panel>
      </aside>
    </div>
  );
}

function EmployerAsAdmin() {
  const { data, loading, error } = useFetch('/internships?status=all');
  if (loading) return <Loading text="Loading postings" />;
  return (
    <Panel title="All postings" sub="Career Services oversight">
      <ErrorNote error={error} />
      <ul className="list" style={{ margin: 0, padding: 0 }}>
        {(data?.internships ?? []).map((i) => (
          <li key={i.id} className="row row--flat" style={{ listStyle: 'none' }}>
            <div>
              <Link to={`/internships/${i.id}`} className="row__title" style={{ display: 'block' }}>{i.title}</Link>
              <div className="muted tiny">{i.company} · {i.status} · {i.applications ?? 0} applications</div>
            </div>
            <StatusTag status={i.status} />
          </li>
        ))}
      </ul>
    </Panel>
  );
}
