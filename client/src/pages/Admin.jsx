import React, { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, fmtDate, qs } from '../api.js';
import {
  Empty, ErrorNote, Field, Loading, Metric, Note, OkNote, Panel, ScoreBar,
  StatusTag, Tag, useAsync, useFetch,
} from '../components.jsx';

const TABS = [
  ['overview', 'Analytics'],
  ['verifications', 'Employers'],
  ['placements', 'Placements'],
  ['matching', 'Matching Lab'],
  ['users', 'Accounts'],
];

/* ----------------------------------------------------------- overview --- */
function Bars({ rows, label, value, max, tone = 'var(--brand)' }) {
  const peak = max ?? Math.max(1, ...rows.map((r) => Number(r[value] ?? 0)));
  return (
    <div>
      {rows.map((r) => (
        <div className="bar" key={r[label]}>
          <span className="bar__label" title={String(r[label])}>{r[label]}</span>
          <span className="bar__track"><span className="bar__fill" style={{ width: `${(Number(r[value] ?? 0) / peak) * 100}%`, background: tone }} /></span>
          <span className="bar__value">{r[value]}</span>
        </div>
      ))}
    </div>
  );
}

function Overview() {
  const { data, error, loading } = useFetch('/admin/overview');
  if (loading) return <Loading text="Aggregating the register" />;
  if (error) return <ErrorNote error={error} />;
  const s = data.stats;

  return (
    <div className="stack">
      <Panel title="Platform totals">
        <div className="metrics">
          <Metric label="Students" value={s.students} />
          <Metric label="Employers" value={s.employers} />
          <Metric label="Mentors" value={s.mentors} />
          <Metric label="Live postings" value={s.published_internships} />
          <Metric label="Applications" value={s.applications} />
          <Metric label="Accepted" value={s.accepted_applications} tone="ok" />
          <Metric label="Completed" value={s.completed_placements} tone="ok" />
          <Metric label="Avg compatibility" value={s.avg_match_score} />
          <Metric label="Pending reviews" value={s.pending_verifications} tone={s.pending_verifications ? 'warn' : undefined} />
          <Metric label="Connections" value={s.connections} />
        </div>
      </Panel>

      <div className="grid-2">
        <Panel title="Application status mix">
          <Bars rows={(data.status_mix ?? []).map((r) => ({ label: r.status.replace('_', ' '), n: r.n }))} label="label" value="n" />
        </Panel>
        <Panel title="Applications per week">
          <Bars rows={(data.weekly ?? []).map((r) => ({ week: `${r.week} (${r.applications})`, n: r.applications }))} label="week" value="n" />
        </Panel>
      </div>

      <Panel title="Placement coverage by department" pad={false}>
        <div className="scroll-x">
          <table className="table table--num">
            <thead>
              <tr><th>Dept</th><th>Students</th><th>Applications</th><th>Accepted</th><th>Rejected</th><th>Completed</th><th>Placement %</th></tr>
            </thead>
            <tbody>
              {(data.by_department ?? []).map((d) => (
                <tr key={d.code}>
                  <td><b>{d.code}</b> <span className="muted tiny">{d.department}</span></td>
                  <td>{d.eligible_students}</td>
                  <td>{d.applications}</td>
                  <td>{d.accepted}</td>
                  <td>{d.rejected}</td>
                  <td>{d.completed_placements}</td>
                  <td><Tag tone={Number(d.placement_pct) >= 60 ? 'ok' : Number(d.placement_pct) >= 35 ? 'warn' : 'danger'}>{d.placement_pct}%</Tag></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid-2">
        <Panel title="Skill demand on the board" sub="Sum of requirement weights across published postings">
          <Bars rows={(data.skill_demand ?? []).map((r) => ({ label: `${r.name} (${r.category})`, n: r.total_weight }))} label="label" value="n" max={Math.max(1, ...(data.skill_demand ?? []).map((r) => r.total_weight))} />
        </Panel>
        <Panel title="Demand vs supply gap" sub="Postings requiring a skill against students at level 3+">
          <div className="scroll-x">
            <table className="table table--num">
              <thead><tr><th>Skill</th><th>Postings</th><th>Students</th><th>Gap</th></tr></thead>
              <tbody>
                {(data.supply_gap ?? []).map((r) => (
                  <tr key={r.name}>
                    <td>{r.name}</td>
                    <td>{r.demand}</td>
                    <td>{r.supply}</td>
                    <td><Tag tone={r.supply < r.demand ? 'danger' : 'ok'}>{r.supply - r.demand}</Tag></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <Panel title="Employer activity" pad={false}>
        <div className="scroll-x">
          <table className="table table--num">
            <thead><tr><th>Company</th><th>Industry</th><th>Verified</th><th>Postings</th><th>Applications</th><th>Accepted</th><th>Avg match</th></tr></thead>
            <tbody>
              {(data.employer_activity ?? []).map((e) => (
                <tr key={e.user_id}>
                  <td><b>{e.company_name}</b></td>
                  <td className="muted">{e.industry ?? '—'}</td>
                  <td><Tag tone={e.verification_status === 'verified' ? 'ok' : e.verification_status === 'pending' ? 'warn' : 'danger'}>{e.verification_status}</Tag></td>
                  <td>{e.postings}</td>
                  <td>{e.applications}</td>
                  <td>{e.accepted}</td>
                  <td>{e.avg_match}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Recent pipeline events" pad={false}>
        <div className="card__pad">
          {(data.recent_events ?? []).map((e) => (
            <div key={e.id} className="tiny" style={{ paddingBottom: '.45rem', borderBottom: '1px solid var(--line-soft)' }}>
              <b>{e.student_name}</b> — <i>{e.title}</i> at {e.company} moved to <b>{e.to_status?.replace('_', ' ')}</b>
              <div className="muted">{fmtDate(e.created_at)} · by {e.changed_by_name ?? 'system'} · {e.note}</div>
            </div>
          ))}
          {!data.recent_events?.length && <span className="muted tiny">No events yet.</span>}
        </div>
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------ verifications --- */
function Verifications() {
  const { data, error, loading, reload } = useFetch('/admin/verifications');
  const { busy, ok, call } = useAsync();

  const decide = (id, action) => call(async () => { await api.post(`/admin/verifications/${id}`, { action }); reload(); }, `${action === 'approve' ? 'Verified' : 'Declined'}.`);

  if (loading) return <Loading />;
  if (error) return <ErrorNote error={error} />;

  return (
    <Panel title="Employer registrations" sub="Postings stay hidden until a company is verified" right={<OkNote>{ok}</OkNote>}>
      <ul className="list" style={{ margin: 0, padding: 0 }}>
        {(data.employers ?? []).map((e) => (
          <li key={e.user_id} className="row" style={{ listStyle: 'none', gridTemplateColumns: '46px minmax(0,1fr) auto' }}>
            <span className="avatar" style={{ '--color': 'var(--brand-dark)' }}>{e.company_name.slice(0, 2).toUpperCase()}</span>
            <div className="grow">
              <b>{e.company_name}</b>
              <div className="row__sub">{e.industry ?? 'industry not stated'} · {e.city ?? '—'} · contact {e.full_name} ({e.email})</div>
              <div className="muted tiny">
                {e.company_size ? `${e.company_size} staff · ` : ''}registered {fmtDate(e.created_at)} · {e.postings} posting(s)
                {e.verified_by_name ? ` · reviewed by ${e.verified_by_name}` : ''}
              </div>
              {e.about && <div className="tiny muted" style={{ marginTop: '.3rem' }}>{e.about}</div>}
            </div>
            <div className="row__actions">
              <Tag tone={e.verification_status === 'verified' ? 'ok' : e.verification_status === 'pending' ? 'warn' : 'danger'}>{e.verification_status}</Tag>
              {e.verification_status !== 'verified' && <button type="button" className="btn btn--primary btn--sm" onClick={() => decide(e.user_id, 'approve')} disabled={busy}>Verify</button>}
              {e.verification_status !== 'rejected' && <button type="button" className="btn btn--danger btn--sm" onClick={() => decide(e.user_id, 'reject')} disabled={busy}>Decline</button>}
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/* -------------------------------------------------------- placements --- */
function Placements() {
  const [department, setDepartment] = useState('');
  const [status, setStatus] = useState('');
  const path = useMemo(() => `/admin/placements${qs({ department, status })}`, [department, status]);
  const { data, error, loading } = useFetch(path);

  return (
    <Panel
      title="Placement register"
      sub={data ? `${data.totals.placed} records · ${data.totals.in_progress} in progress · ${data.totals.report_missing} missing a report` : ''}
    >
      <div className="flex flex--wrap mb">
        <select value={department} onChange={(e) => setDepartment(e.target.value)} style={{ width: 'auto' }} aria-label="Department filter">
          <option value="">All departments</option>
          {['CS', 'ACCG', 'MKTG', 'MGMT', 'TOUR', 'ECON'].map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 'auto' }} aria-label="Completion filter">
          <option value="">Any status</option>
          <option value="in_progress">In progress</option>
          <option value="completed">Completed</option>
        </select>
      </div>
      <ErrorNote error={error} />
      {loading ? <Loading /> : (
        <>
          <div className="scroll-x">
            <table className="table">
              <thead>
                <tr><th>Student</th><th>Dept</th><th>Posting</th><th>Company</th><th>Batch</th><th>Score</th><th>Supervisor</th><th>Period</th><th>Report</th></tr>
              </thead>
              <tbody>
                {(data?.placements ?? []).map((p) => (
                  <tr key={p.application_id}>
                    <td><Link to={`/people/${p.student_id}`}>{p.student_name}</Link> <span className="muted tiny">{p.program}</span></td>
                    <td>{p.department_code} <span className="muted tiny">Y{p.year_of_study}</span></td>
                    <td><Link to={`/internships/${p.internship_id}`}>{p.title}</Link></td>
                    <td>{p.company}</td>
                    <td className="muted tiny">{p.batch} · {p.duration_days}d</td>
                    <td>{p.match_score == null ? '—' : `${p.match_score}%`}</td>
                    <td className="muted tiny">{p.supervisor_name ?? '—'}</td>
                    <td className="tiny">{fmtDate(p.start_date)} → {p.end_date ? fmtDate(p.end_date) : '—'}</td>
                    <td>
                      {p.report_submitted
                        ? <Tag tone="ok">filed{p.evaluation_score != null ? ` ${p.evaluation_score}/5` : ''}</Tag>
                        : <Tag tone={p.completion_status === 'completed' ? 'danger' : 'warn'}>{p.completion_status?.replace('_', ' ')}</Tag>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data?.placements?.length && <Empty title="No placements match" hint="A placement record is created when an employer accepts an application." />}
          {(data?.documents ?? []).length > 0 && (
            <div className="mt">
              <div className="card__title">Submitted documents</div>
              <div className="chips mt">
                {data.documents.map((d) => (
                  <Tag key={d.kind} tone={d.awaiting_review ? 'warn' : 'ok'}>
                    {d.kind}: {d.n} total, {d.approved} approved, {d.awaiting_review} awaiting review
                  </Tag>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

/* --------------------------------------------------------- matching --- */
function MatchingLab() {
  const { data, error, loading, reload } = useFetch('/admin/eval');
  const [openCase, setOpenCase] = useState(null);
  const { ok, call } = useAsync();

  const relabel = (row, relevant) => call(async () => {
    await api.post('/admin/eval/label', { internship_id: row.internship_id, student_id: row.student_id, relevant, rationale: 'Corrected by Career Services review' });
    reload();
  }, 'Label updated and accuracy re-measured.');

  if (loading) return <Loading text="Re-ranking every labelled case" />;
  if (error) return <ErrorNote error={error} />;
  if (!data.available) return <Note tone="warn">No labelled cases exist yet.</Note>;

  const m = data.metrics;
  return (
    <div className="stack">
      <Panel title="Matching Lab" sub="Objective 7: measure the engine against a hand-labelled set instead of asserting it works">
        <Note tone="info">
          Labels come from an independent rule over the seeded corpus (department eligible plus at least half of the
          weighted required skills present at level 3+), so the engine is not graded by its own scoring function.
          Precision falls and recall rises as k grows - that is the trade-off you report.
        </Note>
        <OkNote>{ok}</OkNote>

        <div className="metrics mt">
          <Metric label="Mean Avg Precision" value={m.mean_avg_precision} tone="ok" />
          <Metric label="Labelled pairs" value={data.labelled_pairs} />
          <Metric label="Relevant pairs" value={data.relevant_pairs} />
          <Metric label="Postings tested" value={data.internships_evaluated} />
          <Metric label="Students judged" value={data.students_judged} />
        </div>

        <div className="divider" />
        <div className="card__title mb">Ranking quality at k</div>
        <div className="scroll-x">
          <table className="table table--num">
            <thead><tr><th>k</th><th>Precision@k</th><th>Recall@k</th></tr></thead>
            <tbody>
              {(m.ks ?? []).map((r) => (
                <tr key={r.k}>
                  <td><b>top {r.k}</b></td>
                  <td>{r.precision}%</td>
                  <td>{r.recall}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="divider" />
        <div className="card__title mb">Component weights used by the scorer</div>
        {Object.entries(data.weights ?? {}).map(([k, v]) => (
          <ScoreBar key={k} label={k} score={v * 100} detail={`Weight ${v}`} />
        ))}

        <div className="divider" />
        <div className="card__title mb">Stored score distribution (applications)</div>
        <Bars
          rows={(data.score_distribution ?? []).map((r) => ({ label: r.band, n: r.n }))}
          label="label"
          value="n"
          max={Math.max(1, ...(data.score_distribution ?? []).map((r) => r.n))}
          tone="linear-gradient(90deg, var(--brand), var(--gold-dark))"
        />
      </Panel>

      <Panel title="Per-posting judgements" sub="Where the engine put each labelled student - correct any row you disagree with">
        {(data.coverage ?? []).map((c) => (
          <div key={c.internship_id} className="mb">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setOpenCase(openCase === c.internship_id ? null : c.internship_id)}
            >
              {openCase === c.internship_id ? '▾' : '▸'} Posting #{c.internship_id} · {c.judged} judged, {c.relevant} relevant
            </button>
            {openCase === c.internship_id && (
              <div className="scroll-x mt">
                <table className="table table--num">
                  <thead><tr><th>Student</th><th>Label</th><th>Engine score</th><th>Engine rank</th><th>Verdict</th><th></th></tr></thead>
                  <tbody>
                    {c.judged_rows.map((r) => {
                      const hit = r.isRelevant && r.engine_rank != null && r.engine_rank <= 5;
                      const miss = r.isRelevant && (r.engine_rank == null || r.engine_rank > 5);
                      return (
                        <tr key={r.student_id}>
                          <td><Link to={`/people/${r.student_id}`}>#{r.student_id}</Link></td>
                          <td><Tag tone={r.isRelevant ? 'ok' : 'line'}>{r.isRelevant ? 'relevant' : 'not relevant'}</Tag></td>
                          <td>{r.engine_score == null ? '—' : `${r.engine_score}%`}</td>
                          <td>{r.engine_rank ?? 'outside list'}</td>
                          <td>{hit ? <Tag tone="ok">found in top 5</Tag> : miss ? <Tag tone="danger">missed</Tag> : <Tag tone="warn">correctly low</Tag>}</td>
                          <td>
                            <div className="btn__row">
                              <button type="button" className="btn btn--soft btn--sm" onClick={() => relabel({ ...r, internship_id: c.internship_id }, !r.isRelevant)}>
                                mark {r.isRelevant ? 'irrelevant' : 'relevant'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------ users --- */
function Accounts() {
  const [role, setRole] = useState('');
  const [term, setTerm] = useState('');
  const [announce, setAnnounce] = useState({ title: '', body: '', audience: 'all', department_code: 'CS' });
  const path = useMemo(() => `/admin/users${qs({ role, q: term })}`, [role, term]);
  const { data, error, loading, reload } = useFetch(path);
  const { busy, ok, call } = useAsync();

  const toggle = (u) => call(async () => { await api.patch(`/admin/users/${u.id}`, { is_active: !u.is_active }); reload(); }, 'Account updated.');

  const send = () => call(async () => {
    const res = await api.post('/admin/announce', announce);
    setAnnounce({ ...announce, title: '', body: '' });
    return res;
  }, 'Announcement delivered.');

  return (
    <div className="cols">
      <Panel title="Accounts" sub={`${data?.users?.length ?? 0} shown`}>
        <div className="flex flex--wrap mb">
          <select value={role} onChange={(e) => setRole(e.target.value)} style={{ width: 'auto' }} aria-label="Role filter">
            <option value="">All roles</option>
            {['student', 'employer', 'mentor', 'admin'].map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <input style={{ maxWidth: 240 }} value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Name or email" aria-label="Search accounts" />
        </div>
        <ErrorNote error={error} />
        {loading ? <Loading /> : (
          <div className="scroll-x">
            <table className="table">
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Dept / company</th><th>Apps</th><th>Best</th><th>Last login</th><th></th></tr></thead>
              <tbody>
                {(data?.users ?? []).map((u) => (
                  <tr key={u.id}>
                    <td><Link to={`/people/${u.id}`}>{u.full_name}</Link></td>
                    <td className="muted tiny">{u.email}</td>
                    <td><Tag tone="line">{u.role}</Tag></td>
                    <td className="tiny">{u.department ?? u.company_name ?? u.headline ?? '—'}</td>
                    <td>{u.applications}</td>
                    <td>{u.best_match == null ? '—' : `${u.best_match}%`}</td>
                    <td className="muted tiny">{u.last_login_at ? fmtDate(u.last_login_at) : 'never'}</td>
                    <td>
                      <div className="flex">
                        <StatusTag status={u.is_active ? 'verified' : 'rejected'} />
                        <button type="button" className={`btn btn--${u.is_active ? 'danger' : 'soft'} btn--sm`} onClick={() => toggle(u)} disabled={busy}>
                          {u.is_active ? 'Deactivate' : 'Restore'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <aside className="stack">
        <Panel title="Announcement">
          <OkNote>{ok}</OkNote>
          <Field label="Audience">
            <select value={announce.audience} onChange={(e) => setAnnounce({ ...announce, audience: e.target.value })}>
              <option value="all">Everyone</option>
              <option value="students">All students</option>
              <option value="employers">All employers</option>
              <option value="mentors">All mentors</option>
              <option value="department">One department (students)</option>
            </select>
          </Field>
          {announce.audience === 'department' && (
            <Field label="Department">
              <select value={announce.department_code} onChange={(e) => setAnnounce({ ...announce, department_code: e.target.value })}>
                {['CS', 'ACCG', 'MKTG', 'MGMT', 'TOUR', 'ECON'].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          )}
          <Field label="Title"><input value={announce.title} onChange={(e) => setAnnounce({ ...announce, title: e.target.value })} placeholder="Orientation session moved" /></Field>
          <Field label="Message"><textarea value={announce.body} onChange={(e) => setAnnounce({ ...announce, body: e.target.value })} /></Field>
          <button type="button" className="btn btn--primary btn--block" onClick={send} disabled={busy || !announce.title || !announce.body}>
            {announce.audience === 'all' ? 'Send to everyone' : 'Send to audience'}
          </button>
          <p className="hint mt">Delivered as an in-app alert in each recipient&apos;s bell. Replaces the noticeboard and Telegram blast.</p>
        </Panel>
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------- page --- */
export default function Admin() {
  const { tab: routeTab } = useParams();
  const tab = TABS.some(([k]) => k === routeTab) ? routeTab : 'overview';

  return (
    <div className="stack">
      <div className="pill-nav">
        {TABS.map(([k, label]) => <Link key={k} to={`/admin/${k}`} className={tab === k ? 'is-active' : ''}>{label}</Link>)}
      </div>
      {tab === 'overview' && <Overview />}
      {tab === 'verifications' && <Verifications />}
      {tab === 'placements' && <Placements />}
      {tab === 'matching' && <MatchingLab />}
      {tab === 'users' && <Accounts />}
    </div>
  );
}
