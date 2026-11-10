import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Avatar, Crest, Field, Loading, Note, useAsync } from '../components.jsx';

const ROLE_ORDER = { student: 1, employer: 2, admin: 3, mentor: 4 };

const PITCH = [
  'Skills extracted from your CV with an NLP pipeline, not typed into a form',
  'Compatibility scored against real posting requirements, with the maths shown',
  'Department eligibility, GPA and year rules checked before you apply',
  'Career Services sees every application and placement in one register',
];

export default function Login() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState('login');
  const [demo, setDemo] = useState(null);
  const [form, setForm] = useState({ email: '', password: '' });
  const [signup, setSignup] = useState({ role: 'student', email: '', full_name: '', password: '', company_name: '', department_code: 'CS', year_of_study: 3 });
  const { busy, error, ok, setError, call } = useAsync();

  useEffect(() => {
    api.get('/auth/demo-accounts').then(setDemo).catch(() => setDemo({ password: '', accounts: [] }));
  }, []);

  const accounts = useMemo(() => (demo?.accounts ?? []).slice().sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]), [demo]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setS = (k) => (e) => setSignup((s) => ({ ...s, [k]: e.target.value }));

  const oneClick = (email) => call(async () => {
    await login(email, demo.password);
    navigate(location.state?.from ?? '/', { replace: true });
  });

  const submitLogin = (e) => {
    e.preventDefault();
    call(async () => {
      await login(form.email, form.password);
      navigate(location.state?.from ?? '/', { replace: true });
    });
  };

  const submitRegister = (e) => {
    e.preventDefault();
    call(async () => {
      await register(signup);
      navigate('/', { replace: true });
    });
  };

  return (
    <div className="login-page">
      <div className="login">
        <aside className="login__aside">
          <div className="login__crest">
            <Crest size={52} />
            <div className="brand__stack">
              <span className="brand__school">St. <em>Mary&rsquo;s</em> University</span>
              <span className="brand__am">ቅድስት ማርያም ዩኒቨርሲቲ</span>
              <span className="brand__tagline">Committed to Excellence</span>
            </div>
          </div>
          <h1 style={{ marginTop: '1.1rem' }}>Find the internship that actually fits you.</h1>
          <p>
            An AI-assisted career and internship matching platform for St. Mary&apos;s University.
            Students upload a CV, the engine reads it, and every posting gets a compatibility score
            you can interrogate - not a black box.
          </p>
          <ul className="login__list">
            {PITCH.map((p) => <li key={p}><span aria-hidden="true">✓</span><span>{p}</span></li>)}
          </ul>
          <p className="login__motto">&ldquo;If education goes wrong, nothing can go right&rdquo;</p>
          <p className="tiny" style={{ marginTop: '1.1rem', opacity: .8 }}>
            Prototype for the senior project. Data is fictional sample data generated for the demonstration.
          </p>
        </aside>

        <div className="login__form">
          <div className="tabs" style={{ marginBottom: '.9rem' }}>
            <button type="button" className={mode === 'login' ? 'is-active' : ''} onClick={() => { setMode('login'); setError(null); }}>Sign in</button>
            <button type="button" className={mode === 'register' ? 'is-active' : ''} onClick={() => { setMode('register'); setError(null); }}>Create account</button>
          </div>

          {error && <Note tone="err">{error}</Note>}
          {ok && <Note tone="ok">{ok}</Note>}

          {mode === 'login' ? (
            <>
              <form onSubmit={submitLogin}>
                <Field label="University email">
                  <input type="email" value={form.email} onChange={set('email')} placeholder="you@student.msu.edu.et" required autoComplete="username" />
                </Field>
                <Field label="Password">
                  <input type="password" value={form.password} onChange={set('password')} placeholder="••••••••" required autoComplete="current-password" />
                </Field>
                <button className="btn btn--primary btn--block" type="submit" disabled={busy}>
                  {busy ? <Loading text="" /> : 'Sign in'}
                </button>
              </form>

              <div className="divider" />

              <div className="flex flex--between mb">
                <div>
                  <div className="card__title">Demo accounts</div>
                  <div className="hint">One click signs you in with password <code>{demo?.password ?? '…'}</code></div>
                </div>
              </div>

              {!demo ? (
                <Loading text="Loading demo accounts" />
              ) : (
                <div className="demo-accounts">
                  {accounts.map((a) => (
                    <button type="button" key={a.email} className="demo-account" onClick={() => oneClick(a.email)} disabled={busy}>
                      <Avatar name={a.name} size="sm" />
                      <span>
                        <b>{a.name}</b>
                        <div className="muted tiny">{a.note}</div>
                        <div className="muted tiny" style={{ wordBreak: 'break-all' }}>{a.email}</div>
                      </span>
                      <span className="tag tag--brand">{a.role}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <form onSubmit={submitRegister}>
              <Field label="I am a">
                <select value={signup.role} onChange={setS('role')}>
                  <option value="student">Student (internship-eligible)</option>
                  <option value="employer">Employer / company contact</option>
                  <option value="mentor">Alumni mentor</option>
                </select>
              </Field>
              <div className="grid-2">
                <Field label="Full name">
                  <input value={signup.full_name} onChange={setS('full_name')} required placeholder="Abel Bekele" />
                </Field>
                <Field label="Email">
                  <input type="email" value={signup.email} onChange={setS('email')} required placeholder="name@example.com" />
                </Field>
              </div>
              <Field label="Password" hint="At least 8 characters.">
                <input type="password" value={signup.password} onChange={setS('password')} required minLength={8} />
              </Field>

              {signup.role === 'student' && (
                <div className="grid-2">
                  <Field label="Department">
                    <select value={signup.department_code} onChange={setS('department_code')}>
                      {['CS', 'ACCG', 'MKTG', 'MGMT', 'TOUR', 'ECON'].map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </Field>
                  <Field label="Year of study">
                    <select value={signup.year_of_study} onChange={setS('year_of_study')}>
                      {[2, 3, 4].map((y) => <option key={y} value={y}>Year {y}</option>)}
                    </select>
                  </Field>
                </div>
              )}

              {signup.role === 'employer' && (
                <>
                  <Field label="Company name">
                    <input value={signup.company_name} onChange={setS('company_name')} required placeholder="Ethio Telecom" />
                  </Field>
                  <Note tone="warn">
                    Career Services verifies every employer before a posting goes live - the same control the
                    paper process has, moved into the system.
                  </Note>
                </>
              )}

              <button className="btn btn--primary btn--block" type="submit" disabled={busy}>
                {busy ? <Loading text="" /> : 'Create account'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
