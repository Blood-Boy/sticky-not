import React from "react";
import { api } from "./api.js";
import { THEMES, norm, makeImage } from "./lib.js";
import Home from "./Home.jsx";
import NoteView from "./NoteView.jsx";
import { Confirm, MoveModal, NameModal, ProfileModal, ShareModal } from "./modals.jsx";

export default function Shell({ user, onLogout }) {
  const [notes, setNotes] = React.useState([]);
  const [folders, setFolders] = React.useState([]);
  const [avatar, setAvatar] = React.useState(null);
  const [err, setErr] = React.useState("");

  const notesRef = React.useRef(notes);
  React.useLayoutEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  const timers = React.useRef({});
  const say = (m) => {
    setErr(m);
    setTimeout(() => setErr(""), 4000);
  };

  React.useEffect(() => {
    (async () => {
      try {
        const [n, f] = await Promise.all([api.getNotes(), api.getFolders()]);
        setNotes(n.map(norm));
        setFolders(f);
      } catch (e) {
        console.error(e);
        say("مقدرتش أجيب النوتس من السيرفر. اتأكد إنه شغال.");
      }
      api
        .me()
        .then((me) => setAvatar(me.avatar))
        .catch(() => {});
    })();
  }, []);

  const [hash, setHash] = React.useState(location.hash);
  React.useEffect(() => {
    const f = () => setHash(location.hash);
    addEventListener("hashchange", f);
    return () => removeEventListener("hashchange", f);
  }, []);

  const [ask, setAsk] = React.useState(null);
  const [img, setImg] = React.useState(null);
  const [mv, setMv] = React.useState(null);
  const [nm, setNm] = React.useState(null);
  const [prof, setProf] = React.useState(false);

  const m = hash.match(/^#\/n\/(.+)$/),
    fm = hash.match(/^#\/f\/(.+)$/);
  const note = m ? notes.find((n) => n.id === m[1]) : null;
  const folder = fm ? folders.find((f) => f.id === fm[1]) || null : null;
  const inRoot = (n) => !n.folder || !folders.some((f) => f.id === n.folder);
  const shown = folder ? notes.filter((n) => n.folder === folder.id) : notes.filter(inRoot);
  const count = (id) => notes.filter((n) => n.folder === id).length;

  const scheduleSave = (id, patch) => {
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(() => {
      delete timers.current[id];
      api.updateNote(id, patch).catch((e) => console.error("save note failed", e));
    }, 500);
  };

  const upd = (id, fn) => {
    setNotes((ns) => ns.map((n) => (n.id === id ? fn(n) : n)));
    const cur = notesRef.current.find((x) => x.id === id);
    if (cur) scheduleSave(id, fn(cur));
  };

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
      say("مقدرتش أنزل النوت. اتأكد إن السيرفر شغال.");
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
        console.error(e);
        say("مقدرتش أحذف النوت. جرّب تاني.");
      }
    } else {
      try {
        await api.removeFolder(a.id);
        setFolders((fs) => fs.filter((f) => f.id !== a.id));
        setNotes((ns) => ns.map((n) => (n.folder === a.id ? { ...n, folder: null } : n)));
        if (folder && folder.id === a.id) location.hash = "";
      } catch (e) {
        console.error(e);
        say("مقدرتش أحذف المجلد. جرّب تاني.");
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
        console.error(e);
        say("مقدرتش أخص اسم المجلد. جرّب تاني.");
      }
    } else {
      try {
        const f = await api.addFolder(v, ic);
        setFolders((fs) => [...fs, f]);
      } catch (e) {
        console.error(e);
        say("مقدرتش أنزل المجلد. جرّب تاني.");
      }
    }
  };

  const saveAvatar = async (a) => {
    setAvatar(a);
    await api.setAvatar(a).catch((e) => {
      console.error(e);
      say("مقدرتش أحفظ الصورة. جرّب تاني.");
    });
  };

  const share = async () => {
    if (!note) return;
    try {
      const b = await makeImage(note);
      if (b) setImg({ blob: b, url: URL.createObjectURL(b), name: "note-" + note.id + ".png", title: note.title });
    } catch (e) {
      console.error(e);
      say("مقدرتش أعمل صورة النوت.");
    }
  };

  const mvNote = mv ? notes.find((n) => n.id === mv) : null;

  return (
    <>
      {err && <p className="msg" style={{ textAlign: "center", padding: "6px 0" }}>{err}</p>}
      {note ? (
        <NoteView key={note.id} note={note} upd={upd} onAsk={(id) => setAsk({ t: "note", id })} onMove={setMv} onShare={share} />
      ) : (
        <Home
          notes={shown}
          folders={folder ? [] : folders}
          folder={folder}
          user={user}
          count={count}
          onAdd={add}
          avatar={avatar}
          onProfile={() => setProf(true)}
          onNewFolder={() => setNm({ init: "", icon: "📁" })}
          onAsk={(id) => setAsk({ t: "note", id })}
          onMove={setMv}
          onFolderAsk={(id) => setAsk({ t: "folder", id })}
          onFolderEdit={(f) => setNm({ id: f.id, init: f.name, icon: f.icon || "📁" })}
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
          folders={folders}
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
    </>
  );
}
