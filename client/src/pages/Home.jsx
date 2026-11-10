import React from 'react';
import { Link } from 'react-router-dom';
import { fmtDate, daysLeft } from '../api.js';
import { useAuth } from '../auth.jsx';
import {
  Avatar, Empty, ErrorNote, Loading, Metric, Note, Panel, ScoreDial, SkillTags,
  StatusTag, Tag, useFetch,
} from '../components.jsx';

/* ------------------------------------------------------------- student --- */
function StudentHome({ user }) {
  const recs = useFetch('/students/me/recommendations');
  const apps = useFetch('/applications/me');
  const deadlines = useFetch('/notifications/deadlines');
  const top = recs.data?.recommendations ?? [];
  const outstanding = (apps.data?.applications ?? []).filter((a) => ['submitted', 'under_review', 'shortlisted'].includes(a.status));

  return (
    <div className="cols">
      <div className="stack">
        <Panel pad={false}>
          <div className="hero">
            <h1>Welcome back, {user.full_name.split(' ')[0]}</h1>
            <p>
              {recs.data
                ? `${top.length} postings scored against your CV evidence. ${recs.data.distribution.above_80} are a strong fit and ${recs.data.profile_complete_pct}% of your readiness checklist is complete.`
                : 'Scoring every live posting against your profile…'}
            </p>
            <div className="hero__meta">
              <span className="hero__chip">{user.department ?? 'student'}</span>
              <span className="hero__chip">40-day mandatory internship</span>
              {recs.data && <span className="hero__chip">{recs.data.skill_count} skills read from your CV</span>}
            </div>
          </div>
        </Panel>

        <Panel
          title="Matches for you"
          sub="Ranked by the compatibility engine"
          right={<Link className="btn btn--ghost btn--sm" to="/internships?sort=match">Open the board</Link>}
        >
          <ErrorNote error={recs.error} />
          {recs.loading && !recs.data ? <Loading text="Running the matcher" /> : null}
          {recs.data && top.length === 0 ? (
            <Empty
              title="No eligible postings yet"
              hint="Upload your CV and complete the readiness checklist - most students get matches once the extractor has evidence."
              action={<Link className="btn btn--primary btn--sm mt" to="/me">Finish my profile</Link>}
            />
          ) : (
            <ul className="list" style={{ margin: 0, padding: 0 }}>
              {top.slice(0, 6).map((r) => (
                <li key={r.internship_id} className="row" style={{ listStyle: 'none', gridTemplateColumns: '46px minmax(0,1fr) auto' }}>
                  <Avatar name={r.company} color="var(--brand-dark)" />
                  <div className="grow">
                    <Link to={`/internships/${r.internship_id}`} className="row__title" style={{ display: 'block' }}>{r.title}</Link>
                    <div className="row__sub">{r.company} · {r.city} · {r.format} · {r.duration_days} days</div>
                    <div className="tiny" style={{ color: 'var(--success)', marginTop: '.3rem' }}>{r.reasons[0] ?? 'No positive signals yet'}</div>
                    {r.gaps.length > 0 && <div className="tiny" style={{ color: 'var(--warn)' }}>Missing: {r.gaps.slice(0, 2).join('; ')}</div>}
                  </div>
                  <div className="row__actions">
                    <ScoreDial value={r.score} />
                    {r.already_applied
                      ? <Tag tone="ok">applied</Tag>
                      : <Link className="btn btn--soft btn--sm" to={`/internships/${r.internship_id}`}>View</Link>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Where you stand" sub="Readiness checklist from section 1.6 of the project" right={<Link className="btn btn--ghost btn--sm" to="/me">Edit profile</Link>}>
          {recs.data ? (
            <>
              <div className="flex flex--between tiny mb"><b>Profile completeness</b><span>{recs.data.profile_complete_pct}%</span></div>
              <div className="progress mb"><div style={{ width: `${recs.data.profile_complete_pct}%` }} /></div>
              <ul className="list" style={{ margin: 0, padding: 0 }}>
                {recs.data.readiness.map((r) => (
                  <li key={r.key} className="row row--flat" style={{ listStyle: 'none', padding: '.55rem 0' }}>
                    <div>
                      <b>{r.label}</b>
                      {!r.done && <div className="muted tiny">{r.hint}</div>}
                    </div>
                    <Tag tone={r.done ? 'ok' : 'warn'}>{r.done ? 'done' : 'to do'}</Tag>
                  </li>
                ))}
              </ul>
            </>
          ) : <Loading />}
        </Panel>
      </div>

      <aside className="stack">
        <Panel title="Your applications" right={<Link className="btn btn--ghost btn--sm" to="/applications">All</Link>}>
          <div className="metrics mb">
            <Metric label="Total" value={apps.data?.applications?.length ?? 0} />
            <Metric label="Offers" value={apps.data?.counts?.accepted ?? 0} tone="ok" />
            <Metric label="Open" value={outstanding.length} />
          </div>
          {outstanding.length === 0
            ? <span className="muted tiny">Nothing awaiting a decision.</span>
            : (
              <ul className="list" style={{ margin: 0, padding: 0 }}>
                {outstanding.slice(0, 4).map((a) => (
                  <li key={a.id} className="row row--flat" style={{ listStyle: 'none' }}>
                    <div>
                      <b>{a.title}</b>
                      <div className="muted tiny">{a.company} · {a.match_score}% at submission</div>
                    </div>
                    <StatusTag status={a.status} />
                  </li>
                ))}
              </ul>
            )}
        </Panel>

        <Panel title="Deadlines">
          {(deadlines.data?.deadlines ?? []).length === 0
            ? <span className="muted tiny">No open deadlines for your department.</span>
            : (
              <ul className="list" style={{ margin: 0, padding: 0 }}>
                {(deadlines.data?.deadlines ?? []).slice(0, 6).map((d) => {
                  const left = d.days_left;
                  return (
                    <li key={d.id} className="row row--flat" style={{ listStyle: 'none' }}>
                      <div>
                        <Link to={`/internships/${d.id}`} style={{ fontWeight: 600, fontSize: '.9rem' }}>{d.title}</Link>
                        <div className="muted tiny">{d.company} · {fmtDate(d.application_deadline)}</div>
                      </div>
                      <Tag tone={left <= 7 ? 'danger' : left <= 21 ? 'warn' : 'line'}>{left}d</Tag>
                    </li>
                  );
                })}
              </ul>
            )}
        </Panel>

        <Panel title="Skills on your profile" pad={false}>
          <div className="card__pad">
            {recs.data ? (
              <>
                <p className="hint">
                  Most-requested skills on the board right now:{' '}
                  {Array.from(new Set((recs.data.recommendations ?? []).flatMap((r) => r.required_skills ?? []))).slice(0, 10).join(', ') || 'none recorded'}.
                </p>
                <Link className="btn btn--soft btn--sm mt" to="/me">Review my skills</Link>
              </>
            ) : <Loading />}
          </div>
        </Panel>
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------ employer --- */
function EmployerHome({ user }) {
  const board = useFetch('/internships?status=all');
  const queue = useFetch('/applications/received');
  const mine = (board.data?.internships ?? []).filter((i) => i.employer_id === user.id);
  const apps = queue.data?.applications ?? [];

  return (
    <div className="cols">
      <div className="stack">
        <Panel pad={false}>
          <div className="hero">
            <h1>{user.company_name}</h1>
            <p>
              {user.verification_status === 'verified'
                ? 'Verified by Career Services. Students see your badge on every posting.'
                : 'Awaiting Career Services verification - postings publish once the office approves your registration.'}
            </p>
            <div className="hero__meta">
              <span className="hero__chip">{mine.filter((i) => i.status === 'published').length} live postings</span>
              <span className="hero__chip">{apps.length} applications in the queue</span>
              <span className="hero__chip">{apps.filter((a) => a.status === 'accepted').length} accepted</span>
            </div>
          </div>
        </Panel>

        {user.verification_status !== 'verified' && (
          <Note tone={user.verification_status === 'pending' ? 'warn' : 'err'}>
            Verification is {user.verification_status}. Career Services checks employer registrations before students
            can apply - the same control the paper process relies on.
          </Note>
        )}

        <Panel title="Applicant queue" sub="Every application across your postings, highest compatibility first" right={<Link className="btn btn--ghost btn--sm" to="/employer/applicants">Full ranking</Link>}>
          <ErrorNote error={queue.error} />
          {queue.loading ? <Loading text="Loading applicants" /> : apps.length === 0 ? (
            <Empty title="No applications yet" hint="Publish a posting to reach eligible students." action={<Link className="btn btn--primary btn--sm mt" to="/employer/postings">Manage postings</Link>} />
          ) : (
            <ul className="list" style={{ margin: 0, padding: 0 }}>
              {apps.slice(0, 7).map((a) => (
                <li key={a.application_id} className="row" style={{ listStyle: 'none', gridTemplateColumns: '46px minmax(0,1fr) auto' }}>
                  <Avatar name={a.student.name} color={a.student.color} />
                  <div className="grow">
                    <Link to={`/people/${a.student.id}`} className="row__title">{a.student.name}</Link>
                    <div className="row__sub">{a.internship.title} · {a.student.department_code} Year {a.student.year}{a.student.gpa ? ` · GPA ${a.student.gpa}` : ''}</div>
                    <div style={{ marginTop: '.3rem' }}><SkillTags skills={a.student.skills} max={6} /></div>
                  </div>
                  <div className="row__actions">
                    <ScoreDial value={a.match_score ?? 0} />
                    <StatusTag status={a.status} />
                    <Link className="btn btn--soft btn--sm" to={`/employer/applicants?post=${a.internship.id}`}>Review</Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <aside className="stack">
        <Panel title="Funnel">
          <div className="metrics">
            <Metric label="Postings" value={mine.length} />
            <Metric label="Live" value={mine.filter((i) => i.status === 'published').length} />
            <Metric label="Applications" value={apps.length} />
            <Metric label="Offers made" value={apps.filter((a) => a.status === 'accepted').length} tone="ok" />
          </div>
        </Panel>
        <Panel title="Your postings">
          {mine.length === 0 ? <span className="muted tiny">Nothing posted yet.</span> : (
            <ul className="list" style={{ margin: 0, padding: 0 }}>
              {mine.map((i) => (
                <li key={i.id} className="row row--flat" style={{ listStyle: 'none' }}>
                  <div>
                    <Link to={`/internships/${i.id}`} style={{ fontWeight: 600, fontSize: '.9rem' }}>{i.title}</Link>
                    <div className="muted tiny">{i.applications ?? 0} applied · deadline {fmtDate(i.application_deadline)}</div>
                  </div>
                  <Tag tone={i.status === 'published' ? 'ok' : i.status === 'draft' ? 'warn' : 'danger'}>{i.status}</Tag>
                </li>
              ))}
            </ul>
          )}
          <Link className="btn btn--primary btn--block mt" to="/employer/postings">Create a posting</Link>
        </Panel>
        <Panel title="Hiring from St. Mary&#39;s">
          <p className="hint">
            Students complete a 40-day placement as a graduation requirement, so availability clusters around the
            university batches. Set your deadline to give the office time to verify documents.
          </p>
        </Panel>
      </aside>
    </div>
  );
}

/* --------------------------------------------------------------- admin --- */
function AdminHome({ user }) {
  const { data, loading, error } = useFetch('/admin/overview');
  const s = data?.stats ?? {};

  return (
    <div className="cols">
      <div className="stack">
        <Panel pad={false}>
          <div className="hero">
            <h1>Career Services console</h1>
            <p>Real-time visibility of the internship process that the paper file cannot give you.</p>
            <div className="hero__meta">
              <span className="hero__chip">{s.students ?? 0} eligible students</span>
              <span className="hero__chip">{s.published_internships ?? 0} live postings</span>
              <span className="hero__chip">{s.completed_placements ?? 0} completed placements</span>
            </div>
          </div>
        </Panel>

        <ErrorNote error={error} />
        {loading ? <Loading text="Loading the register" /> : (
          <>
            <Panel title="Platform at a glance" right={<Link className="btn btn--ghost btn--sm" to="/admin">Full dashboard</Link>}>
              <div className="metrics">
                <Metric label="Students" value={s.students ?? 0} />
                <Metric label="Employers" value={s.employers ?? 0} />
                <Metric label="Postings" value={s.published_internships ?? 0} />
                <Metric label="Applications" value={s.applications ?? 0} />
                <Metric label="Accepted" value={s.accepted_applications ?? 0} tone="ok" />
                <Metric label="Avg match" value={s.avg_match_score ?? '—'} />
              </div>
            </Panel>

            <Panel title="Placement rate by department" sub="The metric the office currently has to compute by hand">
              <div className="scroll-x">
                <table className="table table--num">
                  <thead><tr><th>Department</th><th>Students</th><th>Applications</th><th>Placed</th><th>Rate</th></tr></thead>
                  <tbody>
                    {(data?.by_department ?? []).map((d) => (
                      <tr key={d.code}>
                        <td><b>{d.code}</b> <span className="muted tiny">{d.department}</span></td>
                        <td>{d.eligible_students}</td>
                        <td>{d.applications}</td>
                        <td>{d.completed_placements}</td>
                        <td><Tag tone={Number(d.placement_pct) >= 60 ? 'ok' : Number(d.placement_pct) >= 35 ? 'warn' : 'danger'}>{d.placement_pct}%</Tag></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </>
        )}
      </div>

      <aside className="stack">
        {(s.pending_verifications ?? 0) > 0 && (
          <Note tone="warn">
            {s.pending_verifications} employer registration{s.pending_verifications > 1 ? 's' : ''} awaiting your review.{' '}
            <Link to="/admin/verifications">Verify now</Link>
          </Note>
        )}
        <Panel title="Tasks">
          <ul className="list" style={{ margin: 0, padding: 0 }}>
            {[
              ['Verifications', '/admin/verifications', `${s.pending_verifications ?? 0} pending`],
              ['Placement register', '/admin/placements', `${s.completed_placements ?? 0} completed`],
              ['Matching Lab', '/admin/matching', 'accuracy of the engine'],
              ['Students & accounts', '/admin/users', `${s.students ?? 0} students`],
            ].map(([label, to, hint]) => (
              <li key={to} className="row row--flat" style={{ listStyle: 'none' }}>
                <div><b>{label}</b><div className="muted tiny">{hint}</div></div>
                <Link className="btn btn--soft btn--sm" to={to}>Open</Link>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Recent activity" pad={false}>
          <div className="card__pad">
            {(data?.recent_events ?? []).slice(0, 6).map((e) => (
              <div key={e.id} className="tiny" style={{ paddingBottom: '.45rem', borderBottom: '1px solid var(--line-soft)' }}>
                <b>{e.student_name}</b> — {e.to_status?.replace('_', ' ')} on <i>{e.title}</i>
                <div className="muted">{fmtDate(e.created_at)} · by {e.changed_by_name ?? 'system'}</div>
              </div>
            ))}
            {!data?.recent_events?.length && <span className="muted tiny">No recorded activity yet.</span>}
          </div>
        </Panel>
        <p className="hint">Signed in as {user.full_name} · Career Services administrator</p>
      </aside>
    </div>
  );
}

/* -------------------------------------------------------------- mentor --- */
function MentorHome({ user }) {
  const connections = useFetch('/connections');
  const students = useFetch('/people?role=student');
  const pending = (connections.data?.connections ?? []).filter((c) => c.status === 'pending' && c.direction === 'incoming');
  const mentees = (connections.data?.connections ?? []).filter((c) => c.status === 'accepted' && c.kind === 'mentorship');

  return (
    <div className="cols">
      <div className="stack">
        <Panel pad={false}>
          <div className="hero">
            <h1>{user.full_name}</h1>
            <p>{user.headline || 'Alumni mentor'} — advising current students on internships in their field.</p>
            <div className="hero__meta">
              <span className="hero__chip">{mentees.length} mentee{mentees.length === 1 ? '' : 's'}</span>
              <span className="hero__chip">{pending.length} pending request{pending.length === 1 ? '' : 's'}</span>
            </div>
          </div>
        </Panel>

        <Panel title="Requests waiting for you" right={<Link className="btn btn--ghost btn--sm" to="/people?tab=requests">All requests</Link>}>
          {pending.length === 0 ? <span className="muted tiny">Nothing awaiting a reply.</span> : (
            <ul className="list" style={{ margin: 0, padding: 0 }}>
              {pending.map((c) => (
                <li key={c.id} className="row" style={{ listStyle: 'none', gridTemplateColumns: '46px minmax(0,1fr) auto' }}>
                  <Avatar name={c.person.full_name} color={c.person.avatar_color} />
                  <div className="grow">
                    <Link to={`/people/${c.person.id}`} className="row__title">{c.person.full_name}</Link>
                    <div className="row__sub">{c.person.headline || c.person.department} · wants {c.kind}</div>
                    <div className="muted tiny">{c.note || 'No note attached.'}</div>
                  </div>
                  <Link className="btn btn--soft btn--sm" to="/people?tab=requests">Respond</Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Students looking for advice" sub="Directory search by skill and department">
          <ErrorNote error={students.error} />
          {students.loading ? <Loading /> : (
            <ul className="list" style={{ margin: 0, padding: 0 }}>
              {(students.data?.people ?? []).slice(0, 5).map((p) => (
                <li key={p.id} className="row" style={{ listStyle: 'none', gridTemplateColumns: '46px minmax(0,1fr) auto' }}>
                  <Avatar name={p.full_name} color={p.avatar_color} />
                  <div className="grow">
                    <Link to={`/people/${p.id}`} className="row__title">{p.full_name}</Link>
                    <div className="row__sub">{p.department} · Year {p.year_of_study}</div>
                    <SkillTags skills={p.skills} max={6} />
                  </div>
                  <Link className="btn btn--ghost btn--sm" to={`/people/${p.id}`}>View</Link>
                </li>
              ))}
            </ul>
          )}
          <Link className="btn btn--soft btn--sm mt" to="/people?tab=student">Open the directory</Link>
        </Panel>
      </div>

      <aside className="stack">
        <Panel title="Mentoring is an extension">
          <Note tone="info">
            The project document defines student, employer and Career Services roles. Alumni mentoring and direct
            messaging were added to this prototype to exercise the networking side of the design, and are marked as
            extensions wherever they appear.
          </Note>
        </Panel>
        <Panel title="Your mentees">
          {mentees.length === 0 ? <span className="muted tiny">No accepted mentorships yet.</span> : (
            <ul className="list" style={{ margin: 0, padding: 0 }}>
              {mentees.map((c) => (
                <li key={c.id} className="row row--flat" style={{ listStyle: 'none' }}>
                  <div>
                    <Link to={`/people/${c.person.id}`} style={{ fontWeight: 600 }}>{c.person.full_name}</Link>
                    <div className="muted tiny">{c.person.department ?? c.person.headline}</div>
                  </div>
                  <Link className="btn btn--ghost btn--sm" to={`/messages?to=${c.person.id}`}>Message</Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </aside>
    </div>
  );
}

export default function Home() {
  const { user } = useAuth();
  if (!user) return <Loading />;
  if (user.role === 'employer') return <EmployerHome user={user} />;
  if (user.role === 'admin') return <AdminHome user={user} />;
  if (user.role === 'mentor') return <MentorHome user={user} />;
  return <StudentHome user={user} />;
}
