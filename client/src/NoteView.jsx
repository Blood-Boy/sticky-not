import React from "react";
import { THEMES, grad, uid, SIG } from "./lib.js";
import { IB, Ic, TA } from "./ui.jsx";

export default function NoteView({ note, upd, onAsk, onShare, onMove }) {
  const focus = React.useRef(null);
  const fref = (id) => (e) => {
    if (e && focus.current === id) {
      focus.current = null;
      e.focus();
    }
  };
  const set = (fn) => upd(note.id, (n) => ({ ...n, ...fn(n) }));
  const setB = (id, p) =>
    set((n) => ({ blocks: n.blocks.map((b) => (b.id === id ? { ...b, ...p } : b)) }));
  const addB = (k, after) => {
    const b = { id: uid(), k, t: "", d: false };
    focus.current = b.id;
    set((n) => {
      const i = after ? n.blocks.findIndex((x) => x.id === after) + 1 : n.blocks.length;
      const a = n.blocks.slice();
      a.splice(i, 0, b);
      return { blocks: a };
    });
  };
  const rm = (id, back) => {
    const i = note.blocks.findIndex((x) => x.id === id);
    if (back && i > 0) focus.current = note.blocks[i - 1].id;
    set((n) => ({ blocks: n.blocks.filter((x) => x.id !== id) }));
  };
  const flip = (b) => {
    focus.current = b.id;
    setB(b.id, { k: b.k === "c" ? "p" : "c", d: false });
  };
  return (
    <div>
      <div className="bar">
        <IB
          n="back"
          label="رجوع"
          onClick={() => {
            location.hash = note.folder ? "#/f/" + note.folder : "";
          }}
        />
        <span className="sp"></span>
        <div className="sw">
          {THEMES.map((t, i) => (
            <button
              key={i}
              aria-pressed={note.theme === i}
              aria-label={"لون " + (i + 1)}
              style={{ background: grad(i) }}
              onClick={() => set(() => ({ theme: i }))}
            ></button>
          ))}
        </div>
      </div>
      <article className="sheet" style={{ background: grad(note.theme) }}>
        <input
          className="ttl"
          placeholder="اسم الموضوع"
          value={note.title}
          onInput={(e) => set(() => ({ title: e.target.value }))}
        />
        {note.blocks.map((b) =>
          b.k === "c" ? (
            <div className="blk" key={b.id}>
              <input
                type="checkbox"
                checked={b.d}
                aria-label="تم"
                onChange={(e) => setB(b.id, { d: e.target.checked })}
              />
              <input
                className="bt"
                placeholder="عنصر"
                value={b.t}
                ref={fref(b.id)}
                onInput={(e) => setB(b.id, { t: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addB("c", b.id);
                  } else if (e.key === "Backspace" && !b.t) {
                    e.preventDefault();
                    rm(b.id, true);
                  }
                }}
              />
              <button className="mini" title="حوّل لكتابة عادية" aria-label="حوّل لكتابة عادية" onClick={() => flip(b)}>
                <Ic n="text" s={18} />
              </button>
              <button className="mini" title="احذف" aria-label="احذف" onClick={() => rm(b.id)}>
                <Ic n="x" s={18} />
              </button>
            </div>
          ) : (
            <div className="blk" key={b.id}>
              <TA value={b.t} r={fref(b.id)} onInput={(e) => setB(b.id, { t: e.target.value })} />
              <button className="mini" title="حوّل لعنصر قائمة" aria-label="حوّل لعنصر قائمة" onClick={() => flip(b)}>
                <Ic n="list" s={18} />
              </button>
              <button className="mini" title="احذف" aria-label="احذف" onClick={() => rm(b.id)}>
                <Ic n="x" s={18} />
              </button>
            </div>
          )
        )}
        <div className="addbar">
          <button title="عنصر قائمة" aria-label="عنصر قائمة" onClick={() => addB("c")}>
            <Ic n="plus" s={16} />
            <Ic n="list" s={18} />
          </button>
          <button title="كتابة" aria-label="كتابة" onClick={() => addB("p")}>
            <Ic n="plus" s={16} />
            <Ic n="text" s={18} />
          </button>
        </div>
        <div className="sig" dir="ltr">
          {SIG}
        </div>
      </article>
      <div className="bar" style={{ marginTop: 16 }}>
        <IB c="main" n="share" label="شارك كصورة" onClick={onShare} />
        <IB n="move" label="انقل لمكان تاني" onClick={() => onMove(note.id)} />
        <span className="sp"></span>
        <IB c="danger" n="trash" label="احذف النوت" onClick={() => onAsk(note.id)} />
      </div>
    </div>
  );
}
