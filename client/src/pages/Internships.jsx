import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { qs, daysLeft, fmtDate } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Empty, ErrorNote, Loading, Metric, Panel, ScoreDial, SkillTags, Tag, useFetch } from '../components.jsx';

const FORMATS = [['onsite', 'On-site'], ['hybrid', 'Hybrid'], ['remote', 'Remote']];
const LEVELS = [['beginner', 'Beginner'], ['intermediate', 'Intermediate'], ['advanced', 'Advanced']];

function Row({ i, role }) {
  const left = daysLeft(i.application_deadline);
  return (
    <li className="row" style={{ listStyle: 'none' }}>
      <Link to={`/internships/${i.id}`} className="avatar" style={{ '--color': 'var(--brand)', textDecoration: 'none' }} aria-label={i.company}>
        {i.company.slice(0, 2).toUpperCase()}
      </Link>
      <div className="grow">
        <Link to={`/internships/${i.id}`} className="row__title" style={{ display: 'block' }}>{i.title}</Link>
        <div className="row__sub">
          {i.company} · {i.city} · {i.format}
          {i.stipend ? ` · ${i.stipend}` : ''}
        </div>
        <div className="chips" style={{ marginTop: '.4rem' }}>
          {(i.departments ?? []).slice(0, 4).map((d) => <Tag key={d} tone="brand">{d}</Tag>)}
          <Tag>{i.duration_days ?? 40}-day placement</Tag>
          {i.min_gpa ? <Tag>min GPA {i.min_gpa}</Tag> : null}
          {i.status === 'draft' ? <Tag tone="warn">draft</Tag> : null}
          {i.status === 'closed' ? <Tag tone="danger">closed</Tag> : null}
        </div>
        {i.top_reason && <div className="tiny" style={{ marginTop: '.35rem', color: 'var(--success)' }}>{i.top_reason}</div>}
        {role === 'student' && i.eligible === false && (
          <div className="tiny" style={{ marginTop: '.35rem', color: 'var(--warn)' }}>
            Department or requirement rule blocks this posting — see why inside.
          </div>
        )}
      </div>
      <div className="row__actions">
        {role === 'student' && i.match_score != null ? <ScoreDial value={i.match_score} label={`${i.match_score}% compatible`} /> : null}
        {role !== 'student' && i.applications != null ? <Tag tone="line">{i.applications} applied</Tag> : null}
        {i.already_applied ? <Tag tone="ok">applied</Tag> : null}
        {left != null && i.status === 'published' && (
          <span className="tiny nowrap" style={{ color: left <= 7 ? 'var(--danger)' : 'var(--ink-3)' }}>
            {left < 0 ? 'deadline passed' : `${left}d left`}
          </span>
        )}
      </div>
    </li>
  );
}

export default function Internships() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [more, setMore] = useState(false);

  const filters = {
    q: params.get('q') ?? '',
    department: params.get('department') ?? '',
    format: params.get('format') ?? '',
    level: params.get('level') ?? '',
    city: params.get('city') ?? '',
    sort: params.get('sort') ?? (user?.role === 'student' ? 'match' : 'deadline'),
    status: params.get('status') ?? '',
  };

  const set = (k, v) => {
    const next = { ...filters, [k]: v };
    const search = {};
    for (const [key, value] of Object.entries(next)) if (value) search[key] = value;
    setParams(search, { replace: true });
  };

  const path = useMemo(() => `/internships${qs({ ...filters, type: user?.role === 'employer' ? undefined : undefined })}`, [filters, user?.role]);
  const { data, error, loading } = useFetch(path);

  const rows = data?.internships ?? [];
  const closeSoon = rows.filter((r) => { const d = daysLeft(r.application_deadline); return d != null && d >= 0 && d <= 14; }).length;

  return (
    <div className="cols">
      <div className="stack">
        <Panel
          title={user?.role === 'employer' ? 'Internship postings' : 'Internship opportunities'}
          sub={data ? `${rows.length} posting${rows.length === 1 ? '' : 's'} · ${data.total} total` : 'Search the board'}
          right={
            <div className="btn__row">
              {user?.role === 'student' && (
                <select value={filters.sort} onChange={(e) => set('sort', e.target.value)} style={{ width: 'auto' }} aria-label="Sort">
                  <option value="match">Best match first</option>
                  <option value="deadline">Deadline first</option>
                  <option value="company">Company A–Z</option>
                </select>
              )}
              {user?.role === 'employer' && <Link className="btn btn--primary btn--sm" to="/employer/postings">Manage postings</Link>}
            </div>
          }
        >
          <div className="flex flex--wrap mb">
            <input
              style={{ maxWidth: 320 }}
              value={filters.q}
              onChange={(e) => set('q', e.target.value)}
              placeholder="Search title, company or description"
              aria-label="Search internships"
            />
            <select value={filters.department} onChange={(e) => set('department', e.target.value)} style={{ width: 'auto' }} aria-label="Department">
              <option value="">Any department</option>
              {(data?.facets?.departments ?? []).map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={filters.format} onChange={(e) => set('format', e.target.value)} style={{ width: 'auto' }} aria-label="Format">
              <option value="">Any format</option>
              {FORMATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select value={filters.level} onChange={(e) => set('level', e.target.value)} style={{ width: 'auto' }} aria-label="Level">
              <option value="">Any level</option>
              {LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setMore((m) => !m)}>
              {more ? 'Fewer filters' : 'More filters'}
            </button>
            {(filters.q || filters.department || filters.format || filters.level || filters.city) && (
              <button type="button" className="btn btn--soft btn--sm" onClick={() => setParams({}, { replace: true })}>Clear</button>
            )}
          </div>

          {more && (
            <div className="flex flex--wrap mb">
              <input style={{ maxWidth: 200 }} value={filters.city} onChange={(e) => set('city', e.target.value)} placeholder="City" aria-label="City" />
              {(user?.role === 'employer' || user?.role === 'admin') && (
                <select value={filters.status} onChange={(e) => set('status', e.target.value)} style={{ width: 'auto' }} aria-label="Status">
                  <option value="">Published only</option>
                  <option value="all">Include drafts and closed</option>
                </select>
              )}
            </div>
          )}

          <ErrorNote error={error} />
          {loading && !data ? <Loading text="Loading the board" /> : null}

          {data && (
            rows.length === 0
              ? <Empty title="No postings match those filters" hint="Try clearing the department or format filter." />
              : <ul className="list" style={{ margin: 0, padding: 0 }}>
                {rows.map((i) => <Row key={i.id} i={i} role={user?.role} />)}
              </ul>
          )}
        </Panel>
      </div>

      <aside className="stack">
        {user?.role === 'student' && (
          <Panel title="Your matching run" sub={data ? `scored against ${data.scored_against} live postings` : ''}>
            <div className="metrics">
              <Metric label="On board" value={rows.length} />
              <Metric label="Strong fit" value={rows.filter((r) => (r.match_score ?? 0) >= 80).length} tone="ok" />
              <Metric label="Closing ≤14d" value={closeSoon} tone={closeSoon ? 'warn' : undefined} />
            </div>
            <p className="hint mt">
              Scores come from the matching engine: CV skill evidence, semantic similarity to the posting text,
              department rules, academics and logistics. Open a posting to see the component breakdown.
            </p>
          </Panel>
        )}

        <Panel title="Closing soonest">
          {loading && !data ? <Loading /> : (
            <ul className="list" style={{ margin: 0, padding: 0 }}>
              {rows
                .filter((r) => r.status !== 'closed' && r.application_deadline)
                .slice()
                .sort((a, b) => String(a.application_deadline).localeCompare(String(b.application_deadline)))
                .slice(0, 5)
                .map((r) => {
                  const d = daysLeft(r.application_deadline);
                  return (
                    <li className="row row--flat" key={r.id} style={{ listStyle: 'none' }}>
                      <div>
                        <Link to={`/internships/${r.id}`} className="row__title" style={{ display: 'block' }}>{r.title}</Link>
                        <div className="muted tiny">{r.company} · {fmtDate(r.application_deadline)}</div>
                      </div>
                      <Tag tone={d <= 7 ? 'danger' : d <= 21 ? 'warn' : 'line'}>{d < 0 ? 'closed' : `${d}d`}</Tag>
                    </li>
                  );
                })}
            </ul>
          )}
        </Panel>

        <Panel title="Most requested skills" pad={false}>
          <div className="card__pad">
            <SkillTags
              skills={Object.entries(
                rows.reduce((acc, r) => {
                  for (const req of r.requirements ?? []) if (req.required) acc[req.skill] = (acc[req.skill] ?? 0) + 1;
                  return acc;
                }, {})
              ).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([name]) => name)}
              max={14}
            />
            <p className="hint mt">Required by at least one posting currently on the board.</p>
          </div>
        </Panel>
      </aside>
    </div>
  );
}
