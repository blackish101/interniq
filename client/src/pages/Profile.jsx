import React, { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtDate } from '../api.js';
import {
  Distribution, Empty, ErrorNote, Field, Loading, Metric, Note, OkNote, Panel,
  ScoreDial, SkillTags, Tag, useAsync, useFetch,
} from '../components.jsx';

const DEPARTMENTS = [
  ['CS', 'Computer Science'], ['ACCG', 'Accounting'], ['MKTG', 'Marketing Management'],
  ['MGMT', 'Management'], ['TOUR', 'Tourism'], ['ECON', 'Economics'],
];

function toBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/* ---------------------------------------------------------------- CV ------ */
function CvStudio({ onDone }) {
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [chosen, setChosen] = useState({});
  const [manual, setManual] = useState('');
  const inputRef = useRef(null);
  const { busy, error, ok, call } = useAsync();

  const pick = async (f) => {
    setFile(f);
    setPreview(null);
    if (!f) return;
    if (/\.txt$|\.md$/i.test(f.name)) {
      setText(await f.text());
    } else {
      setText('');
    }
  };

  const runPreview = () => call(async () => {
    let body;
    if (file && !/\.txt$|\.md$/i.test(file.name)) {
      const buf = await file.arrayBuffer();
      body = { base64: toBase64(buf), filename: file.name, mime: file.type };
    } else if (file || text.trim()) {
      body = { text: text.trim(), filename: file?.name };
    } else {
      throw new Error('Paste your CV text or choose a .docx / .txt file first.');
    }
    const res = await api.post('/students/me/cv/preview', body);
    setPreview(res);
    setChosen(Object.fromEntries(res.skills.map((s) => [s.skill_id, s.level])));
    return res;
  });

  const commit = () => call(async () => {
    const skills = Object.entries(chosen)
      .filter(([, level]) => level > 0)
      .map(([skill_id, level]) => ({ skill_id: Number(skill_id), level }));
    const buf = file && !/\.txt$|\.md$/i.test(file.name) ? toBase64(await file.arrayBuffer()) : undefined;
    const res = await api.post('/students/me/cv/commit', {
      ...(buf ? { base64: buf, filename: file.name, mime: file.type } : { text, filename: file?.name }),
      skills,
    });
    onDone();
    return res;
  });

  const addManual = async () => {
    if (!manual.trim()) return;
    await call(async () => {
      await api.post('/students/me/skills', { skill: manual.trim(), level: 3 });
      setManual('');
      onDone();
    });
  };

  const accepted = preview ? Object.values(chosen).filter((v) => v > 0).length : 0;

  return (
    <>
      <Panel title="Upload or paste your CV" sub="The extractor reads the document; you approve what becomes profile evidence">
        <Note tone="info">
          Word <code>.docx</code>, plain text and Markdown are parsed. Scanned or image PDFs are a known limitation
          of the prototype - paste the text instead, or add skills by hand below.
        </Note>

        <div className="flex flex--wrap mt" style={{ alignItems: 'flex-end' }}>
          <div style={{ minWidth: 260 }}>
            <div className="card__title">Choose a file</div>
            <input ref={inputRef} type="file" accept=".docx,.txt,.md" onChange={(e) => pick(e.target.files[0])} />
          </div>
          <button type="button" className="btn btn--soft" onClick={runPreview} disabled={busy}>
            {busy ? 'Reading…' : 'Run the extractor'}
          </button>
          {preview && <Tag tone="ok">{preview.skills.length} skills recognised</Tag>}
        </div>

        <Field label="…or paste CV text" hint={file && /\.docx$/i.test(file.name) ? `Reading ${file.name} directly; this box is ignored.` : ''}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'Yonas Tesfaye\nBSc Computer Science, St. Mary\u2019s University\nSkills: Python, SQL, React, Django, Git\nProjects: library management system...'}
            style={{ minHeight: 150 }}
            disabled={Boolean(file && !/\.txt$|\.md$/i.test(file.name))}
          />
        </Field>
        {file && !text && <p className="hint">Selected <b>{file.name}</b> ({(file.size / 1024).toFixed(0)} KB).</p>}

        <ErrorNote error={error} />
        <OkNote>{ok}</OkNote>
      </Panel>

      {preview && (
        <>
          <Panel title="What the engine read" sub={`lexicon of ${preview.lexicon_size} skills · ${preview.metrics.words} words · ${preview.metrics.sections} sections detected`}>
            <div className="metrics mb">
              <Metric label="Unique skills" value={preview.metrics.unique_skills} />
              <Metric label="Categories touched" value={preview.metrics.category_spread} />
              <Metric label="Skills per 100 words" value={preview.metrics.skills_per_100_words} />
              <Metric label="CV quality" value={preview.metrics.quality} tone={preview.metrics.quality === 'strong' ? 'ok' : 'warn'} />
            </div>

            {preview.entities && (
              <div className="chips mb">
                {preview.entities.email && <Tag tone="brand">email {preview.entities.email}</Tag>}
                {preview.entities.phone && <Tag tone="brand">phone {preview.entities.phone}</Tag>}
                {preview.entities.gpa && <Tag tone="brand">GPA read from CV {preview.entities.gpa}</Tag>}
                {preview.entities.graduation_year && <Tag tone="brand">graduating {preview.entities.graduation_year}</Tag>}
              </div>
            )}

            <div className="card__title mb">Extracted skills — keep, adjust the level, or drop</div>
            <ul className="list" style={{ margin: 0, padding: 0 }}>
              {preview.skills.map((s) => (
                <li key={s.skill_id} className="row row--flat" style={{ listStyle: 'none' }}>
                  <div>
                    <b>{s.name}</b> <span className="muted tiny">· {s.category}</span>
                    <div className="muted tiny">
                      confidence {Math.round(s.confidence * 100)}% · {s.hits} mention{s.hits > 1 ? 's' : ''} in {s.sections.join(', ')}
                      {!s.verified ? ' · inferred from coursework only' : ''}
                    </div>
                    {s.evidence?.[0] && <div className="tiny" style={{ fontStyle: 'italic', color: 'var(--ink-2)', marginTop: '.2rem' }}>“{s.evidence[0]}”</div>}
                  </div>
                  <div className="flex">
                    <select
                      value={chosen[s.skill_id] ?? 0}
                      onChange={(e) => setChosen({ ...chosen, [s.skill_id]: Number(e.target.value) })}
                      style={{ width: 'auto' }}
                      aria-label={`Level for ${s.name}`}
                    >
                      <option value={0}>drop</option>
                      {[1, 2, 3, 4, 5].map((l) => <option key={l} value={l}>L{l}</option>)}
                    </select>
                  </div>
                </li>
              ))}
            </ul>

            {preview.unknown_candidates?.length > 0 && (
              <div className="mt">
                <div className="card__title">Not in the catalogue</div>
                <p className="hint">
                  These looked like tools or methods but no dictionary entry matched. If one is a real skill, add it
                  below so it becomes evidence - the extractor reports what it could not read instead of hiding it.
                </p>
                <div className="chips">
                  {preview.unknown_candidates.slice(0, 12).map((u) => (
                    <Tag key={typeof u === 'string' ? u : u.term} tone="warn">{typeof u === 'string' ? u : u.term}</Tag>
                  ))}
                </div>
              </div>
            )}

            <div className="btn__row mt">
              <button type="button" className="btn btn--primary" onClick={commit} disabled={busy || accepted === 0}>
                Save {accepted} skill{accepted === 1 ? '' : 's'} to my profile
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setPreview(null)}>Discard</button>
            </div>
            {accepted === 0 && <p className="hint mt">At least one skill must be kept.</p>}
          </Panel>
        </>
      )}

      <Panel title="Add a skill by hand">
        <div className="flex">
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addManual()}
            placeholder="e.g. Power BI, IFRS, SEO, Revenue management"
            aria-label="Skill name"
          />
          <button type="button" className="btn btn--soft" onClick={addManual} disabled={busy || !manual.trim()}>Add</button>
        </div>
        <p className="hint">Names must exist in the InternIQ skill catalogue ({preview?.lexicon_size ?? 151} entries) so postings and profiles can be compared.</p>
      </Panel>
    </>
  );
}

/* ------------------------------------------------------------- profile --- */
function ProfileForm({ me, onSaved }) {
  const [f, setF] = useState({
    full_name: me.user.full_name,
    headline: me.profile.headline ?? '',
    bio: me.profile.bio ?? '',
    city: me.profile.city ?? '',
    department_code: me.department?.code ?? 'CS',
    program: me.profile.program ?? 'regular',
    year_of_study: me.profile.year_of_study ?? 3,
    gpa: me.profile.gpa ?? '',
    phone: me.profile.phone ?? '',
    preferred_format: me.profile.preferred_format ?? 'hybrid',
    availability_hours: me.profile.availability_hours ?? 30,
    available_from: me.profile.available_from ?? '',
    linkedin: me.profile.linkedin ?? '',
    github: me.profile.github ?? '',
  });
  const [interests, setInterests] = useState(me.profile.interests ?? []);
  const [targets, setTargets] = useState(me.profile.target_roles ?? []);
  const [draft, setDraft] = useState('');
  const [draftRole, setDraftRole] = useState('');
  const { busy, error, ok, call } = useAsync();

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = () => call(async () => {
    await api.put('/students/me', {
      ...f,
      gpa: f.gpa === '' ? null : Number(f.gpa),
      year_of_study: Number(f.year_of_study),
      availability_hours: Number(f.availability_hours),
      interests,
      target_roles: targets,
    });
    onSaved();
  }, 'Profile saved and the matcher recalibrated.');

  return (
    <Panel title="Academic and contact details" sub="These feed the eligibility and logistics components of your score">
      <ErrorNote error={error} />
      <OkNote>{ok}</OkNote>
      <div className="grid-2">
        <Field label="Full name"><input value={f.full_name} onChange={set('full_name')} /></Field>
        <Field label="Headline" hint="One line employers see first.">
          <input value={f.headline} onChange={set('headline')} placeholder="BSc Computer Science student | Python & React" />
        </Field>
        <Field label="Department">
          <select value={f.department_code} onChange={set('department_code')}>
            {DEPARTMENTS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
          </select>
        </Field>
        <Field label="Programme">
          <select value={f.program} onChange={set('program')}>
            <option value="regular">Regular (day)</option>
            <option value="extension">Extension</option>
          </select>
        </Field>
        <Field label="Year of study">
          <select value={f.year_of_study} onChange={set('year_of_study')}>
            {[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>Year {y}</option>)}
          </select>
        </Field>
        <Field label="GPA" hint="Leave blank if not yet computed."><input type="number" step="0.01" min="0" max="4" value={f.gpa} onChange={set('gpa')} /></Field>
        <Field label="City"><input value={f.city} onChange={set('city')} /></Field>
        <Field label="Phone"><input value={f.phone} onChange={set('phone')} /></Field>
        <Field label="Preferred format">
          <select value={f.preferred_format} onChange={set('preferred_format')}>
            {['onsite', 'hybrid', 'remote'].map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </Field>
        <Field label="Hours available per week">
          <select value={f.availability_hours} onChange={set('availability_hours')}>
            {[15, 20, 25, 30, 35, 40].map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        </Field>
        <Field label="Available from"><input type="date" value={f.available_from} onChange={set('available_from')} /></Field>
        <Field label="LinkedIn URL"><input value={f.linkedin} onChange={set('linkedin')} /></Field>
      </div>
      <Field label="About you"><textarea value={f.bio} onChange={set('bio')} /></Field>

      <div className="grid-2">
        <Field label="Career interests" hint="Used by the affinity component of the score.">
          <div className="chips mb">
            {interests.map((x) => <span className="tag tag--brand" key={x}>{x}<span className="tag__remove" onClick={() => setInterests(interests.filter((y) => y !== x))}>×</span></span>)}
          </div>
          <div className="flex">
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="e.g. Data analytics" aria-label="Add interest"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (draft.trim()) { setInterests([...new Set([...interests, draft.trim()])]); setDraft(''); } } }} />
            <button type="button" className="btn btn--soft" onClick={() => { if (draft.trim()) { setInterests([...new Set([...interests, draft.trim()])]); setDraft(''); } }}>Add</button>
          </div>
        </Field>
        <Field label="Target roles">
          <div className="chips mb">
            {targets.map((x) => <span className="tag tag--brand" key={x}>{x}<span className="tag__remove" onClick={() => setTargets(targets.filter((y) => y !== x))}>×</span></span>)}
          </div>
          <div className="flex">
            <input value={draftRole} onChange={(e) => setDraftRole(e.target.value)} placeholder="e.g. Junior backend developer" aria-label="Add target role"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (draftRole.trim()) { setTargets([...new Set([...targets, draftRole.trim()])]); setDraftRole(''); } } }} />
            <button type="button" className="btn btn--soft" onClick={() => { if (draftRole.trim()) { setTargets([...new Set([...targets, draftRole.trim()])]); setDraftRole(''); } }}>Add</button>
          </div>
        </Field>
      </div>

      <button type="button" className="btn btn--primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button>
    </Panel>
  );
}

/* ---------------------------------------------------------------- page --- */
export default function Profile() {
  const [tab, setTab] = useState('profile');
  const me = useFetch('/students/me');
  const recs = useFetch('/students/me/recommendations');

  const reloadAll = () => { me.reload(); recs.reload(); };

  const data = me.data;
  const skills = useMemo(() => data?.skills ?? [], [data]);

  if (me.loading && !data) return <Loading text="Loading your profile" />;
  if (me.error) return <Panel title="Signed in as a different role"><ErrorNote error={me.error} /><Link className="btn btn--soft btn--sm" to="/">Back to home</Link></Panel>;

  const byCategory = skills.reduce((acc, s) => ({ ...acc, [s.category]: [...(acc[s.category] ?? []), s] }), {});

  return (
    <div className="cols">
      <div className="stack">
        <Panel pad={false}>
          <div className="hero">
            <div className="flex flex--top" style={{ gap: '1rem' }}>
              <span className="avatar avatar--lg" style={{ '--color': data.user.avatar_color ?? '#fff', background: data.user.avatar_color ?? '#fff' }}>
                {data.user.full_name.split(' ').slice(0, 2).map((w) => w[0]).join('')}
              </span>
              <div className="grow">
                <h1>{data.user.full_name}</h1>
                <p>{data.profile.headline || `${data.department?.name ?? ''} student`}</p>
                <div className="hero__meta">
                  <span className="hero__chip">{data.department?.name}</span>
                  <span className="hero__chip">Year {data.profile.year_of_study}</span>
                  <span className="hero__chip">{data.profile.program}</span>
                  {data.profile.gpa ? <span className="hero__chip">GPA {data.profile.gpa}</span> : null}
                  <span className="hero__chip">{skills.length} skills</span>
                  <span className="hero__chip">{data.stats.applications} applications</span>
                </div>
              </div>
            </div>
          </div>
          <div className="card__pad">
            <div className="tabs" style={{ marginBottom: 0 }}>
              {[['profile', 'Profile'], ['cv', 'CV and skills'], ['fit', 'Fit summary']].map(([k, l]) => (
                <button type="button" key={k} className={tab === k ? 'is-active' : ''} onClick={() => setTab(k)}>{l}</button>
              ))}
            </div>
            {recs.data && (
              <div className="flex flex--between mt">
                <div className="grow">
                  <div className="flex flex--between tiny mb"><b>Profile completeness</b><span>{recs.data.profile_complete_pct}%</span></div>
                  <div className="progress"><div style={{ width: `${recs.data.profile_complete_pct}%` }} /></div>
                </div>
              </div>
            )}
          </div>
        </Panel>

        {tab === 'profile' && <ProfileForm me={data} onSaved={reloadAll} />}

        {tab === 'cv' && <CvStudio onDone={reloadAll} />}

        {tab === 'fit' && recs.data && (
          <>
            <Panel title="Readiness for the 40-day internship">
              <ul className="list" style={{ margin: 0, padding: 0 }}>
                {recs.data.readiness.map((r) => (
                  <li key={r.key} className="row row--flat" style={{ listStyle: 'none' }}>
                    <div>
                      <b>{r.label}</b>
                      <div className="muted tiny">{r.done ? 'Ready' : r.hint}</div>
                    </div>
                    <Tag tone={r.done ? 'ok' : 'warn'}>{r.done ? 'done' : 'to do'}</Tag>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title="How your matches are distributed" sub={`${recs.data.distribution.total} postings scored`}>
              <Distribution distribution={recs.data.distribution} />
              <div className="btn__row mt">
                <Link className="btn btn--soft btn--sm" to="/internships?sort=match">See ranked board</Link>
              </div>
            </Panel>

            {recs.data.ineligible?.length > 0 && (
              <Panel title="Blocked by eligibility, not by fit" sub="Shown so you can see what you are missing rather than hiding it">
                <ul className="list" style={{ margin: 0, padding: 0 }}>
                  {recs.data.ineligible.map((r) => (
                    <li key={r.internship_id} className="row row--flat" style={{ listStyle: 'none' }}>
                      <div>
                        <Link to={`/internships/${r.internship_id}`} className="row__title" style={{ display: 'block' }}>{r.title}</Link>
                        <div className="muted tiny">{r.company} · {r.gaps.slice(0, 2).join('; ')}</div>
                      </div>
                      <ScoreDial value={r.score} />
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
          </>
        )}

        {tab === 'fit' && !recs.data && <Loading text="Scoring every posting against your profile" />}
      </div>

      <aside className="stack">
        <Panel title="Skill evidence" sub={`${skills.length} recorded · level 1 (coursework) to 5 (professional)`}>
          {skills.length === 0
            ? <Empty title="No skills yet" hint="Upload your CV in the CV tab." />
            : Object.entries(byCategory).map(([cat, list]) => (
              <div key={cat} className="mb">
                <div className="card__title">{cat}</div>
                <div className="chips" style={{ marginTop: '.3rem' }}>
                  <SkillTags skills={list} max={20} />
                </div>
              </div>
            ))}
          {skills.length > 0 && <p className="hint">Levels are estimated from how often and in which sections the CV mentions each skill.</p>}
        </Panel>

        <Panel title="Documents on file" pad={false}>
          <div className="card__pad">
            {(data.documents ?? []).length === 0
              ? <span className="muted tiny">No submissions recorded yet.</span>
              : (
                <ul className="list" style={{ margin: 0, padding: 0 }}>
                  {data.documents.map((d, idx) => (
                    <li key={d.id ?? idx} className="row row--flat" style={{ listStyle: 'none' }}>
                      <div>
                        <b>{d.filename}</b>
                        <div className="muted tiny">{d.kind} · {fmtDate(d.uploaded_at)} · {d.status}</div>
                      </div>
                      <Tag tone={d.status === 'approved' ? 'ok' : 'warn'}>{d.status}</Tag>
                    </li>
                  ))}
                </ul>
              )}
          </div>
        </Panel>

        <Panel title="Your record">
          <div className="metrics">
            <Metric label="Applications" value={data.stats.applications} />
            <Metric label="Offers" value={data.stats.offers} tone={data.stats.offers ? 'ok' : undefined} />
            <Metric label="Awaiting reply" value={data.stats.pending} />
            <Metric label="Connections" value={data.stats.connections} />
          </div>
          <p className="hint mt">Matriculation no. <code>{data.profile.student_id}</code> · {data.profile.graduation_year ? `graduating ${data.profile.graduation_year}` : ''}</p>
        </Panel>
      </aside>
    </div>
  );
}
