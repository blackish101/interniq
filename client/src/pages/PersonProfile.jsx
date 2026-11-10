import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import {
  Avatar, ErrorNote, Field, Loading, Metric, Modal, Note, Panel,
  ScoreBar, ScoreDial, SkillTags, StatusTag, Tag, useAsync, useFetch,
} from '../components.jsx';

const ROLE_LABEL = { student: 'Student', employer: 'Employer', mentor: 'Alumnus / mentor', admin: 'Career Services' };

export default function PersonProfile() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, error, loading } = useFetch(`/people/${id}`);
  const compat = useFetch(`/people/${id}/compatibility`, { guard: user?.role === 'student' });
  const detailed = useFetch(`/students/${id}`, { guard: data?.person?.role === 'student' && ['employer', 'admin'].includes(user?.role) });

  const [connectOpen, setConnectOpen] = useState(false);
  const [note, setNote] = useState('');
  const [kind, setKind] = useState('network');
  const { busy, error: actError, call } = useAsync();

  if (loading && !data) return <Loading text="Loading profile" />;
  if (error) return <Panel title="Not found"><ErrorNote error={error} /></Panel>;

  const p = data.person;
  const skills = data.skills ?? [];
  const isMe = p.id === user?.id;

  const sendRequest = () => call(async () => {
    await api.post('/connections', { to_user_id: p.id, kind, note });
    setConnectOpen(false);
    navigate('/people?tab=requests');
  });

  const message = () => call(async () => {
    const res = await api.post('/conversations', { with_user_id: p.id, topic: p.role === 'mentor' ? 'Mentorship' : 'Internship enquiry' });
    navigate(`/messages?c=${res.conversation.id}`);
  });

  return (
    <div className="cols">
      <div className="stack">
        <Panel pad={false}>
          <div className="hero">
            <div className="flex flex--top" style={{ gap: '1rem' }}>
              <Avatar name={p.full_name} color={p.avatar_color} size="lg" />
              <div className="grow">
                <h1>{p.full_name}</h1>
                <p>{p.headline || `${p.company ?? ''} ${p.department ?? ''}`}</p>
                <div className="hero__meta">
                  <span className="hero__chip">{ROLE_LABEL[p.role] ?? p.role}</span>
                  {p.company && <span className="hero__chip">{p.company}</span>}
                  {p.seniority && <span className="hero__chip">{p.seniority}</span>}
                  {p.years_experience != null && <span className="hero__chip">{p.years_experience} years experience</span>}
                  {p.department && <span className="hero__chip">{p.department}</span>}
                  {p.year_of_study && <span className="hero__chip">Year {p.year_of_study}</span>}
                  {p.gpa && <span className="hero__chip">GPA {p.gpa}</span>}
                  {p.city && <span className="hero__chip">{p.city}</span>}
                  {p.alma_mater && <span className="hero__chip">{p.alma_mater}</span>}
                </div>
              </div>
            </div>
          </div>

          <div className="card__pad">
            <div className="btn__row mb">
              {isMe ? <Tag tone="brand">This is you</Tag> : null}
              {!isMe && data.relation?.status === 'accepted' && (
                <>
                  <Tag tone="ok">Connected · {data.relation.kind}</Tag>
                  <button type="button" className="btn btn--primary btn--sm" onClick={message} disabled={busy}>Message</button>
                </>
              )}
              {!isMe && data.relation?.status === 'pending' && <Tag tone="warn">Request pending</Tag>}
              {!isMe && (!data.relation || data.relation.status === 'declined') && (
                <>
                  <button type="button" className="btn btn--primary btn--sm" onClick={() => setConnectOpen(true)}>
                    {p.role === 'mentor' && user?.role === 'student' ? 'Request mentorship' : 'Connect'}
                  </button>
                  <button type="button" className="btn btn--soft btn--sm" onClick={message} disabled={busy}>Message</button>
                </>
              )}
            </div>
            <ErrorNote error={actError} />

            {p.bio && <p>{p.bio}</p>}

            {p.focus_areas?.length > 0 && (
              <>
                <div className="card__title">Advises on</div>
                <div className="chips mb"><SkillTags skills={p.focus_areas} /></div>
              </>
            )}
            {p.interests?.length > 0 && (
              <>
                <div className="card__title">Interested in</div>
                <div className="chips mb"><SkillTags skills={p.interests} /></div>
              </>
            )}
            {p.open_to?.length > 0 && (
              <>
                <div className="card__title">Open to</div>
                <div className="chips mb">{p.open_to.map((o) => <Tag key={o} tone="brand">{o}</Tag>)}</div>
              </>
            )}

            <div className="divider" />
            <div className="card__title">Skills {skills.length ? `(${skills.length})` : ''}</div>
            <div className="chips mt"><SkillTags skills={skills} max={30} /></div>
          </div>
        </Panel>

        {compat.data && (
          <Panel title="Mentor compatibility" sub="Shared skills, topic overlap and their weekly capacity" right={<ScoreDial value={compat.data.score} />}>
            {compat.data.components.map((c) => (
              <ScoreBar key={c.label} label={c.label} score={c.score} detail={c.detail} />
            ))}
            <p className="hint mt">
              {compat.data.shared_skills.length
                ? `You already share ${compat.data.shared_skills.length} skills: ${compat.data.shared_skills.slice(0, 8).join(', ')}.`
                : 'No skill overlap recorded - a mentor from a different field can still be useful.'}
            </p>
          </Panel>
        )}

        {detailed.data && (
          <>
            <Panel title="Academic record" sub="Visible to employers and Career Services">
              <div className="metrics">
                <Metric label="Year" value={detailed.data.profile.year_of_study ?? '—'} />
                <Metric label="GPA" value={detailed.data.profile.gpa ?? '—'} />
                <Metric label="Programme" value={detailed.data.profile.program ?? '—'} />
                <Metric label="CV on file" value={detailed.data.profile.has_cv ? 'yes' : 'no'} />
              </div>
              <dl className="kv mt">
                <dt>Department</dt><dd>{detailed.data.student.department}</dd>
                <dt>City</dt><dd>{detailed.data.profile.city ?? '—'}</dd>
                <dt>Availability</dt><dd>{detailed.data.profile.availability_hours ?? '—'} h/week</dd>
                <dt>Preferred format</dt><dd>{detailed.data.profile.preferred_format ?? '—'}</dd>
              </dl>
            </Panel>

            {detailed.data.applications?.length > 0 && (
              <Panel title="Application history" pad={false}>
                <div className="scroll-x">
                  <table className="table">
                    <thead><tr><th>Posting</th><th>Company</th><th>Score</th><th>Status</th></tr></thead>
                    <tbody>
                      {detailed.data.applications.map((a, i) => (
                        <tr key={`${a.id}-${i}`}>
                          <td>{a.title}</td>
                          <td>{a.company}</td>
                          <td>{a.match_score == null ? '—' : `${Number(a.match_score)}%`}</td>
                          <td><StatusTag status={a.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            )}
          </>
        )}
      </div>

      <aside className="stack">
        <Panel title="At a glance">
          <div className="metrics">
            <Metric label="Skills listed" value={skills.length} />
            <Metric label="Shared links" value={data.shared_connections} />
          </div>
          <ul className="tiny mt" style={{ paddingLeft: '1.1rem', color: 'var(--ink-2)' }}>
            <li>{data.shared_connections} shared connection{data.shared_connections === 1 ? '' : 's'} with you</li>
            {p.availability_hours ? <li>Offers {p.availability_hours} hours per week</li> : <li>No stated weekly capacity</li>}
            {p.city && <li>Based in {p.city}</li>}
          </ul>
        </Panel>

        {!isMe && user?.role === 'student' && (
          <Panel title="Ask for mentorship">
            <p className="hint">
              A mentorship request is a separate connection kind from a network request, so Career Services can tell
              advising relationships apart from ordinary contact.
            </p>
            <button type="button" className="btn btn--soft btn--block mt" onClick={() => { setKind('mentorship'); setConnectOpen(true); }}>
              Request mentorship
            </button>
          </Panel>
        )}

        <Panel title="Privacy">
          <p className="hint">
            Students&apos; raw CV text is never shown to employers. They see extracted skills with levels, academic
            standing and the stored match breakdown; contact details stay with Career Services, who coordinates the
            introduction once an employer shortlists.
          </p>
          <Link className="btn btn--ghost btn--sm mt" to="/me">Open my own profile</Link>
        </Panel>
      </aside>

      {connectOpen && (
        <Modal
          title={`Connect with ${p.full_name}`}
          onClose={() => setConnectOpen(false)}
          foot={
            <div className="btn__row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn--ghost" onClick={() => setConnectOpen(false)}>Cancel</button>
              <button type="button" className="btn btn--primary" onClick={sendRequest} disabled={busy}>Send request</button>
            </div>
          }
        >
          <Field label="Type of connection">
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="network">Network contact</option>
              {p.role === 'mentor' && <option value="mentorship">Mentorship</option>}
            </select>
          </Field>
          <Field label="Note" hint="Say why - requests with a note get accepted far more often.">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={`Hello ${p.full_name.split(' ')[0]}, I am a ${ROLE_LABEL[user.role]} at St. Mary's and I would value your advice on…`} />
          </Field>
          <Note tone="warn">Messaging after connecting is part of the extension feature set, outside the documented scope.</Note>
        </Modal>
      )}
    </div>
  );
}
