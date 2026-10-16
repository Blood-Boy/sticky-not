import React from "react";
import { Modal, IB, Ic } from "./ui.jsx";
import { LIMITS } from "./trackerData.js";

// Shows only the last 4 digits of a national ID.
export function maskId(v) {
  return v ? "•".repeat(10) + String(v).slice(-4) : "—";
}

export function maskPassword() {
  return "•".repeat(8);
}

// A value that stays hidden until the user taps "إظهار".
export function Secret({ label, value, mask }) {
  const [show, setShow] = React.useState(false);
  if (!value) {
    return (
      <div className="tdet-row">
        <dt>{label}</dt>
        <dd>—</dd>
      </div>
    );
  }
  return (
    <div className="tdet-row">
      <dt>{label}</dt>
      <dd dir="ltr" className="tsecret">
        {show ? value : mask(value)}
      </dd>
      <button
        type="button"
        className="tshow"
        aria-pressed={show}
        aria-label={(show ? "إخفاء " : "إظهار ") + label}
        onClick={() => setShow((s) => !s)}
      >
        {show ? "إخفاء" : "إظهار"}
      </button>
    </div>
  );
}

export function PeopleView({ clients, owners, onEditClient, onEditOwner, onDeleteOwner }) {
  return (
    <div className="people">
      <h3 className="psec">العملاء ({clients.length})</h3>
      {clients.length === 0 ? (
        <p className="empty">مفيش عملاء لسه.</p>
      ) : (
        <ul className="tlist">
          {clients.map((c) => (
            <li key={c.id} className="prow">
              <span className="pname">{c.name}</span>
              <button
                type="button"
                className="mini"
                aria-label={"عدّل اسم العميل " + c.name}
                title="عدّل الاسم"
                onClick={() => onEditClient(c)}
              >
                <Ic n="edit" s={18} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <h3 className="psec">الملاك ({owners.length})</h3>
      {owners.length === 0 ? (
        <p className="empty">مفيش ملاك لسه. دوس "مالك جديد" وأضيف أول مالك.</p>
      ) : (
        <ul className="tlist">
          {owners.map((o) => (
            <li key={o.id} className="prow">
              <div className="pinfo">
                <span className="pname">{o.name}</span>
                <span className="psub">{o.partAddress}</span>
                <span className="psub" dir="ltr">
                  الرقم القومي {maskId(o.nationalId)}
                </span>
              </div>
              <button
                type="button"
                className="mini"
                aria-label={"عدّل بيانات المالك " + o.name}
                title="عدّل البيانات"
                onClick={() => onEditOwner(o)}
              >
                <Ic n="edit" s={18} />
              </button>
              <button
                type="button"
                className="mini"
                aria-label={"احذف المالك " + o.name}
                title="احذف المالك"
                onClick={() => onDeleteOwner(o)}
              >
                <Ic n="trash" s={18} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function RenameClientModal({ client, onSave, onClose }) {
  const [name, setName] = React.useState(client.name);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const n = name.trim();
  const ok = n.length >= LIMITS.client[0] && n.length <= LIMITS.client[1];

  async function submit(e) {
    e.preventDefault();
    if (!ok || busy) return;
    setBusy(true);
    setMsg((await onSave(n)) || "");
    setBusy(false);
  }

  return (
    <Modal onClose={onClose}>
      <form onSubmit={submit}>
        <p className="q">تعديل اسم العميل</p>
        <label className="tfield">
          <span>اسم العميل</span>
          <input
            className="nm"
            autoFocus
            value={name}
            maxLength={LIMITS.client[1]}
            onChange={(e) => {
              setName(e.target.value);
              setMsg("");
            }}
          />
        </label>
        <p className="msg" role="alert">{msg}</p>
        <div className="bar tmodal-actions">
          <button type="submit" className="btn main" disabled={!ok || busy}>
            حفظ
          </button>
          <button type="button" className="btn" onClick={onClose}>
            إلغاء
          </button>
        </div>
      </form>
    </Modal>
  );
}

// owner: null for a new owner, or the existing owner being edited.
export function OwnerModal({ owner, onSave, onAskDelete, onClose }) {
  const [name, setName] = React.useState(owner ? owner.name : "");
  const [partAddress, setPartAddress] = React.useState(owner ? owner.partAddress : "");
  const [nationalId, setNationalId] = React.useState(owner ? owner.nationalId : "");
  const [password, setPassword] = React.useState(owner ? owner.password || "" : "");
  const [showPw, setShowPw] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");

  const ok =
    name.trim().length >= LIMITS.owner[0] &&
    partAddress.trim().length >= LIMITS.partTitle[0] &&
    new RegExp("^\\d{" + LIMITS.nationalId + "}$").test(nationalId);

  const touch = (fn) => (e) => {
    fn(e.target.value);
    setMsg("");
  };

  async function submit(e) {
    e.preventDefault();
    if (!ok || busy) return;
    setBusy(true);
    setMsg((await onSave({ name, partAddress, nationalId, password })) || "");
    setBusy(false);
  }

  return (
    <Modal onClose={onClose}>
      <form onSubmit={submit} className="tform">
        <p className="q">{owner ? "تعديل بيانات المالك" : "مالك جديد"}</p>

        <label className="tfield">
          <span>اسم المالك</span>
          <input value={name} maxLength={LIMITS.owner[1]} onChange={touch(setName)} />
        </label>

        <label className="tfield">
          <span>عنوان القطعة</span>
          <input value={partAddress} maxLength={LIMITS.partTitle[1]} onChange={touch(setPartAddress)} />
        </label>

        <label className="tfield">
          <span>الرقم القومي</span>
          <input
            inputMode="numeric"
            autoComplete="off"
            dir="ltr"
            value={nationalId}
            maxLength={LIMITS.nationalId}
            onChange={(e) => {
              setNationalId(e.target.value.replace(/\D/g, "").slice(0, LIMITS.nationalId));
              setMsg("");
            }}
          />
        </label>

        <div className="tfield">
          <span>الباسور (اختياري)</span>
          <div className="tpw">
            <input
              type={showPw ? "text" : "password"}
              autoComplete="new-password"
              dir="ltr"
              value={password}
              maxLength={LIMITS.password}
              onChange={touch(setPassword)}
            />
            <button type="button" className="tshow" aria-pressed={showPw} onClick={() => setShowPw((s) => !s)}>
              {showPw ? "إخفاء" : "إظهار"}
            </button>
          </div>
        </div>

        <p className="msg" role="alert">{msg}</p>

        <div className="bar tmodal-actions">
          <button type="submit" className="btn main" disabled={!ok || busy}>
            حفظ
          </button>
          <button type="button" className="btn" onClick={onClose}>
            إلغاء
          </button>
          {owner && <IB c="danger" n="trash" label="احذف المالك" onClick={onAskDelete} />}
        </div>
      </form>
    </Modal>
  );
}
