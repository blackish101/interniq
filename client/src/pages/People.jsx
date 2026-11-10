import React, { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, qs } from '../api.js';
import { useAuth } from '../auth.jsx';
import {
  Avatar, Empty, ErrorNote, Loading, Note, Panel, SkillTags, Tag, useAsync, useFetch,
} from '../components.jsx';

const GROUPS = [
  { key: 'mentor', label: 'Alumni & mentors', role: 'mentor' },
  { key: 'student', label: 'Students', role: 'student' },
  { key: 'employer', label: 'Employers', role: 'employer' },
];

function PersonCard({ p }) {
  const secondary = p.role === 'student'
    ? `${p.department ?? ''} · Year ${p.year_of_study ?? '?'}${p.gpa ? ` · GPA ${p.gpa}` : ''}`
    : p.role === 'employer'
      ? `${p.company ?? ''} · ${p.city ?? ''}`
      : `${p.company ?? ''} · ${p.seniority ?? ''} · ${p.years_experience ?? 0}y experience`;

  return (
    <li className="row" style={{ listStyle: 'none' }}>
      <Link to={`/people/${p.id}`} aria-label={p.full_name}>
        <Avatar name={p.full_name} color={p.avatar_color} />
      </Link>
      <div className="grow">
        <Link to={`/people/${p.id}`} className="row__title" style={{ display: 'block' }}>{p.full_name}</Link>
        <div className="row__sub">{p.headline || secondary}</div>
        <div className="muted tiny">{secondary}</div>
        <div style={{ marginTop: '.4rem' }}>
          <SkillTags skills={p.skills} max={7} />
        </div>
        <div className="chips" style={{ marginTop: '.35rem' }}>
          <span className="tag">{p.network_size} connections</span>
          {p.open_to?.slice(0, 2).map((o) => <Tag key={o} tone="brand">{o}</Tag>)}
          {p.availability_hours ? <Tag tone="ok">{p.availability_hours}h/week offered</Tag> : null}
        </div>
      </div>
      <div className="row__actions">
        {p.relation === 'connected'
          ? <Tag tone="ok">connected</Tag>
          : p.relation === 'pending'
            ? <Tag tone="warn">requested</Tag>
            : <Link className="btn btn--soft btn--sm" to={`/people/${p.id}`}>View</Link>}
        <Link className="btn btn--ghost btn--sm" to={`/messages?to=${p.id}`}>Message</Link>
      </div>
    </li>
  );
}

function Requests({ title }) {
  const { data, error, loading, reload } = useFetch('/connections');
  const { call, busy, error: actError } = useAsync();

  const decide = (c, status) => call(async () => { await api.patch(`/connections/${c.id}`, { status }); reload(); });

  const pending = (data?.connections ?? []).filter((c) => c.status === 'pending');
  const accepted = (data?.connections ?? []).filter((c) => c.status === 'accepted');

  return (
    <Panel title={title ?? 'My network'} sub={data ? `${accepted.length} connected · ${pending.length} pending` : ''}>
      <ErrorNote error={error ?? actError} />
      {loading && !data ? <Loading /> : null}

      <div className="card__title">Pending</div>
      {pending.length === 0
        ? <p className="hint">No outstanding requests.</p>
        : (
          <ul className="list" style={{ margin: '0 0 1rem', padding: 0 }}>
            {pending.map((c) => (
              <li key={c.id} className="row" style={{ listStyle: 'none' }}>
                <Avatar name={c.person.full_name} color={c.person.avatar_color} size="sm" />
                <div className="grow">
                  <b>{c.person.full_name}</b>
                  <div className="muted tiny">{c.person.headline || c.person.company || c.person.department}</div>
                  <div className="muted tiny">{c.direction === 'incoming' ? `wants to ${c.kind}` : `you requested ${c.kind}`} · ${c.note ?? ''}</div>
                </div>
                <div className="row__actions">
                  {c.direction === 'incoming' ? (
                    <div className="btn__row">
                      <button type="button" className="btn btn--primary btn--sm" onClick={() => decide(c, 'accepted')} disabled={busy}>Accept</button>
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => decide(c, 'declined')} disabled={busy}>Decline</button>
                    </div>
                  ) : <Tag tone="warn">awaiting reply</Tag>}
                </div>
              </li>
            ))}
          </ul>
        )}

      <div className="card__title">Connections</div>
      {accepted.length === 0
        ? <p className="hint">Nothing accepted yet.</p>
        : (
          <ul className="list" style={{ margin: 0, padding: 0 }}>
            {accepted.slice(0, 20).map((c) => (
              <li key={c.id} className="row" style={{ listStyle: 'none' }}>
                <Avatar name={c.person.full_name} color={c.person.avatar_color} size="sm" />
                <div className="grow">
                  <Link to={`/people/${c.person.id}`}><b>{c.person.full_name}</b></Link>
                  <div className="muted tiny">{c.person.headline || c.person.company || c.person.department} · {c.kind}</div>
                </div>
                <div className="row__actions">
                  <Link className="btn btn--ghost btn--sm" to={`/messages?to=${c.person.id}`}>Message</Link>
                  <button type="button" className="btn btn--danger btn--sm" onClick={() => decide(c, 'revoked')} disabled={busy}>Remove</button>
                </div>
              </li>
            ))}
          </ul>
        )}
    </Panel>
  );
}

export default function People({ defaultRequests = false }) {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();

  const tab = params.get('tab') ?? (defaultRequests ? 'requests' : 'mentor');
  const group = GROUPS.find((g) => g.key === tab) ?? GROUPS[0];

  const filters = {
    role: group.role,
    q: params.get('q') ?? '',
    department: params.get('department') ?? '',
    skill: params.get('skill') ?? '',
    seniority: params.get('seniority') ?? '',
  };

  const set = (k, v) => {
    const next = { tab, ...filters, [k]: v };
    const search = {};
    for (const [key, value] of Object.entries(next)) if (value && key !== 'role') search[key] = value;
    setParams(search, { replace: true });
  };

  const path = useMemo(() => `/people${qs(filters)}`, [filters]);
  const { data, error, loading } = useFetch(path);
  const people = data?.people ?? [];

  const mentorFacing = user?.role === 'student';

  return (
    <div className="cols">
      <div className="stack">
        {mentorFacing && (
          <Note tone="info">
            Alumni mentoring is an addition to the documented scope - the project describes student, employer and
            Career Services roles. It is included here to test the networking half of the design.
          </Note>
        )}

        <div className="pill-nav">
          {GROUPS.map((g) => (
            <button type="button" key={g.key} className={tab === g.key ? 'is-active' : ''} onClick={() => setParams({ tab: g.key })}>{g.label}</button>
          ))}
          <button type="button" className={tab === 'requests' ? 'is-active' : ''} onClick={() => setParams({ tab: 'requests' })}>Requests & network</button>
        </div>

        {tab === 'requests'
          ? <Requests />
          : (
            <Panel title={group.label} sub={data ? `${people.length} shown` : 'Searching'}>
              <div className="flex flex--wrap mb">
                <input style={{ maxWidth: 280 }} value={filters.q} onChange={(e) => set('q', e.target.value)} placeholder="Name, headline or company" aria-label="Search people" />
                {group.role === 'mentor' && (
                  <select value={filters.seniority} onChange={(e) => set('seniority', e.target.value)} style={{ width: 'auto' }} aria-label="Seniority">
                    <option value="">Any seniority</option>
                    {['junior', 'mid', 'senior', 'lead'].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                )}
                {group.role !== 'employer' && (
                  <select value={filters.department} onChange={(e) => set('department', e.target.value)} style={{ width: 'auto' }} aria-label="Department">
                    <option value="">Any department</option>
                    {['Computer Science', 'Accounting', 'Marketing Management', 'Management', 'Tourism', 'Economics'].map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                )}
                <input style={{ maxWidth: 170 }} value={filters.skill} onChange={(e) => set('skill', e.target.value)} placeholder="Skill, e.g. Python" aria-label="Skill filter" />
              </div>

              <ErrorNote error={error} />
              {loading && !data ? <Loading text="Searching" /> : null}
              {data && people.length === 0 && <Empty title="No people match" hint="Clear a filter or check the spelling." />}
              <ul className="list" style={{ margin: 0, padding: 0 }}>
                {people.map((p) => <PersonCard key={p.id} p={p} />)}
              </ul>
            </Panel>
          )}
      </div>

      <aside className="stack">
        <Panel title="How to use this directory">
          <ul className="tiny" style={{ paddingLeft: '1.1rem', color: 'var(--ink-2)' }}>
            <li>Students: find an alumnus in your field, check the compatibility score, then request mentorship.</li>
            <li>Employers: search students by skill and open a profile to see their ranked evidence.</li>
            <li>Career Services: monitor adoption of the networking features during the pilot.</li>
          </ul>
        </Panel>
        <Panel title="Mentorship is scored differently">
          <p className="hint">
            Person compatibility uses shared skills, stated topics and weekly capacity only. It is deliberately kept
            apart from the internship matching model so the documented scoring weights stay uncluttered.
          </p>
        </Panel>
      </aside>
    </div>
  );
}
