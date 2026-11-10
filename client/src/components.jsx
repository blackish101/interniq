import React, { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';

/* ------------------------------------------------------------------ */
/* data loading                                                        */
/* ------------------------------------------------------------------ */

/** Fetch a JSON endpoint once and expose {data, error, loading, reload}. */
export function useFetch(path, { guard } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [nonce, setNonce] = useState(0);

  const run = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (guard === false) return undefined;
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    const request = path == null ? Promise.resolve(null) : api.get(path);
    request
      .then((d) => alive && setState({ data: d, error: null, loading: false }))
      .catch((e) => alive && setState({ data: null, error: e, loading: false }));
    return () => { alive = false; };
  }, [path, guard, nonce]);

  return { ...state, reload: run };
}

export function useAsync() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(null);

  const call = useCallback(async (fn, successMessage) => {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const out = await fn();
      if (successMessage) setOk(successMessage);
      return out;
    } catch (e) {
      setError(e.message ?? String(e));
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, error, ok, setError, call };
}

/* ------------------------------------------------------------------ */
/* visuals                                                             */
/* ------------------------------------------------------------------ */

export const scoreColor = (v) => {
  const n = Number(v ?? 0);
  if (n >= 80) return 'var(--success)';
  if (n >= 65) return 'var(--brand)';
  if (n >= 45) return 'var(--warn)';
  return 'var(--danger)';
};

export const scoreVerdict = (v) => {
  const n = Number(v ?? 0);
  if (n >= 80) return 'strong fit';
  if (n >= 65) return 'good fit';
  if (n >= 45) return 'partial fit';
  return 'weak fit';
};

const initials = (name = '?') =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

/**
 * St. Mary's University crest, drawn as SVG from the emblem on smuc.edu.et:
 * red shield, gold border, rising sun with rays, open book.
 * A prototype rendition, not the university's licensed artwork file.
 */
export function Crest({ size = 34 }) {
  return (
    <svg className="crest" viewBox="0 0 64 76" width={size} height={Math.round(size * 76 / 64)}
      role="img" aria-label="St. Mary's University crest">
      <path d="M32 3 58 11v27c0 18-12 30-26 35C18 68 6 56 6 38V11L32 3z"
        fill="var(--brand)" stroke="var(--gold)" strokeWidth="3" strokeLinejoin="round" />
      <path d="M32 14V8M22.5 17.5l-4-4.5M41.5 17.5l4-4.5M14 27H8M50 27h6"
        stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M23 30a9 9 0 0 1 18 0z" fill="var(--gold)" />
      <path d="M15 40c6-3 12-3 17 1 5-4 11-4 17-1v16c-6-3-12-3-17 1-5-4-11-4-17-1z"
        fill="#fff" stroke="var(--brand-dark)" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M32 41v16" stroke="var(--brand-dark)" strokeWidth="1.4" />
    </svg>
  );
}

export function Avatar({ name, color, size = '', role }) {
  return (
    <span
      className={`avatar ${size ? `avatar--${size}` : ''}`}
      style={{ '--color': color ?? 'var(--brand)' }}
      title={name}
      aria-label={name}
    >
      {role === 'employer' ? initials(name) : initials(name)}
    </span>
  );
}

export function ScoreDial({ value, hero = false, label }) {
  const v = Number(value ?? 0);
  return (
    <span
      className={`score ${hero ? 'score--hero' : ''}`}
      style={{ '--pct': v, '--sc': scoreColor(v) }}
      title={label ?? `${v}% compatible`}
    >
      <span>{Math.round(v)}</span>
    </span>
  );
}

export function ScoreBar({ label, score, detail, weight }) {
  return (
    <div className="bar" title={detail ?? ''}>
      <span className="bar__label">
        {label}
        {weight != null && <span className="muted tiny"> · w{Math.round(weight * 100)}%</span>}
      </span>
      <span className="bar__track">
        <span className="bar__fill" style={{ width: `${Math.max(2, Math.min(100, Number(score ?? 0)))}%`, background: scoreColor(score) }} />
      </span>
      <span className="bar__value">{Math.round(Number(score ?? 0))}</span>
    </div>
  );
}

export function Tag({ children, tone, title, onClick }) {
  return (
    <span
      className={`tag tag--${tone ?? 'line'}`}
      title={title}
      onClick={onClick}
      style={onClick ? { cursor: 'pointer' } : undefined}
    >
      {children}
    </span>
  );
}

export function SkillTags({ skills = [], max = 12, onRemove }) {
  const shown = skills.slice(0, max);
  if (!shown.length) return <span className="muted tiny">No skills recorded yet.</span>;
  return (
    <span className="chips">
      {shown.map((s) => {
        const name = typeof s === 'string' ? s : s.name;
        const level = typeof s === 'string' ? null : s.level;
        return (
          <span className="tag tag--brand" key={name} title={level ? `Skill level ${level} of 5` : name}>
            {name}
            {level ? <b className="tiny">&nbsp;L{level}</b> : null}
            {onRemove && <span className="tag__remove" onClick={() => onRemove(s)} aria-label={`Remove ${name}`}>×</span>}
          </span>
        );
      })}
      {skills.length > max && <span className="tag">+{skills.length - max} more</span>}
    </span>
  );
}

export function Panel({ title, sub, right, children, pad = true, foot }) {
  return (
    <section className="card">
      {(title || right) && (
        <header className="card__head">
          <div className="grow">
            <h3>{title}</h3>
            {sub && <div className="muted tiny">{sub}</div>}
          </div>
          {right}
        </header>
      )}
      <div className={pad ? 'card__pad' : ''}>{children}</div>
      {foot && <footer className="card__foot">{foot}</footer>}
    </section>
  );
}

export function Metric({ label, value, tone, hint }) {
  return (
    <div className={`metric ${tone ? `metric--${tone}` : ''}`}>
      <div className="metric__value">{value}</div>
      <div className="metric__label">{label}</div>
      {hint && <div className="muted tiny" style={{ marginTop: '.3rem' }}>{hint}</div>}
    </div>
  );
}

export function Modal({ title, onClose, children, foot, width }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-back" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal" style={width ? { maxWidth: width } : undefined} onClick={(e) => e.stopPropagation()}>
        <header className="modal__head">
          <h3 className="grow">{title}</h3>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="card__pad">{children}</div>
        {foot && <footer className="card__foot">{foot}</footer>}
      </div>
    </div>
  );
}

export const Spinner = () => <span className="spinner" aria-label="Loading" />;

export const Loading = ({ text = 'Loading' }) => (
  <div className="loading">
    <Spinner />
    <span className="muted tiny">{text}</span>
  </div>
);

export function ErrorNote({ error }) {
  if (!error) return null;
  return (
    <div className="notice notice--err mb" role="alert">
      {error.message ?? error}
      {error.details?.flags?.length ? <div className="tiny">Flags: {error.details.flags.join(', ')}</div> : null}
    </div>
  );
}

export function OkNote({ children }) {
  if (!children) return null;
  return <div className="notice notice--ok mb">{children}</div>;
}

export function Empty({ title = 'Nothing here yet', hint, action }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {hint && <p className="tiny">{hint}</p>}
      {action}
    </div>
  );
}

/**
 * Small badge that states whether a feature is inside the scope written in the
 * project document (§1.6) or an addition made for this prototype.
 */
export function ScopeBadge({ kind }) {
  return kind === 'extension'
    ? <span className="ext-badge" title="Added for the prototype; outside the documented scope in section 1.6.1">extension</span>
    : <span className="doc-badge" title="Traced to the project document">in scope</span>;
}

export function Note({ tone = 'info', children }) {
  return <div className={`notice notice--${tone}`}>{children}</div>;
}

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

export function Breakdown({ breakdown = [], reasons = [], gaps = [], flags = [] }) {
  return (
    <div>
      {breakdown.map((b) => (
        <ScoreBar key={b.key} label={b.label} score={b.score} weight={b.weight} detail={b.detail} />
      ))}
      {(reasons.length > 0 || gaps.length > 0) && (
        <div className="grid-2 mt">
          <div>
            <div className="card__title">Why this score</div>
            <ul className="tiny">
              {reasons.length ? reasons.map((r) => <li key={r}>{r}</li>) : <li className="muted">No positive signals found.</li>}
            </ul>
          </div>
          <div>
            <div className="card__title">What is missing</div>
            <ul className="tiny">
              {gaps.length ? gaps.map((g) => <li key={g}>{g}</li>) : <li className="muted">Nothing blocking - the profile meets the stated criteria.</li>}
            </ul>
          </div>
        </div>
      )}
      {flags.length > 0 && (
        <div className="chips mt">
          {flags.map((f) => <Tag key={f} tone="warn">{f.replace(/_/g, ' ')}</Tag>)}
        </div>
      )}
    </div>
  );
}

export function Distribution({ distribution }) {
  const d = distribution ?? {};
  const total = Math.max(1, d.total ?? 0);
  const rows = [
    { label: '80% and above', n: d.above_80 ?? 0, tone: 'var(--success)' },
    { label: '60 - 79%', n: d.between_60_79 ?? 0, tone: 'var(--brand)' },
    { label: 'below 60%', n: d.below_60 ?? 0, tone: 'var(--warn)' },
  ];
  return (
    <div>
      {rows.map((r) => (
        <div className="bar" key={r.label}>
          <span className="bar__label">{r.label}</span>
          <span className="bar__track">
            <span className="bar__fill" style={{ width: `${(r.n / total) * 100}%`, background: r.tone }} />
          </span>
          <span className="bar__value">{r.n}</span>
        </div>
      ))}
    </div>
  );
}

export const STATUS_TONE = {
  submitted: 'brand',
  under_review: 'warn',
  shortlisted: 'warn',
  accepted: 'ok',
  completed: 'ok',
  rejected: 'danger',
  withdrawn: 'line',
  pending: 'warn',
  verified: 'ok',
};

export function StatusTag({ status }) {
  return <Tag tone={STATUS_TONE[status] ?? 'line'}>{String(status ?? 'unknown').replace(/_/g, ' ')}</Tag>;
}
