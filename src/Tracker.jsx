import React from "react";
import { Modal, IB, Ic } from "./ui.jsx";
import { Confirm } from "./modals.jsx";
import { trackerData, LIMITS, STATUS } from "./trackerData.js";

const SUMMARY = [
  { id: "all", label: "إجمالي المعاملات" },
  { id: "ongoing", label: "جارية" },
  { id: "done", label: "منتهية" },
];

export default function Tracker() {
  const [data, setData] = React.useState({ clients: [], txs: [] });
  const [loaded, setLoaded] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [filter, setFilter] = React.useState("all");
  const [modal, setModal] = React.useState(null); // { t: "client" } | { t: "tx", tx? } | { t: "del", tx }
  const [err, setErr] = React.useState("");

  React.useEffect(() => {
    let alive = true;
    trackerData
      .list()
      .then((d) => alive && setData(d))
      .catch(() => alive && setErr("مقدرتش أحمّل المعاملات. جرّب تاني."))
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  const clientName = React.useMemo(
    () => new Map(data.clients.map((c) => [c.id, c.name])),
    [data.clients]
  );

  const counts = React.useMemo(
    () => ({
      all: data.txs.length,
      ongoing: data.txs.filter((t) => t.status === "ongoing").length,
      done: data.txs.filter((t) => t.status === "done").length,
    }),
    [data.txs]
  );

  const shown = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.txs
      .filter((t) => filter === "all" || t.status === filter)
      .filter(
        (t) =>
          !needle ||
          [t.number, t.partTitle, t.type, t.notes, clientName.get(t.clientId)].some((v) =>
            (v || "").toLowerCase().includes(needle)
          )
      )
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [data.txs, filter, q, clientName]);

  // Runs a data change, stores the new snapshot, and returns an error message or null.
  async function run(fn) {
    setErr("");
    try {
      setData(await fn());
      return null;
    } catch (e) {
      return e.message || "حصلت مشكلة. جرّب تاني.";
    }
  }

  const close = () => setModal(null);

  return (
    <section className="tracker" aria-label="متابعة الشغل">
      <div className="tsearch">
        <label className="sr" htmlFor="tq">ابحث في المعاملات</label>
        <input
          id="tq"
          type="search"
          value={q}
          placeholder="ابحث..."
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="tstats" role="group" aria-label="ملخص المعاملات">
        {SUMMARY.map((s) => (
          <button
            key={s.id}
            type="button"
            className="tstat"
            aria-pressed={filter === s.id}
            onClick={() => setFilter(s.id)}
          >
            <span className="tval">{counts[s.id]}</span>
            <span className="tlbl">{s.label}</span>
          </button>
        ))}
      </div>

      <div className="tactions">
        <button type="button" className="btn" onClick={() => setModal({ t: "client" })}>
          <Ic n="userplus" s={18} />
          <span>عميل جديد</span>
        </button>
        <button type="button" className="btn main" onClick={() => setModal({ t: "tx" })}>
          <Ic n="plus" s={18} />
          <span>معاملة جديدة</span>
        </button>
      </div>

      {err && <p className="msg" role="alert">{err}</p>}

      {!loaded ? (
        <p className="empty">بنحمّل المعاملات...</p>
      ) : shown.length === 0 ? (
        <p className="empty">
          {data.txs.length
            ? "مفيش نتايج للبحث ده."
            : "مفيش معاملات لسه. دوس \"معاملة جديدة\" وابدأ."}
        </p>
      ) : (
        <ul className="tlist">
          {shown.map((t) => {
            const next = t.status === "done" ? "ongoing" : "done";
            return (
              <li key={t.id} className={"trow " + t.status}>
                <button
                  type="button"
                  className="tmain"
                  aria-label={"تعديل المعاملة " + t.number}
                  onClick={() => setModal({ t: "tx", tx: t })}
                >
                  <span className="tnum">#{t.number}</span>
                  <span className="tclient">{clientName.get(t.clientId) || "عميل محذوف"}</span>
                  <span className="ttype">{t.partTitle} — {t.type}</span>
                  {t.notes && <span className="tnotes">{t.notes}</span>}
                </button>
                <button
                  type="button"
                  className={"tstatus " + t.status}
                  aria-label={"الحالة: " + STATUS[t.status] + ". دوس لتغييرها إلى " + STATUS[next]}
                  title={"غيّر الحالة إلى " + STATUS[next]}
                  onClick={async () => {
                    const e = await run(() => trackerData.setStatus(t.id, next));
                    if (e) setErr(e);
                  }}
                >
                  {STATUS[t.status]}
                </button>
                <button
                  type="button"
                  className="mini"
                  aria-label="احذف المعاملة"
                  title="احذف المعاملة"
                  onClick={() => setModal({ t: "del", tx: t })}
                >
                  <Ic n="trash" s={18} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {modal?.t === "client" && (
        <ClientModal
          onClose={close}
          onSave={async (name) => {
            const e = await run(() => trackerData.addClient(name));
            if (!e) close();
            return e;
          }}
        />
      )}

      {modal?.t === "tx" && (
        <TxModal
          clients={data.clients}
          tx={modal.tx}
          onClose={close}
          onAskDelete={() => setModal({ t: "del", tx: modal.tx })}
          onSave={async (input) => {
            const e = await run(() => trackerData.saveTx(input, modal.tx && modal.tx.id));
            if (!e) close();
            return e;
          }}
        />
      )}

      {modal?.t === "del" && (
        <Confirm
          text={"تحذف المعاملة #" + modal.tx.number + " نهائياً؟"}
          yes="احذف"
          onYes={async () => {
            const id = modal.tx.id;
            close();
            const e = await run(() => trackerData.removeTx(id));
            if (e) setErr(e);
          }}
          onNo={close}
        />
      )}
    </section>
  );
}

function ClientModal({ onSave, onClose }) {
  const [name, setName] = React.useState("");
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
        <p className="q">عميل جديد</p>
        <label className="tfield">
          <span>اسم العميل</span>
          <input
            className="nm"
            autoFocus
            value={name}
            maxLength={LIMITS.client[1]}
            placeholder="اكتب اسم العميل"
            onChange={(e) => {
              setName(e.target.value);
              setMsg("");
            }}
          />
        </label>
        <p className="msg" role="alert">{msg}</p>
        <div className="bar tmodal-actions">
          <button type="submit" className="btn main" disabled={!ok || busy}>
            إضافة
          </button>
          <button type="button" className="btn" onClick={onClose}>
            إلغاء
          </button>
        </div>
      </form>
    </Modal>
  );
}

function TxModal({ clients, tx, onSave, onClose, onAskDelete }) {
  const editing = !!tx;
  const [clientId, setClientId] = React.useState(tx ? tx.clientId : clients[0] ? clients[0].id : "");
  const [number, setNumber] = React.useState(tx ? tx.number : "");
  const [partTitle, setPartTitle] = React.useState(tx ? tx.partTitle || "" : "");
  const [type, setType] = React.useState(tx ? tx.type : "");
  const [notes, setNotes] = React.useState(tx ? tx.notes || "" : "");
  const [status, setStatus] = React.useState(tx ? tx.status : "ongoing");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");

  const ok =
    !!clientId &&
    number.trim().length >= LIMITS.number[0] &&
    partTitle.trim().length >= LIMITS.partTitle[0] &&
    type.trim().length >= LIMITS.type[0] &&
    notes.length <= LIMITS.notes;

  async function submit(e) {
    e.preventDefault();
    if (!ok || busy) return;
    setBusy(true);
    setMsg((await onSave({ clientId, number, partTitle, type, notes, status })) || "");
    setBusy(false);
  }

  const touch = (fn) => (e) => {
    fn(e.target.value);
    setMsg("");
  };

  return (
    <Modal onClose={onClose}>
      <form onSubmit={submit} className="tform">
        <p className="q">{editing ? "تعديل معاملة" : "معاملة جديدة"}</p>

        {clients.length === 0 ? (
          <p className="msg">ضيف عميل الأول من زرار "عميل جديد"، وبعدين ارجع تضيف المعاملة.</p>
        ) : (
          <label className="tfield">
            <span>العميل</span>
            <select value={clientId} onChange={touch(setClientId)}>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
        )}

        <label className="tfield">
          <span>رقم المعاملة</span>
          <input
            value={number}
            maxLength={LIMITS.number[1]}
            onChange={touch(setNumber)}
          />
        </label>

        <label className="tfield">
          <span>عنوان القطعة</span>
          <input
            value={partTitle}
            maxLength={LIMITS.partTitle[1]}
            onChange={touch(setPartTitle)}
          />
        </label>

        <label className="tfield">
          <span>نوع المعاملة</span>
          <input
            value={type}
            maxLength={LIMITS.type[1]}
            onChange={touch(setType)}
          />
        </label>

        <label className="tfield">
          <span>الملاحظات (اختياري)</span>
          <textarea
            rows="3"
            value={notes}
            maxLength={LIMITS.notes}
            onChange={touch(setNotes)}
          />
        </label>

        <div className="tfield">
          <span id="tstatus-l">الحالة</span>
          <div className="tseg" role="group" aria-labelledby="tstatus-l">
            {["ongoing", "done"].map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={status === s}
                className={s}
                onClick={() => setStatus(s)}
              >
                {STATUS[s]}
              </button>
            ))}
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
          {editing && (
            <IB c="danger" n="trash" label="احذف المعاملة" onClick={onAskDelete} />
          )}
        </div>
      </form>
    </Modal>
  );
}
