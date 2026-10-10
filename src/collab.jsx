import React from "react";
import { Modal, IB, Ic } from "./ui.jsx";
import Avatar from "./Avatar.jsx";
import { api } from "./api.js";

/* ── CollabModal: manage collaborators on a note or folder ── */
export function CollabModal({ kind, id, name, onClose, onChanged }) {
  const [tab, setTab] = React.useState("list"); // "list" | "invite"
  const [shares, setShares] = React.useState(null);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState([]);
  const [searching, setSearching] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [msg, setMsg] = React.useState("");

  const say = (m, ok) => {
    setMsg({ text: m, ok: !!ok });
    setTimeout(() => setMsg(""), 3500);
  };

  // Load current collaborators
  React.useEffect(() => {
    api.getShares(kind, id)
      .then(setShares)
      .catch(() => say("مقدرتش أجيب المشاركين"));
  }, [kind, id]);

  // Search users with debounce
  React.useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    setSearching(true);
    const t = setTimeout(() => {
      api.searchUsers(query)
        .then((r) => { setResults(r); setSearching(false); })
        .catch(() => { setSearching(false); });
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  const invite = async (username) => {
    setSending(true);
    try {
      await api.addShare(kind, id, username);
      say("اتبعت الدعوة لـ " + username + " ✓", true);
      setQuery("");
      setResults([]);
      // Refresh shares list
      const fresh = await api.getShares(kind, id);
      setShares(fresh);
      if (onChanged) onChanged();
    } catch (e) {
      const code = e.message;
      if (code === "alreadyshared") say("انت شارك معاه قبل كده");
      else if (code === "usernotfound") say("ما لقيناش اليوزر ده");
      else if (code === "selfshare") say("مش ممكن تشارك مع نفسك");
      else say("حصل مشكلة، جرب تاني");
    } finally {
      setSending(false);
    }
  };

  const revoke = async (shareId, username) => {
    try {
      await api.removeShare(shareId);
      setShares((s) => s.filter((x) => x.id !== shareId));
      say("اترجع الوصول من " + username, true);
      if (onChanged) onChanged();
    } catch {
      say("مقدرتش تلغي المشاركة");
    }
  };

  return (
    <Modal onClose={onClose}>
      <p className="q" style={{ marginBottom: 10 }}>
        {kind === "note" ? "📝 " : "📁 "}{name}
      </p>
      <div className="ctabs">
        <button className={"ctab" + (tab === "list" ? " active" : "")} onClick={() => setTab("list")}>
          المشاركون
        </button>
        <button className={"ctab" + (tab === "invite" ? " active" : "")} onClick={() => setTab("invite")}>
          دعوة جديدة
        </button>
      </div>

      {tab === "list" && (
        <div className="clist">
          {!shares && <p className="cmsg">جاري التحميل...</p>}
          {shares && shares.length === 0 && (
            <p className="cmsg muted">محدش شغال معاك عليها دلوقتي</p>
          )}
          {shares && shares.map((s) => (
            <div className="crow" key={s.id}>
              <Avatar src={s.invitee.avatar} name={s.invitee.username} size={34} />
              <div className="crinfo">
                <span className="crun">{s.invitee.username}</span>
                <span className={"crstatus " + s.status}>
                  {s.status === "pending" ? "في الانتظار" : s.status === "accepted" ? "محرر" : "رفض"}
                </span>
              </div>
              <button
                className="btn ic danger"
                title="إلغاء المشاركة"
                aria-label="إلغاء المشاركة"
                onClick={() => revoke(s.id, s.invitee.username)}
              >
                <Ic n="x" />
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === "invite" && (
        <div className="cinvite">
          <input
            className="nm"
            placeholder="ابحث باسم المستخدم..."
            value={query}
            autoFocus
            onInput={(e) => setQuery(e.target.value)}
          />
          {searching && <p className="cmsg muted">جاري البحث...</p>}
          {!searching && query.length >= 2 && results.length === 0 && (
            <p className="cmsg muted">ما لقيناش حد بالاسم ده</p>
          )}
          {results.map((u) => (
            <div className="crow" key={u.id}>
              <Avatar src={u.avatar} name={u.username} size={34} />
              <div className="crinfo">
                <span className="crun">{u.username}</span>
              </div>
              <button
                className="btn ic main"
                title={"دعوة " + u.username}
                aria-label={"دعوة " + u.username}
                disabled={sending}
                onClick={() => invite(u.username)}
              >
                <Ic n="userplus" />
              </button>
            </div>
          ))}
        </div>
      )}

      <p className={"cmsg" + (msg.ok ? " ok" : "")} style={{ minHeight: "1.4em", marginTop: 10 }}>
        {msg.text || ""}
      </p>
      <IB n="x" label="إغلاق" onClick={onClose} />
    </Modal>
  );
}

/* ── InboxModal: pending invites ── */
export function InboxModal({ onClose, onAnswered }) {
  const [items, setItems] = React.useState(null);
  const [busy, setBusy] = React.useState(null); // id being acted on
  const [msg, setMsg] = React.useState("");

  const say = (m) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };

  React.useEffect(() => {
    api.inbox()
      .then(setItems)
      .catch(() => say("مقدرتش أجيب الإشعارات"));
  }, []);

  const respond = async (id, accept) => {
    setBusy(id);
    try {
      await api.respond(id, accept);
      setItems((prev) => prev.map((x) => x.id === id ? { ...x, status: accept ? "accepted" : "declined" } : x));
      say(accept ? "قبلت الدعوة ✓" : "رفضت الدعوة");
      if (onAnswered) onAnswered();
    } catch (e) {
      if (e.message === "alreadyresponded") say("ردّيت عليها قبل كده");
      else say("حصل مشكلة، جرب تاني");
    } finally {
      setBusy(null);
    }
  };

  const pending = (items || []).filter((x) => x.status === "pending");
  const answered = (items || []).filter((x) => x.status !== "pending");

  return (
    <Modal onClose={onClose}>
      <p className="q" style={{ marginBottom: 10 }}>🔔 الإشعارات</p>
      {!items && <p className="cmsg muted">جاري التحميل...</p>}
      {items && items.length === 0 && <p className="cmsg muted">ما فيش إشعارات</p>}

      {pending.length > 0 && (
        <>
          <p className="csec">دعوات في الانتظار</p>
          {pending.map((item) => (
            <div className="crow inrow" key={item.id}>
              <Avatar src={item.owner.avatar} name={item.owner.username} size={34} />
              <div className="crinfo">
                <span className="crun">{item.owner.username}</span>
                <span className="crtarget">
                  {item.kind === "note" ? "📝 " : "📁 "}
                  {item.target ? item.target.name : "—"}
                </span>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  className="btn ic main"
                  title="قبول"
                  aria-label="قبول"
                  disabled={busy === item.id}
                  onClick={() => respond(item.id, true)}
                >
                  <Ic n="check" />
                </button>
                <button
                  className="btn ic danger"
                  title="رفض"
                  aria-label="رفض"
                  disabled={busy === item.id}
                  onClick={() => respond(item.id, false)}
                >
                  <Ic n="x" />
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      {answered.length > 0 && (
        <>
          <p className="csec muted">سابقة</p>
          {answered.map((item) => (
            <div className="crow" key={item.id} style={{ opacity: 0.65 }}>
              <Avatar src={item.owner.avatar} name={item.owner.username} size={28} />
              <div className="crinfo">
                <span className="crun">{item.owner.username}</span>
                <span className="crtarget">
                  {item.kind === "note" ? "📝 " : "📁 "}{item.target ? item.target.name : "—"}
                </span>
              </div>
              <span className={"crstatus " + item.status}>
                {item.status === "accepted" ? "قبلت" : "رفضت"}
              </span>
            </div>
          ))}
        </>
      )}

      <p className="cmsg" style={{ minHeight: "1.4em", marginTop: 8 }}>{msg}</p>
      <IB n="x" label="إغلاق" onClick={onClose} />
    </Modal>
  );
}
