import React from "react";
import { api } from "./api.js";
import { THEMES, norm, makeImage, uid } from "./lib.js";
import Home from "./Home.jsx";
import NoteView from "./NoteView.jsx";
import { Confirm, MoveModal, NameModal, ProfileModal, ShareModal } from "./modals.jsx";
import { CollabModal, InboxModal } from "./collab.jsx";
import Tracker from "./Tracker.jsx";
import { readCache, writeCache } from "./cache.js";
import Accounts from "./Accounts.jsx";
import { afterFailure, afterSuccess, enqueue, loadQueue, markHead, newId, overlay, saveQueue } from "./outbox.js";

const POLL_MS = 6000;       // normal poll interval
const POLL_FAST_MS = 3000;  // when a shared note is open
const SAVE_MS = 500;        // debounce before save
const RETRY_MS = 15000;     // retry a queued change after a failed send

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
  const syncing = React.useRef(false);  // a sync request is in flight
  const dirty = React.useRef({});       // noteId → base blocks snapshot

  const say = (m) => {
    setErr(m);
    setTimeout(() => setErr(""), 4000);
  };

  // ── Offline queue: writes wait here until the server has them ──
  const queueRef = React.useRef(null);
  if (queueRef.current === null) queueRef.current = loadQueue(user);
  const [pending, setPending] = React.useState(() => queueRef.current.length);
  const [online, setOnline] = React.useState(() => navigator.onLine !== false);
  const flushing = React.useRef(false);
  const flushAgain = React.useRef(false);
  const retryTimer = React.useRef(null);

  const persistQueue = (q) => {
    queueRef.current = q;
    saveQueue(user, q);
    setPending(q.length);
  };

  // Calls the server for one queued op. Failures are tagged with a kind for afterFailure().
  const sendOp = async (op) => {
    try {
      switch (op.t) {
        case "note.add": return await api.addNote(op.data);
        case "note.patch": return await api.updateNote(op.id, op.patch);
        case "note.del": return await api.removeNote(op.id);
        case "folder.add": return await api.addFolder(op.data.name, op.data.icon, op.id);
        case "folder.patch": return await api.updateFolder(op.id, op.patch);
        case "folder.del": return await api.removeFolder(op.id);
        default: return null;
      }
    } catch (e) {
      const c = (e && e.message) || "";
      if (c === "notfound" && op.t.endsWith(".del")) return null;   // already gone
      const err = new Error(c);
      err.kind =
        c === "network" ? "offline"
        : c === "unauthorized" ? "auth"
        : c === "server" || /^http5/.test(c) ? "server"
        : "rejected";
      throw err;
    }
  };

  const applyResult = (op, result) => {
    if (result && result.version && op.t.startsWith("note.")) {
      setNotes((ns) => ns.map((n) => (n.id === op.id ? { ...n, version: result.version } : n)));
    }
  };

  // Sends queued changes one at a time, oldest first.
  const runFlush = async () => {
    if (flushing.current) {
      flushAgain.current = true;
      return;
    }
    flushing.current = true;
    try {
      do {
        flushAgain.current = false;
        while (queueRef.current.length) {
          persistQueue(markHead(queueRef.current));
          const op = queueRef.current[0];
          try {
            const result = await sendOp(op);
            applyResult(op, result);
            setOnline(true);
            persistQueue(afterSuccess(queueRef.current));
          } catch (e) {
            const r = afterFailure(queueRef.current, e);
            persistQueue(r.queue);
            if (r.stop === "offline") setOnline(false);
            if (r.stop) {
              clearTimeout(retryTimer.current);
              retryTimer.current = setTimeout(runFlush, RETRY_MS);
              return;
            }
          }
        }
      } while (flushAgain.current);
    } finally {
      flushing.current = false;
    }
  };

  const flushSoon = () => {
    clearTimeout(retryTimer.current);
    runFlush();
  };

  const commit = (op) => {
    persistQueue(enqueue(queueRef.current, op));
    flushSoon();
  };

  // Loads notes and folders from the server, then shows pending local changes on top.
  const loadAll = async () => {
    const syncedAt = new Date().toISOString();
    const [n, f] = await Promise.all([api.getNotes(), api.getFolders()]);
    writeCache(user, { notes: n, folders: f });
    const o = overlay({ notes: n.map(norm), folders: f }, queueRef.current);
    setNotes((prev) => {
      const keep = new Map(prev.filter((x) => dirty.current[x.id]).map((x) => [x.id, x]));
      return o.notes.map((x) => keep.get(x.id) || x);
    });
    setFolders(o.folders);
    syncTs.current = syncedAt;
    setOnline(true);
  };

  // ── Initial load ──
  React.useEffect(() => {
    // Paint the last snapshot right away, with pending local changes on top.
    const cached = readCache(user);
    if (cached) {
      const o = overlay({ notes: cached.notes.map(norm), folders: cached.folders }, queueRef.current);
      setNotes(o.notes);
      setFolders(o.folders);
    }
    (async () => {
      try {
        await loadAll();
      } catch (e) {
        if (e && e.message === "network") {
          setOnline(false);
        } else {
          console.error(e);
          if (!cached) say("مقدرتش أجيب النوتس. اتأكد إن السيرفر شغال.");
        }
      }
      flushSoon();
      api.me().then((me) => setAvatar(me.avatar)).catch(() => {});
      // inbox badge
      api.inbox().then((items) => {
        setInboxCount((items || []).filter((x) => x.status === "pending").length);
      }).catch(() => {});
    })();

    const goOnline = () => {
      setOnline(true);
      doSync();
      flushSoon();
    };
    const goOffline = () => setOnline(false);
    addEventListener("online", goOnline);
    addEventListener("offline", goOffline);
    return () => {
      removeEventListener("online", goOnline);
      removeEventListener("offline", goOffline);
      clearTimeout(retryTimer.current);
    };
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
    if (syncing.current) return;   // one poll at a time
    syncing.current = true;
    try {
      const since = syncTs.current;
      const { notes: updated, ts } = await api.sync(since);
      syncTs.current = ts;
      setOnline(true);
      if (queueRef.current.length) flushSoon();
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
          // Pending local changes stay on top of what the server sent.
          return overlay({ notes: Array.from(map.values()), folders: [] }, queueRef.current).notes;
        });
      }
    } catch (e) {
      // Silent - sync failures don't need UI noise
      if (e && e.message === "network") setOnline(false);
      console.warn("sync failed", e && e.message);
    } finally {
      syncing.current = false;
    }
  }, []);

  React.useEffect(() => {
    const interval = isSharedNote ? POLL_FAST_MS : POLL_MS;
    const tick = () => {
      // A hidden tab does not poll; it syncs once when it becomes visible again.
      if (!document.hidden) doSync();
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
  const [cp, setCp] = React.useState(null);  // note id being copied
  const [nm, setNm] = React.useState(null);
  const [prof, setProf] = React.useState(false);
  const [collab, setCollab] = React.useState(null);  // { kind, id, name }
  const [inbox, setInbox] = React.useState(false);

  // ── Save ──
  // Edits are shown at once and queued; the timer only batches fast typing.
  const scheduleSave = (id, patch) => {
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(() => {
      delete timers.current[id];
      delete dirty.current[id];
      commit({
        t: "note.patch",
        id,
        patch: { title: patch.title, theme: patch.theme, folder: patch.folder, blocks: patch.blocks },
      });
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

  // ── CRUD ── (works offline: the change is shown and queued)
  const add = () => {
    const id = newId();
    const n = norm({
      id,
      title: "",
      folder: folder ? folder.id : null,
      theme: notes.length % THEMES.length,
      version: 1,
      role: "owner",
      blocks: [],
    });
    setNotes((ns) => [n, ...ns]);
    commit({ t: "note.add", id, data: n });
    location.hash = "#/n/" + id;
  };

  const del = () => {
    const a = ask;
    setAsk(null);
    if (a.t === "note") {
      commit({ t: "note.del", id: a.id });
      setNotes((ns) => ns.filter((n) => n.id !== a.id));
      if (note && note.id === a.id) location.hash = note.folder ? "#/f/" + note.folder : "";
    } else {
      commit({ t: "folder.del", id: a.id });
      setFolders((fs) => fs.filter((f) => f.id !== a.id));
      setNotes((ns) => ns.map((n) => (n.folder === a.id ? { ...n, folder: null } : n)));
      if (folder && folder.id === a.id) location.hash = "";
    }
  };

  // Makes an independent copy of a note in the chosen folder (or the root).
  // The copy goes through the offline queue like any new note.
  const copyTo = (dest) => {
    const id = cp;
    setCp(null);
    const src = notesRef.current.find((x) => x.id === id);
    if (!src) return;
    const nid = newId();
    const sameFolder = (dest || null) === (src.folder || null);
    const copy = norm({
      id: nid,
      title: sameFolder && src.title ? src.title + " (نسخة)" : src.title,
      folder: dest || null,
      theme: src.theme,
      version: 1,
      role: "owner",
      blocks: src.blocks.map((b) => ({ ...b, id: uid() })),
    });
    setNotes((ns) => [copy, ...ns]);
    commit({ t: "note.add", id: nid, data: copy });
    const target = dest ? (folders.find((f) => f.id === dest) || {}).name || "المجلد" : "الرئيسية";
    say("اتعملت نسخة في " + target);
  };

  const moveTo = (dest) => {
    const id = mv;
    setMv(null);
    upd(id, (n) => ({ ...n, folder: dest }));
  };

  const saveName = (v, ic) => {
    const item = nm;
    setNm(null);
    if (item.id) {
      commit({ t: "folder.patch", id: item.id, patch: { name: v, icon: ic } });
      setFolders((fs) => fs.map((f) => (f.id === item.id ? { ...f, name: v, icon: ic } : f)));
    } else {
      const id = newId();
      const f = { id, name: v, icon: ic, role: "owner" };
      setFolders((fs) => [...fs, f]);
      commit({ t: "folder.add", id, data: { name: v, icon: ic } });
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
      {(!online || pending > 0) && (
        <p className="msg" role="status" style={{ textAlign: "center", padding: "6px 0" }}>
          {!online
            ? "مفيش نت. التغييرات محفوظة على الجهاز وهتترفع أول ما النت يرجع."
            : "بنرفع التغييرات (" + pending + ")..."}
        </p>
      )}
      {err && <p className="msg" style={{ textAlign: "center", padding: "6px 0" }}>{err}</p>}
      {note ? (
        <NoteView
          key={note.id}
          note={note}
          upd={upd}
          onAsk={(id) => setAsk({ t: "note", id })}
          onMove={setMv}
          onCopy={setCp}
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
          onCopy={setCp}
          onFolderAsk={(id) => setAsk({ t: "folder", id })}
          onFolderEdit={(f) => setNm({ id: f.id, init: f.name, icon: f.icon || "📁" })}
          onCollab={openCollab}
          onLogout={onLogout}
          tab={hash === "#/w" ? "work" : hash === "#/a" ? "accounts" : "notes"}
          onTab={(t) => {
            location.hash = t === "work" ? "#/w" : t === "accounts" ? "#/a" : "";
          }}
          tracker={<Tracker user={user} />}
          accounts={<Accounts user={user} />}
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
      {cp && (
        <MoveModal
          copy
          folders={folders.filter((f) => !f.role || f.role === "owner")}
          current={null}
          onPick={copyTo}
          onClose={() => setCp(null)}
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
              await loadAll();
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
