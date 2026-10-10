import React from "react";
import { api } from "./api.js";
import { THEMES, norm, makeImage } from "./lib.js";
import Home from "./Home.jsx";
import NoteView from "./NoteView.jsx";
import { Confirm, MoveModal, NameModal, ProfileModal, ShareModal } from "./modals.jsx";
import { CollabModal, InboxModal } from "./collab.jsx";

const POLL_MS = 6000;       // normal poll interval
const POLL_FAST_MS = 3000;  // when a shared note is open
const SAVE_MS = 500;        // debounce before save

export default function Shell({ user, onLogout }) {
  const [notes, setNotes] = React.useState([]);
  const [folders, setFolders] = React.useState([]);
  const [avatar, setAvatar] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [inboxCount, setInboxCount] = React.useState(0);

  const notesRef = React.useRef(notes);
  React.useLayoutEffect(() => { notesRef.current = notes; }, [notes]);

  const timers = React.useRef({});
  const syncTs = React.useRef(null);    // last sync timestamp
  const pollTimer = React.useRef(null);
  const dirty = React.useRef({});       // noteId → base blocks snapshot

  const say = (m) => {
    setErr(m);
    setTimeout(() => setErr(""), 4000);
  };

  // ── Initial load ──
  React.useEffect(() => {
    (async () => {
      try {
        const [n, f] = await Promise.all([api.getNotes(), api.getFolders()]);
        setNotes(n.map(norm));
        setFolders(f);
        syncTs.current = new Date().toISOString();
      } catch (e) {
        console.error(e);
        say("مقدرتش أجيب النوتس. اتأكد إن السيرفر شغال.");
      }
      api.me().then((me) => setAvatar(me.avatar)).catch(() => {});
      // inbox badge
      api.inbox().then((items) => {
        setInboxCount((items || []).filter((x) => x.status === "pending").length);
      }).catch(() => {});
    })();
  }, []);

  // ── Hash / routing ──
  const [hash, setHash] = React.useState(location.hash);
  React.useEffect(() => {
    const f = () => setHash(location.hash);
    addEventListener("hashchange", f);
    return () => removeEventListener("hashchange", f);
  }, []);

  const m = hash.match(/^#\/n\/(.+)$/), fm = hash.match(/^#\/f\/(.+)$/);
  const note = m ? notes.find((n) => n.id === m[1]) : null;
  const folder = fm ? folders.find((f) => f.id === fm[1]) || null : null;
  const inRoot = (n) => !n.folder || !folders.some((f) => f.id === n.folder);
  const shown = folder ? notes.filter((n) => n.folder === folder.id) : notes.filter(inRoot);
  const count = (id) => notes.filter((n) => n.folder === id).length;

  // ── Polling sync ──
  const isSharedNote = note && note.role === "editor";

  const doSync = React.useCallback(async () => {
    try {
      const since = syncTs.current;
      const { notes: updated, ts } = await api.sync(since);
      syncTs.current = ts;
      if (updated && updated.length > 0) {
        setNotes((prev) => {
          const map = new Map(prev.map((n) => [n.id, n]));
          const incoming = [];
          for (const n of updated) {
            const existing = map.get(n.id);
            if (!existing) {
              // New shared note appeared
              incoming.push(norm(n));
            } else {
              // Only update if server version is newer and note isn't being edited
              const isDirtyLocally = !!dirty.current[n.id];
              if (!isDirtyLocally && n.version > (existing.version || 0)) {
                map.set(n.id, norm(n));
              }
            }
          }
          if (incoming.length > 0) {
            incoming.forEach((n) => map.set(n.id, n));
          }
          return Array.from(map.values());
        });
      }
    } catch (e) {
      // Silent - sync failures don't need UI noise
      console.warn("sync failed", e.message);
    }
  }, []);

  React.useEffect(() => {
    const interval = isSharedNote ? POLL_FAST_MS : POLL_MS;
    const tick = () => {
      doSync();
      pollTimer.current = setTimeout(tick, interval);
    };
    // Start after initial delay
    pollTimer.current = setTimeout(tick, interval);

    const onVisible = () => {
      if (!document.hidden) {
        doSync();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearTimeout(pollTimer.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isSharedNote, doSync]);

  // ── Modals ──
  const [ask, setAsk] = React.useState(null);
  const [img, setImg] = React.useState(null);
  const [mv, setMv] = React.useState(null);
  const [nm, setNm] = React.useState(null);
  const [prof, setProf] = React.useState(false);
  const [collab, setCollab] = React.useState(null);  // { kind, id, name }
  const [inbox, setInbox] = React.useState(false);

  // ── Save ──
  const scheduleSave = (id, patch) => {
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(async () => {
      delete timers.current[id];
      delete dirty.current[id];
      try {
        const updated = await api.updateNote(id, patch);
        // Update version from server response
        if (updated && updated.version) {
          setNotes((ns) => ns.map((n) => n.id === id ? { ...n, version: updated.version } : n));
        }
      } catch (e) {
        console.error("save note failed", e);
      }
    }, SAVE_MS);
  };

  const upd = (id, fn) => {
    setNotes((ns) => ns.map((n) => (n.id === id ? fn(n) : n)));
    const cur = notesRef.current.find((x) => x.id === id);
    if (cur) {
      const next = fn(cur);
      dirty.current[id] = true;
      scheduleSave(id, next);
    }
  };

  // ── CRUD ──
  const add = async () => {
    const n = {
      title: "",
      folder: folder ? folder.id : null,
      theme: notes.length % THEMES.length,
      blocks: [],
    };
    try {
      const created = await api.addNote(n);
      setNotes((ns) => [created, ...ns]);
      location.hash = "#/n/" + created.id;
    } catch (e) {
      console.error(e);
      say("مقدرتش أنزل النوت.");
    }
  };

  const del = async () => {
    const a = ask;
    setAsk(null);
    if (a.t === "note") {
      try {
        await api.removeNote(a.id);
        setNotes((ns) => ns.filter((n) => n.id !== a.id));
        if (note && note.id === a.id) location.hash = note.folder ? "#/f/" + note.folder : "";
      } catch (e) {
        say("مقدرتش أحذف النوت.");
      }
    } else {
      try {
        await api.removeFolder(a.id);
        setFolders((fs) => fs.filter((f) => f.id !== a.id));
        setNotes((ns) => ns.map((n) => (n.folder === a.id ? { ...n, folder: null } : n)));
        if (folder && folder.id === a.id) location.hash = "";
      } catch (e) {
        say("مقدرتش أحذف المجلد.");
      }
    }
  };

  const moveTo = (dest) => {
    const id = mv;
    setMv(null);
    upd(id, (n) => ({ ...n, folder: dest }));
  };

  const saveName = async (v, ic) => {
    const item = nm;
    setNm(null);
    if (item.id) {
      try {
        await api.updateFolder(item.id, { name: v, icon: ic });
        setFolders((fs) => fs.map((f) => (f.id === item.id ? { ...f, name: v, icon: ic } : f)));
      } catch (e) {
        say("مقدرتش أحفظ اسم المجلد.");
      }
    } else {
      try {
        const f = await api.addFolder(v, ic);
        setFolders((fs) => [...fs, f]);
      } catch (e) {
        say("مقدرتش أنزل المجلد.");
      }
    }
  };

  const saveAvatar = async (a) => {
    setAvatar(a);
    await api.setAvatar(a).catch(() => say("مقدرتش أحفظ الصورة."));
  };

  const shareImg = async () => {
    if (!note) return;
    try {
      const b = await makeImage(note);
      if (b) setImg({ blob: b, url: URL.createObjectURL(b), name: "note-" + note.id + ".png", title: note.title });
    } catch (e) {
      say("مقدرتش أعمل صورة النوت.");
    }
  };

  const openCollab = (kind, id, name) => setCollab({ kind, id, name });

  const mvNote = mv ? notes.find((n) => n.id === mv) : null;

  // Split notes for Home view
  const myNotes = shown.filter((n) => !n.role || n.role === "owner");
  const sharedNotes = shown.filter((n) => n.role === "editor");
  const myFolders = folders.filter((f) => !f.role || f.role === "owner");
  const sharedFolders = folders.filter((f) => f.role === "editor");

  return (
    <>
      {err && <p className="msg" style={{ textAlign: "center", padding: "6px 0" }}>{err}</p>}
      {note ? (
        <NoteView
          key={note.id}
          note={note}
          upd={upd}
          onAsk={(id) => setAsk({ t: "note", id })}
          onMove={setMv}
          onShare={shareImg}
          onCollab={() => openCollab("note", note.id, note.title || "نوت بدون اسم")}
        />
      ) : (
        <Home
          notes={shown}
          myNotes={myNotes}
          sharedNotes={sharedNotes}
          folders={folder ? [] : myFolders}
          sharedFolders={folder ? [] : sharedFolders}
          folder={folder}
          user={user}
          count={count}
          onAdd={add}
          avatar={avatar}
          inboxCount={inboxCount}
          onProfile={() => setProf(true)}
          onInbox={() => setInbox(true)}
          onNewFolder={() => setNm({ init: "", icon: "📁" })}
          onAsk={(id) => setAsk({ t: "note", id })}
          onMove={setMv}
          onFolderAsk={(id) => setAsk({ t: "folder", id })}
          onFolderEdit={(f) => setNm({ id: f.id, init: f.name, icon: f.icon || "📁" })}
          onCollab={openCollab}
          onLogout={onLogout}
        />
      )}

      {ask && (
        <Confirm
          text={ask.t === "note" ? "تحذف النوت دي نهائياً؟" : "تحذف المجلد ده؟ النوتس اللي جواه هترجع للرئيسية."}
          yes={ask.t === "note" ? "احذف" : "احذف المجلد"}
          onYes={del}
          onNo={() => setAsk(null)}
        />
      )}
      {mv && (
        <MoveModal
          folders={folders.filter((f) => !f.role || f.role === "owner")}
          current={mvNote && !inRoot(mvNote) ? mvNote.folder : null}
          onPick={moveTo}
          onClose={() => setMv(null)}
        />
      )}
      {nm && (
        <NameModal
          title={nm.id ? "غيّر اسم المجلد" : "مجلد جديد"}
          init={nm.init}
          icon={nm.icon}
          onSave={saveName}
          onClose={() => setNm(null)}
        />
      )}
      {prof && <ProfileModal user={user} avatar={avatar} onSave={saveAvatar} onClose={() => setProf(false)} />}
      {img && <ShareModal img={img} onClose={() => setImg(null)} />}
      {collab && (
        <CollabModal
          kind={collab.kind}
          id={collab.id}
          name={collab.name}
          onClose={() => setCollab(null)}
          onChanged={() => {
            // refresh inbox badge
            api.inbox().then((items) => {
              setInboxCount((items || []).filter((x) => x.status === "pending").length);
            }).catch(() => {});
          }}
        />
      )}
      {inbox && (
        <InboxModal
          onClose={() => setInbox(false)}
          onAnswered={async () => {
            // Reload everything after accepting/declining
            setInboxCount(0);
            try {
              const [n, f] = await Promise.all([api.getNotes(), api.getFolders()]);
              setNotes(n.map(norm));
              setFolders(f);
              syncTs.current = new Date().toISOString();
              const items = await api.inbox();
              setInboxCount((items || []).filter((x) => x.status === "pending").length);
            } catch (e) {
              console.error(e);
            }
          }}
        />
      )}
    </>
  );
}
