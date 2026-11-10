import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtDate, daysLeft } from '../api.js';
import {
  Breakdown, Empty, ErrorNote, Field, Loading, Metric, Modal, Note, Panel,
  ScoreDial, StatusTag, Tag, useAsync, useFetch,
} from '../components.jsx';

const COLUMNS = [
  { key: 'submitted', label: 'Submitted' },
  { key: 'under_review', label: 'Under review' },
  { key: 'shortlisted', label: 'Shortlisted' },
  { key: 'accepted', label: 'Offer' },
  { key: 'completed', label: 'Completed' },
];

function Card({ a, onChanged }) {
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState(null);
  const { busy, error, call } = useAsync();
  const left = daysLeft(a.deadline);

  const withdraw = () => call(async () => { await api.post(`/applications/${a.id}/withdraw`, {}); onChanged(); });

  const saveReport = () => call(async () => {
    await api.post(`/applications/${a.id}/placement`, report);
    setReport(null);
    onChanged();
  });

  return (
    <li className="row" style={{ listStyle: 'none', gridTemplateColumns: 'auto minmax(0,1fr) auto' }}>
      <ScoreDial value={a.match_score ?? 0} label={`${a.match_score ?? 0}% at submission`} />
      <div className="grow">
        <Link to={`/internships/${a.internship_id}`} className="row__title">{a.title}</Link>
        <div className="row__sub">
          {a.company} · {a.format} · {a.city} · applied {fmtDate(a.submitted_at)}
        </div>
        <div className="flex flex--wrap" style={{ marginTop: '.4rem', gap: '.4rem' }}>
          <StatusTag status={a.status} />
          {a.placement && <Tag tone="brand">placement {a.placement.completion_status?.replace('_', ' ')}</Tag>}
          {a.placement?.report_submitted && <Tag tone="ok">report submitted</Tag>}
          {a.placement?.evaluation_score != null && <Tag tone="ok">evaluation {a.placement.evaluation_score}/5</Tag>}
          {a.cover_note && <span className="muted tiny">note attached</span>}
        </div>

        {open && (
          <div className="mt" style={{ background: '#fbfcfd', border: '1px solid var(--line)', borderRadius: 8, padding: '.8rem' }}>
            <div className="card__title mb">Score recorded at submission</div>
            {a.breakdown?.breakdown
              ? <Breakdown breakdown={a.breakdown.breakdown} reasons={a.breakdown.reasons ?? []} gaps={a.breakdown.gaps ?? []} flags={a.breakdown.flags ?? []} />
              : <span className="muted tiny">No stored breakdown for this application.</span>}

            <div className="card__title" style={{ marginTop: '1rem' }}>Status history</div>
            {a.timeline?.length ? (
              <div className="timeline mt">
                {a.timeline.map((t) => (
                  <div className="timeline__item" key={t.id}>
                    <div className="timeline__title">{(t.to ?? '').replace('_', ' ')}</div>
                    <div className="timeline__meta">{fmtDate(t.created_at)} · {t.note}</div>
                  </div>
                ))}
              </div>
            ) : <span className="muted tiny">No events recorded.</span>}

            {a.placement && (
              <div className="mt">
                <div className="card__title">Placement record</div>
                <dl className="kv" style={{ marginTop: '.4rem' }}>
                  <dt>Supervisor</dt><dd>{a.placement.supervisor ?? '—'}</dd>
                  <dt>Start</dt><dd>{fmtDate(a.placement.start_date)}</dd>
                  <dt>End</dt><dd>{fmtDate(a.placement.end_date)}</dd>
                </dl>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="row__actions">
        {left != null && left >= 0 && ['submitted', 'under_review', 'shortlisted'].includes(a.status) && (
          <span className="tiny nowrap" style={{ color: left <= 7 ? 'var(--danger)' : 'var(--ink-3)' }}>{left}d to deadline</span>
        )}
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen((o) => !o)}>{open ? 'Hide' : 'Details'}</button>
        {['submitted', 'under_review', 'shortlisted'].includes(a.status) && (
          <button type="button" className="btn btn--danger btn--sm" onClick={withdraw} disabled={busy}>Withdraw</button>
        )}
        {a.status === 'accepted' && !report && (
          <button type="button" className="btn btn--soft btn--sm" onClick={() => setReport({ supervisor_name: a.placement?.supervisor ?? '', start_date: '', end_date: '', evaluation_score: '', completion_status: 'in_progress', report_submitted: Boolean(a.placement?.report_submitted) })}>
            Report progress
          </button>
        )}
        {error && <span className="error-text tiny">{error}</span>}
      </div>

      {report && (
        <Modal
          title={`Placement report — ${a.title}`}
          onClose={() => setReport(null)}
          foot={
            <div className="btn__row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn--ghost" onClick={() => setReport(null)}>Cancel</button>
              <button type="button" className="btn btn--primary" onClick={saveReport} disabled={busy}>Save</button>
            </div>
          }
        >
          <p className="hint">This is the paperwork Career Services currently chases on paper. Submitting the final
            report closes the placement in the register.</p>
          <ErrorNote error={report.error} />
          <div className="grid-2">
            <Field label="Site supervisor"><input value={report.supervisor_name} onChange={(e) => setReport({ ...report, supervisor_name: e.target.value })} /></Field>
            <Field label="Supervisor email"><input type="email" value={report.supervisor_email ?? ''} onChange={(e) => setReport({ ...report, supervisor_email: e.target.value })} /></Field>
            <Field label="Start date"><input type="date" value={report.start_date} onChange={(e) => setReport({ ...report, start_date: e.target.value })} /></Field>
            <Field label="End date"><input type="date" value={report.end_date} onChange={(e) => setReport({ ...report, end_date: e.target.value })} /></Field>
            <Field label="Status">
              <select value={report.completion_status} onChange={(e) => setReport({ ...report, completion_status: e.target.value })}>
                <option value="in_progress">In progress</option>
                <option value="completed">Completed</option>
              </select>
            </Field>
            <Field label="Employer evaluation (1-5)">
              <select value={report.evaluation_score} onChange={(e) => setReport({ ...report, evaluation_score: e.target.value })}>
                <option value="">Not yet rated</option>
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </Field>
          </div>
          <label className="check">
            <input type="checkbox" checked={report.report_submitted} onChange={(e) => setReport({ ...report, report_submitted: e.target.checked })} />
            I have submitted my final internship report
          </label>
        </Modal>
      )}
    </li>
  );
}

export default function Applications() {
  const { data, error, loading, reload } = useFetch('/applications/me');
  const deadlines = useFetch('/notifications/deadlines');

  if (loading && !data) return <Loading text="Loading your applications" />;

  const apps = data?.applications ?? [];
  const counts = data?.counts ?? {};

  return (
    <div className="cols">
      <div className="stack">
        <Panel title="Internship pipeline" sub={`${apps.length} application${apps.length === 1 ? '' : 's'} recorded`}>
          <ErrorNote error={error} />
          <div className="metrics mb">
            {COLUMNS.map((c) => (
              <Metric key={c.key} label={c.label} value={counts[c.key] ?? 0} tone={c.key === 'accepted' && counts[c.key] ? 'ok' : undefined} />
            ))}
          </div>

          {apps.length === 0 ? (
            <Empty
              title="You have not applied to anything yet"
              hint="Open a recommended posting and check the score breakdown before you submit."
              action={<Link className="btn btn--primary btn--sm mt" to="/internships">Browse opportunities</Link>}
            />
          ) : (
            <ul className="list" style={{ margin: 0, padding: 0 }}>
              {apps.map((a) => <Card key={a.id} a={a} onChanged={reload} />)}
            </ul>
          )}
        </Panel>
      </div>

      <aside className="stack">
        <Panel title="Deadline alerts" sub="Live days remaining, computed against today">
          {deadlines.loading ? <Loading /> : (
            <>
              {(deadlines.data?.deadlines ?? []).length === 0
                ? <Note tone="info">No open deadlines match your department right now.</Note>
                : (
                  <ul className="list" style={{ margin: 0, padding: 0 }}>
                    {(deadlines.data?.deadlines ?? []).map((d) => (
                      <li key={d.id} className="row row--flat" style={{ listStyle: 'none' }}>
                        <div>
                          <Link to={`/internships/${d.id}`} className="row__title" style={{ display: 'block' }}>{d.title}</Link>
                          <div className="muted tiny">{d.company} · {fmtDate(d.application_deadline)}</div>
                        </div>
                        <Tag tone={d.days_left <= 7 ? 'danger' : d.days_left <= 21 ? 'warn' : 'line'}>{d.days_left}d</Tag>
                      </li>
                    ))}
                  </ul>
                )}
            </>
          )}
        </Panel>

        <Panel title="Milestones">
          {deadlines.data?.milestones?.length ? (
            <ul className="list" style={{ margin: 0, padding: 0 }}>
              {deadlines.data.milestones.map((m) => (
                <li key={m.id} className="row row--flat" style={{ listStyle: 'none' }}>
                  <div>
                    <div className="row__title">{m.title}</div>
                    <div className="muted tiny">{m.company} · start {fmtDate(m.start_date)}</div>
                    <div className="muted tiny">{m.report_submitted ? 'Final report received' : 'Final report outstanding'}</div>
                  </div>
                  <StatusTag status={m.status} />
                </li>
              ))}
            </ul>
          ) : <span className="muted tiny">No accepted placements yet.</span>}
        </Panel>

        <Panel title="How the pipeline works">
          <ol className="tiny" style={{ paddingLeft: '1.1rem', color: 'var(--ink-2)' }}>
            <li>Submitted — your application and stored score reach the employer queue.</li>
            <li>Under review — the employer has opened it.</li>
            <li>Shortlisted — invited for interview or document check.</li>
            <li>Accepted — a placement record is created automatically.</li>
            <li>Completed — 40 days done and the report is filed.</li>
          </ol>
        </Panel>
      </aside>
    </div>
  );
}
