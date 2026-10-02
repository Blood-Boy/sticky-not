import React from "react";
import { Modal, IB, Ic } from "./ui.jsx";
import Avatar from "./Avatar.jsx";
import { ICONS, readAvatar } from "./lib.js";

export function Confirm({ text, yes, onYes, onNo }) {
  return (
    <Modal onClose={onNo}>
      <p className="q">{text}</p>
      <div className="bar" style={{ justifyContent: "center", margin: 0 }}>
        <button
          className="btn ic dangerfill"
          autoFocus
          title={yes || "احذف"}
          aria-label={yes || "احذف"}
          onClick={onYes}
        >
          <Ic n="trash" />
        </button>
        <IB n="x" label="إلغاء" onClick={onNo} />
      </div>
    </Modal>
  );
}

export function NameModal({ title, init, icon, onSave, onClose }) {
  const [v, setV] = React.useState(init || "");
  const [ic, setIc] = React.useState(icon || "📁");
  const ok = v.trim().length > 0;
  return (
    <Modal onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) onSave(v.trim().slice(0, 40), ic);
        }}
      >
        <p className="q">{title}</p>
        <div className="icons">
          {ICONS.map((i) => (
            <button
              type="button"
              key={i}
              aria-pressed={ic === i}
              aria-label={"أيقونة " + i}
              onClick={() => setIc(i)}
            >
              {i}
            </button>
          ))}
        </div>
        <input
          className="nm"
          autoFocus
          value={v}
          placeholder="اسم المجلد"
          onInput={(e) => setV(e.target.value)}
        />
        <div className="bar" style={{ justifyContent: "center", margin: 0 }}>
          <IB type="submit" c="main" n="check" label="حفظ" disabled={!ok} />
          <IB n="x" label="إلغاء" onClick={onClose} />
        </div>
      </form>
    </Modal>
  );
}

export function MoveModal({ folders, current, onPick, onClose }) {
  const opts = [{ id: null, name: "الرئيسية" }, ...folders];
  return (
    <Modal onClose={onClose}>
      <p className="q">انقل النوت إلى</p>
      <div className="dest">
        {opts.map((o) => (
          <button
            key={o.id || "root"}
            className="btn"
            disabled={o.id === current}
            onClick={() => onPick(o.id)}
          >
            {(o.id ? (o.icon || "📁") + " " : "") +
              o.name +
              (o.id === current ? " (هنا)" : "")}
          </button>
        ))}
      </div>
      <IB n="x" label="إلغاء" onClick={onClose} />
    </Modal>
  );
}

export function ShareModal({ img, onClose }) {
  const [msg, setMsg] = React.useState("");
  const file = React.useMemo(() => {
    try {
      return new File([img.blob], img.name, { type: "image/png" });
    } catch (e) {
      return null;
    }
  }, [img]);
  const canShare = !!(file && navigator.canShare && navigator.canShare({ files: [file] }));
  React.useEffect(
    () => () => URL.revokeObjectURL(img.url),
    [img]
  );
  function save() {
    const a = document.createElement("a");
    a.href = img.url;
    a.download = img.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setMsg("اتحفظت");
  }
  async function share() {
    try {
      await navigator.share({ files: [file], title: img.title });
    } catch (e) {}
  }
  return (
    <Modal onClose={onClose}>
      <img alt="معاينة النوت" src={img.url} />
      <div className="bar" style={{ justifyContent: "center", margin: 0 }}>
        <IB c="main" n="download" label="حفظ الصورة" onClick={save} />
        {canShare && <IB n="share" label="مشاركة" onClick={share} />}
        <IB n="x" label="إغلاق" onClick={onClose} />
      </div>
      <p className="msg">{msg}</p>
    </Modal>
  );
}

export function ProfileModal({ user, avatar, onSave, onClose }) {
  const [msg, setMsg] = React.useState("");
  async function pick(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try {
      const a = await readAvatar(f);
      await onSave(a);
      onClose();
    } catch (err) {
      setMsg("مقدرتش أقرأ الصورة دي. جرّب صورة تانية.");
    }
  }
  return (
    <Modal onClose={onClose}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
        <Avatar src={avatar} name={user} size={96} />
      </div>
      <p className="q" style={{ marginBottom: 14 }}>
        {user}
      </p>
      <div className="bar" style={{ justifyContent: "center", margin: 0 }}>
        <label className="btn ic main" title="اختار صورة" aria-label="اختار صورة">
          <Ic n="image" />
          <input className="pfile" type="file" accept="image/*" onChange={pick} />
        </label>
        {avatar && (
          <IB
            c="danger"
            n="trash"
            label="شيل الصورة"
            onClick={async () => {
              await onSave(null);
              onClose();
            }}
          />
        )}
        <IB n="x" label="إغلاق" onClick={onClose} />
      </div>
      <p className="msg">{msg}</p>
    </Modal>
  );
}
