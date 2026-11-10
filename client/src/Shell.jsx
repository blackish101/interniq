import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { api } from './api.js';
import { useAuth } from './auth.jsx';
import { Avatar, Crest, Empty, Spinner } from './components.jsx';

const TABS = {
  student: [
    { to: '/', label: 'Home', icon: 'home', end: true },
    { to: '/internships', label: 'Opportunities', icon: 'briefcase' },
    { to: '/applications', label: 'Applications', icon: 'doc' },
    { to: '/people', label: 'People', icon: 'people' },
    { to: '/messages', label: 'Messages', icon: 'chat', ext: true },
  ],
  employer: [
    { to: '/', label: 'Home', icon: 'home', end: true },
    { to: '/employer/postings', label: 'Postings', icon: 'briefcase' },
    { to: '/employer/applicants', label: 'Applicants', icon: 'people' },
    { to: '/people', label: 'Browse students', icon: 'search' },
    { to: '/messages', label: 'Messages', icon: 'chat', ext: true },
  ],
  mentor: [
    { to: '/', label: 'Home', icon: 'home', end: true },
    { to: '/people', label: 'Students', icon: 'people' },
    { to: '/internships', label: 'Opportunities', icon: 'briefcase' },
    { to: '/messages', label: 'Messages', icon: 'chat', ext: true },
  ],
  admin: [
    { to: '/', label: 'Home', icon: 'home', end: true },
    { to: '/admin', label: 'Career Services', icon: 'chart' },
    { to: '/internships', label: 'Opportunities', icon: 'briefcase' },
    { to: '/people', label: 'People', icon: 'people' },
    { to: '/messages', label: 'Messages', icon: 'chat', ext: true },
  ],
};

const ICONS = {
  home: 'M3 10.5 12 3l9 7.5V21H14v-6h-4v6H3z',
  briefcase: 'M3 7h18v13H3zM8 7V4h8v3',
  doc: 'M6 2h9l4 4v16H6zM14 2v5h5',
  people: 'M8 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm-6 9c0-3.3 2.7-5 6-5s6 1.7 6 5m2-14a3 3 0 0 1 0 6m1.5 8c0-2.5-1-4-3-4.6',
  chat: 'M4 4h16v11H9l-5 4z',
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zm5 0 4 4',
  chart: 'M4 20V10m5 10V4m5 16v-7m5 7V8',
  bell: 'M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6m4 11a2.5 2.5 0 0 0 4 0',
};

const Svg = ({ d }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

function NotificationBell({ onCountChange }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(null);
  const [unread, setUnread] = useState(0);
  const boxRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/notifications');
      setItems(res.notifications);
      setUnread(res.unread);
      onCountChange?.(res.unread);
    } catch {
      setItems([]);
    }
  }, [onCountChange]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onDoc = (e) => { if (open && boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const markAll = async () => {
    await api.post('/notifications/read-all');
    load();
  };

  const markOne = async (n) => {
    await api.patch(`/notifications/${n.id}/read`);
    setItems((list) => list.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
    setUnread((u) => Math.max(0, u - 1));
    onCountChange?.(Math.max(0, unread - 1));
  };

  const rel = (d) => {
    const mins = Math.round((Date.now() - new Date(d).getTime()) / 60000);
    if (mins < 60) return `${Math.max(1, mins)}m ago`;
    if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
    return `${Math.round(mins / 1440)}d ago`;
  };

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className={`nav__tab ${open ? 'is-active' : ''}`}
        onClick={() => { setOpen((o) => !o); if (!open) load(); }}
        aria-label={`Notifications, ${unread} unread`}
        style={{ background: 'none', border: 0, cursor: 'pointer', font: 'inherit' }}
      >
        <Svg d={ICONS.bell} />
        <span>Alerts</span>
        {unread > 0 && <em className="nav__dot">{unread > 9 ? '9+' : unread}</em>}
      </button>

      {open && (
        <div className="card" style={{ position: 'absolute', right: 0, top: '105%', width: 'min(360px, 90vw)', maxHeight: '70vh', overflowY: 'auto', zIndex: 50, boxShadow: 'var(--shadow-2)' }}>
          <header className="card__head">
            <h3>Alerts</h3>
            <button type="button" className="btn btn--ghost btn--sm" onClick={markAll}>Mark all read</button>
          </header>
          {!items ? (
            <div className="loading"><Spinner /></div>
          ) : items.length === 0 ? (
            <Empty title="No alerts" hint="Deadlines, application moves and messages appear here." />
          ) : (
            <ul className="list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {items.slice(0, 25).map((n) => (
                <li key={n.id} className="row row--flat" style={{ padding: '.6rem .8rem', background: n.is_read ? undefined : 'var(--brand-light)' }}>
                  <button
                    type="button"
                    onClick={() => markOne(n)}
                    style={{ background: 'none', border: 0, textAlign: 'left', font: 'inherit', cursor: 'pointer', padding: 0 }}
                  >
                    <div className="row__title">{n.title}</div>
                    <div className="row__sub">{n.body}</div>
                    <div className="muted tiny">{n.kind} · {rel(n.created_at)}{n.is_read ? '' : ' · unread'}</div>
                  </button>
                  {n.link && <Link to={n.link} className="tiny nowrap" onClick={() => setOpen(false)}>open</Link>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default function Shell({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const tabs = TABS[user?.role] ?? TABS.student;

  const search = (e) => {
    e.preventDefault();
    if (!term.trim()) return;
    const to = user?.role === 'employer' ? '/people' : '/internships';
    navigate(`${to}?q=${encodeURIComponent(term.trim())}`);
  };

  const profileHref = { student: '/me', employer: '/employer/postings', admin: '/admin', mentor: '/people' }[user?.role] ?? '/me';

  return (
    <div className="app">
      <nav className="nav">
        <Link to="/" className="nav__brand">
          <Crest size={30} />
          <span className="brand__lock">
            <span className="brand__school">St. <em>Mary&rsquo;s</em> University</span>
            <span className="brand__product">InternIQ</span>
          </span>
        </Link>

        <form className="nav__search" onSubmit={search}>
          <Svg d={ICONS.search} />
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={user?.role === 'employer' ? 'Find students by name or skill' : 'Search internships and companies'}
            aria-label="Search"
          />
        </form>

        <div className="nav__tabs">
          {tabs.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `nav__tab ${isActive ? 'is-active' : ''}`}>
              <Svg d={ICONS[t.icon]} />
              <span>{t.label}</span>
              {t.ext && <em className="nav__dot" style={{ background: 'var(--ext-ink)' }}>ext</em>}
            </NavLink>
          ))}
          <NotificationBell />
          <div className="nav__me">
            <Link to={profileHref} title={user?.full_name}>
              <Avatar name={user?.full_name} color={user?.avatar_color} size="sm" />
            </Link>
          </div>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => { logout(); navigate('/login'); }}>
            Sign out
          </button>
        </div>
      </nav>

      <main className="shell">{children}</main>

      <footer className="footer">
        <p className="footer__motto">&ldquo;If education goes wrong, nothing can go right&rdquo;</p>
        <div className="footer__rule" />
        InternIQ prototype · St. Mary&apos;s University Career Services · AI-assisted internship matching
        <span className="muted"> — React, ASP.NET-style REST contract, PostgreSQL (embedded PGlite for the demo)</span>
      </footer>
    </div>
  );
}
