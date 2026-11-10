import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, daysLeft, fmtDate } from '../api.js';
import { useAuth } from '../auth.jsx';
import {
  Breakdown, ErrorNote, Field, Loading, Metric, Modal, Note, OkNote,
  Panel, ScoreDial, StatusTag, Tag, useAsync, useFetch, scoreVerdict,
} from '../components.jsx';

export default function InternshipDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data, error, loading, reload } = useFetch(`/internships/${id}`);
  const [applyOpen, setApplyOpen] = useState(false);
  const [note, setNote] = useState('');
  const { busy, error: applyError, call } = useAsync();

  if (loading && !data) return <Loading text="Loading posting" />;
  if (error) return <Panel title="Problem"><ErrorNote error={error} /></Panel>;

  const i = data.internship;
  const match = data.match;
  const left = daysLeft(i.application_deadline);
  const taken = i.seats_taken ?? 0;
  const filled = i.capacity != null && taken >= i.capacity;
  const isOwner = user?.role === 'employer' && i.employer_id === user.id;
  const isAdmin = user?.role === 'admin';

  const apply = () => call(async () => {
    const res = await api.post(`/internships/${id}/apply`, { note });
    setApplyOpen(false);
    reload();
    return res;
  });

  return (
    <div className="cols">
      <div className="stack">
        <Panel pad={false}>
          <div className="hero">
            <div className="flex flex--between flex--top" style={{ gap: '1rem', alignItems: 'flex-start' }}>
              <div className="grow">
                <h1>{i.title}</h1>
                <p style={{ marginTop: '.3rem' }}>
                  <b>{i.company}</b> · {i.location}{i.city ? `, ${i.city}` : ''} · {i.format}
                </p>
                <div className="hero__meta">
                  <span className="hero__chip">{i.duration_days ?? 40}-day mandatory internship</span>
                  <span className="hero__chip">{i.hours_per_week}h / week</span>
                  {i.batch && <span className="hero__chip">{i.batch}</span>}
                  {i.stipend && <span className="hero__chip">{i.stipend}</span>}
                  <span className="hero__chip">{i.level} level</span>
                  <span className="hero__chip">{i.capacity} place{i.capacity > 1 ? 's' : ''}</span>
                </div>
              </div>
              {match && (
                <div style={{ textAlign: 'center' }}>
                  <ScoreDial value={match.score} hero label={`${match.score}% compatible`} />
                  <div style={{ marginTop: '.35rem', fontSize: '.78rem' }}>{scoreVerdict(match.score)}</div>
                </div>
              )}
            </div>
          </div>

          <div className="card__pad">
            <div className="flex flex--between flex--wrap mb">
              <div>
                <div className="card__title">Apply by</div>
                <b>{fmtDate(i.application_deadline)}</b>
                {left != null && (
                  <span className="tiny" style={{ color: left <= 7 ? 'var(--danger)' : 'var(--ink-3)', marginLeft: '.5rem' }}>
                    {left < 0 ? 'deadline passed' : `${left} days left`}
                  </span>
                )}
              </div>
              <div>
                <div className="card__title">Start</div>
                <b>{fmtDate(i.start_date)}</b>
              </div>
              <div>
                <div className="card__title">Status</div>
                <StatusTag status={i.status} />
              </div>
              <div>
                <div className="card__title">Open to</div>
                <span className="chips">{(i.departments ?? []).map((d) => <Tag key={d} tone="brand">{d}</Tag>)}</span>
              </div>
            </div>

            <h3>About the role</h3>
            <p style={{ marginTop: '.4rem' }}>{i.description}</p>

            {(i.responsibilities ?? []).length > 0 && (
              <>
                <h3 style={{ marginTop: '1rem' }}>What you will do</h3>
                <ul className="tiny" style={{ marginTop: '.4rem' }}>
                  {i.responsibilities.map((r) => <li key={r}>{r}</li>)}
                </ul>
              </>
            )}

            <h3 style={{ marginTop: '1rem' }}>Requirements the engine scores against</h3>
            <div className="scroll-x mt">
              <table className="table">
                <thead>
                  <tr><th>Skill</th><th>Weight</th><th>Must have</th><th>Your evidence</th></tr>
                </thead>
                <tbody>
                  {(i.requirements ?? []).map((r) => {
                    const have = match?.reasons?.some((x) => x.toLowerCase().includes(r.skill.toLowerCase()));
                    return (
                      <tr key={r.skill}>
                        <td><b>{r.skill}</b></td>
                        <td><Tag tone={r.weight >= 4 ? 'warn' : 'line'}>{r.weight}/5</Tag></td>
                        <td>{r.required ? <Tag tone="danger">required</Tag> : <span className="muted tiny">nice to have</span>}</td>
                        <td>{have ? <Tag tone="ok">found in your CV</Tag> : <span className="muted tiny">not detected</span>}</td>
                      </tr>
                    );
                  })}
                  {!(i.requirements ?? []).length && <tr><td colSpan={4} className="muted">No skill requirements recorded.</td></tr>}
                </tbody>
              </table>
            </div>

            {(isOwner || isAdmin) && (
              <div className="btn__row mt">
                <Link className="btn btn--soft" to={`/employer/applicants?post=${i.id}`}>See ranked applicants</Link>
                {isAdmin && <Note tone="info">Career Services can act on any application for oversight during the pilot.</Note>}
              </div>
            )}
          </div>
        </Panel>

        {match && (
          <Panel
            title="Why this score"
            sub={`Computed live from your CV evidence and profile against ${i.requirements?.length ?? 0} weighted requirements`}
          >
            <Breakdown breakdown={match.breakdown} reasons={match.reasons} gaps={match.gaps} flags={match.flags} />
            {!match.eligible && (
              <div className="mt">
                <Note tone="warn">
                  Your department or academic standing does not satisfy this posting&apos;s eligibility rule, so the
                  score is dampened rather than hidden. Fixing the profile or asking Career Services for an
                  exception is the route to applying.
                </Note>
              </div>
            )}
          </Panel>
        )}
      </div>

      <aside className="stack">
        {user?.role === 'student' && (
          <Panel title={data.application ? 'Your application' : 'Apply'}>
            {data.application ? (
              <>
                <div className="flex mb">
                  <StatusTag status={data.application.status} />
                  <span className="muted tiny">submitted {fmtDate(data.application.submitted_at)}</span>
                </div>
                <p className="hint">Score locked at submission: {data.application.match_score}%.</p>
                <Link className="btn btn--soft btn--block mt" to="/applications">Track in your pipeline</Link>
              </>
            ) : (
              <>
                {match?.already_applied ? (
                  <Note tone="ok">Already applied.</Note>
                ) : null}
                {!match || match.score == null ? <Note tone="info">Sign-in state lost the match; reload the page.</Note> : null}
                <ErrorNote error={applyError} />
                <button
                  type="button"
                  className="btn btn--primary btn--block"
                  disabled={i.status !== 'published' || left < 0 || !match?.eligible || filled}
                  onClick={() => setApplyOpen(true)}
                >
                  {i.status !== 'published' ? 'Not accepting applications'
                    : left != null && left < 0 ? 'Deadline passed'
                      : filled ? 'All places filled'
                        : !match?.eligible ? 'Not eligible for this posting'
                          : 'Apply now'}
                </button>
                <p className="hint mt">
                  Your application carries the skills and evidence the extractor read from your CV, not the CV itself;
                  the employer sees your rank and the component scores.
                </p>
              </>
            )}
          </Panel>
        )}

        {data.employer && (
          <Panel title="About the employer">
            <div className="flex mb">
              <span className="avatar" style={{ '--color': 'var(--brand-dark)' }}>{data.employer.company_name?.slice(0, 2).toUpperCase()}</span>
              <div className="grow">
                <b>{data.employer.company_name}</b>
                <div className="muted tiny">{data.employer.industry ?? 'Industry not stated'} · {data.employer.city ?? 'Addis Ababa'}</div>
              </div>
            </div>
            <Tag tone={data.employer.verification_status === 'verified' ? 'ok' : 'warn'}>
              {data.employer.verification_status === 'verified' ? 'Verified by Career Services' : `Verification ${data.employer.verification_status}`}
            </Tag>
          </Panel>
        )}

        <Panel title="Eligibility rules">
          <div className="kv">
            <dt>Departments</dt><dd>{(i.departments ?? []).join(', ') || 'any'}</dd>
            <dt>Minimum year</dt><dd>{i.min_year ? `Year ${i.min_year}+` : 'not restricted'}</dd>
            <dt>Minimum GPA</dt><dd>{i.min_gpa ? `${i.min_gpa} and above` : 'not restricted'}</dd>
            <dt>Duration</dt><dd>{i.duration_days ?? 40} days</dd>
            <dt>Weekly hours</dt><dd>{i.hours_per_week ?? 30}</dd>
          </div>
        </Panel>

        {data.similar?.length > 0 && user?.role === 'student' && (
          <Panel title="Also a good fit">
            <ul className="list" style={{ margin: 0, padding: 0 }}>
              {data.similar.map((s) => (
                <li key={s.internship_id} className="row row--flat" style={{ listStyle: 'none' }}>
                  <div>
                    <Link to={`/internships/${s.internship_id}`} className="row__title" style={{ display: 'block' }}>{s.title}</Link>
                    <div className="muted tiny">{s.company}</div>
                  </div>
                  <ScoreDial value={s.score} />
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {user?.role === 'mentor' && (
          <Note tone="info">
            Mentors can browse postings to advise students, but applications are submitted by the student.
          </Note>
        )}
      </aside>

      {applyOpen && (
        <Modal
          title={`Apply to ${i.title}`}
          onClose={() => setApplyOpen(false)}
          foot={
            <div className="btn__row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn--ghost" onClick={() => setApplyOpen(false)}>Cancel</button>
              <button type="button" className="btn btn--primary" onClick={apply} disabled={busy}>
                {busy ? <Loading text="" /> : `Submit — score ${match?.score}%`}
              </button>
            </div>
          }
        >
          <OkNote>Nothing is sent until you press submit.</OkNote>
          <div className="metrics mb">
            <Metric label="Compatibility" value={`${match?.score ?? 0}%`} tone="ok" />
            <Metric label="Requirements met" value={(i.requirements ?? []).filter((r) => match?.reasons?.some((x) => x.toLowerCase().includes(r.skill.toLowerCase()))).length} />
            <Metric label="Openings" value={Math.max(0, (i.capacity ?? 1) - taken)} />
          </div>
          <Field label="Note to the employer" hint="Optional. Career Services can see it if the placement proceeds.">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why this role, and what you can bring from your coursework and projects." />
          </Field>
          <p className="hint">
            The compatibility score is recomputed at the moment of submission and stored with the application, so the
            record shows what the engine said then.
          </p>
        </Modal>
      )}
    </div>
  );
}
