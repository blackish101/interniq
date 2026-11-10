import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Avatar, Empty, ErrorNote, Loading, Note, Panel, Spinner, useAsync } from '../components.jsx';

const time = (d) => new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function Messages() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [list, setList] = useState(null);
  const [thread, setThread] = useState(null);
  const [draft, setDraft] = useState('');
  const [showList, setShowList] = useState(false);
  const bodyRef = useRef(null);
  const { busy, error, call, setError } = useAsync();

  // The URL owns the selection so that links from profiles and the applicants table open the same way a click does.
  const active = params.get('c') ? Number(params.get('c')) : null;

  const loadList = useCallback(async () => {
    const res = await api.get('/conversations');
    setList(res);
    return res;
  }, []);

  useEffect(() => { loadList().catch(() => setList({ conversations: [], total_unread: 0 })); }, [loadList]);

  useEffect(() => {
    if (!active) { setThread(null); return undefined; }
    setShowList(false);
    let live = true;
    api.get(`/conversations/${active}/messages`)
      .then((res) => { if (live) { setThread(res); loadList(); } })
      .catch((e) => { if (live) setError(e.message ?? String(e)); });
    return () => { live = false; };
  }, [active, loadList, setError]);

  useEffect(() => {
    const to = params.get('to');
    if (to && user) {
      api.post('/conversations', { with_user_id: Number(to), topic: 'Internship enquiry' })
        .then((res) => setParams({ c: String(res.conversation.id) }, { replace: true }))
        .catch((e) => setError(e.message ?? String(e)));
      setParams({}, { replace: true });
    }
  }, [params, user, setParams, setError]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [thread]);

  const send = (e) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || !active) return;
    setDraft('');
    call(async () => {
      const res = await api.post(`/conversations/${active}/messages`, { body });
      setThread((t) => ({ ...t, messages: [...t.messages, res.message] }));
      loadList();
    });
  };

  const conversations = useMemo(() => list?.conversations ?? [], [list]);

  return (
    <Panel
      title="Messages"
      sub="Direct messaging is a prototype extension — section 1.6.1 of the project document leaves it outside the initial scope"
      right={<span className="ext-badge">extension</span>}
      pad={false}
    >
      <div className="card__pad" style={{ paddingBottom: 0 }}>
        <ErrorNote error={error} />
        <Note tone="warn">
          Keep placement commitments in the application pipeline, not in chat: only application status changes create
          the records Career Services reports on.
        </Note>
      </div>

      {!list ? <Loading text="Loading inbox" /> : (
        <div className="chat" style={{ marginTop: '.8rem' }}>
          <div className={`chat__list ${showList ? 'is-open' : ''}`}>
            {conversations.length === 0 ? (
              <Empty
                title="No conversations"
                hint="Open a person's profile and choose Message."
                action={<Link className="btn btn--soft btn--sm mt" to="/people">Find people</Link>}
              />
            ) : conversations.map((c) => (
              <button
                type="button"
                key={c.id}
                className={`chat__item ${active === c.id ? 'is-active' : ''}`}
                onClick={() => setParams({ c: String(c.id) }, { replace: true })}
              >
                <Avatar name={c.other.full_name} color={c.other.avatar_color} size="sm" />
                <span style={{ minWidth: 0 }}>
                  <b className="row__title" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.other.full_name}
                  </b>
                  <span className="muted tiny" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.last_body ?? c.topic}
                  </span>
                  <span className="muted tiny">{c.other.role}{c.last_at ? ` · ${time(c.last_at)}` : ''}</span>
                </span>
                {c.unread > 0 && <em className="nav__dot" style={{ position: 'static' }}>{c.unread}</em>}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            {!active ? (
              <Empty title="Select a conversation" hint="Or start one from a person's profile." />
            ) : !thread ? (
              <div className="loading"><Spinner /></div>
            ) : (
              <>
                <header className="card__head">
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShowList((s) => !s)}>☰</button>
                  <Avatar name={thread.other.full_name} color={thread.other.avatar_color} size="sm" />
                  <div className="grow">
                    <Link to={`/people/${thread.other.id}`}><b>{thread.other.full_name}</b></Link>
                    <div className="muted tiny">{thread.other.headline || thread.other.role} · {thread.conversation.topic}</div>
                  </div>
                </header>

                <div className="chat__body" ref={bodyRef}>
                  {thread.messages.length === 0 && <p className="muted tiny">No messages yet — say hello.</p>}
                  {thread.messages.map((m) => (
                    <div key={m.id} className={`bubble ${m.mine ? 'bubble--mine' : 'bubble--theirs'}`}>
                      {m.body}
                      <time>{time(m.created_at)}</time>
                    </div>
                  ))}
                </div>

                <form className="chat__form" onSubmit={send}>
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={`Message ${thread.other.full_name.split(' ')[0]}…`}
                    aria-label="Message text"
                  />
                  <button type="submit" className="btn btn--primary" disabled={busy || !draft.trim()}>Send</button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}
