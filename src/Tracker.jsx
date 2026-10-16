import React from "react";
import { Modal, IB, Ic } from "./ui.jsx";
import { Confirm } from "./modals.jsx";
import { trackerData, LIMITS, STATUS, ownerForPart } from "./trackerData.js";
import { PeopleView, OwnerModal, RenameClientModal, Secret, maskId, maskPassword } from "./TrackerPeople.jsx";

const SUMMARY = [
  { id: "all", label: "إجمالي المعاملات" },
  { id: "ongoing", label: "جارية" },
  { id: "done", label: "منتهية" },
];

export default function Tracker({ user }) {
  const [data, setData] = React.useState({ clients: [], txs: [], owners: [] });
  const [loaded, setLoaded] = React.useState(false);
  const [online, setOnline] = React.useState(true);
  const [pending, setPending] = React.useState(0);
  const [view, setView] = React.useState("tx"); // "tx" | "people"
  const [q, setQ] = React.useState("");
  const [pq, setPq] = React.useState(""); // people-tab search
  const [filter, setFilter] = React.useState("all");
  // modal: { t: "client" } | { t: "owner", owner? } | { t: "tx", tx? } | { t: "view", tx }
  //      | { t: "del", tx } | { t: "ownerDel", owner } | { t: "renameClient", client }
  const [modal, setModal] = React.useState(null);
  const [err, setErr] = React.useState("");

  React.useEffect(() => {
    let alive = true;
    trackerData.use(user);
    const off = trackerData.subscribe((st) => {
      if (!alive) return;
      setData(st.data);
      setOnline(st.online);
      setPending(st.pending);
      if (st.notice) setErr(st.notice);
    });
    trackerData
      .list()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setErr(e.message || "مقدرتش أحمّل البيانات. جرّب تاني."))
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
      off();
    };
  }, [user]);

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

  const people = React.useMemo(() => {
    const needle = pq.trim().toLowerCase();
    if (!needle) return { clients: data.clients, owners: data.owners, searching: false };
    const has = (v) => String(v || "").toLowerCase().includes(needle);
    return {
      clients: data.clients.filter((c) => has(c.name)),
      owners: data.owners.filter(
        (o) => has(o.name) || has(o.partAddress) || has(o.nationalId)
      ),
      searching: true,
    };
  }, [data.clients, data.owners, pq]);

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
      <nav className="ctabs" role="tablist" aria-label="أقسام المتابعة">
        <button
          type="button"
          role="tab"
          aria-selected={view === "tx"}
          className={"ctab" + (view === "tx" ? " active" : "")}
          onClick={() => setView("tx")}
        >
          المعاملات
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "people"}
          className={"ctab" + (view === "people" ? " active" : "")}
          onClick={() => setView("people")}
        >
          العملاء والملاك
        </button>
      </nav>

      <div className="tactions">
        {view === "people" ? (
          <>
            <button type="button" className="btn" onClick={() => setModal({ t: "client" })}>
              <Ic n="userplus" s={18} />
              <span>عميل جديد</span>
            </button>
            <button type="button" className="btn" onClick={() => setModal({ t: "owner" })}>
              <Ic n="userplus" s={18} />
              <span>مالك جديد</span>
            </button>
          </>
        ) : (
          <button type="button" className="btn main" onClick={() => setModal({ t: "tx" })}>
            <Ic n="plus" s={18} />
            <span>معاملة جديدة</span>
          </button>
        )}
      </div>

      {(!online || pending > 0) && (
        <p className="msg" role="status">
          {!online
            ? "مفيش نت. التغييرات محفوظة على الجهاز وهتترفع أول ما النت يرجع."
            : "بنرفع التغييرات (" + pending + ")..."}
        </p>
      )}
      {err && <p className="msg" role="alert">{err}</p>}

      {view === "people" ? (
        !loaded ? (
          <p className="empty">بنحمّل البيانات...</p>
        ) : (
          <>
          <div className="tsearch">
            <label className="sr" htmlFor="pq">ابحث في العملاء والملاك</label>
            <input
              id="pq"
              type="search"
              value={pq}
              placeholder="ابحث..."
              onChange={(e) => setPq(e.target.value)}
            />
          </div>
          <PeopleView
            clients={people.clients}
            owners={people.owners}
            searching={people.searching}
            onEditClient={(c) => setModal({ t: "renameClient", client: c })}
            onEditOwner={(o) => setModal({ t: "owner", owner: o })}
            onDeleteOwner={(o) => setModal({ t: "ownerDel", owner: o })}
          />
          </>
        )
      ) : (
        <>
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
                      aria-label={"عرض المعاملة " + t.number}
                      onClick={() => setModal({ t: "view", tx: t })}
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
                  </li>
                );
              })}
            </ul>
          )}
        </>
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

      {modal?.t === "renameClient" && (
        <RenameClientModal
          client={modal.client}
          onClose={close}
          onSave={async (name) => {
            const e = await run(() => trackerData.renameClient(modal.client.id, name));
            if (!e) close();
            return e;
          }}
        />
      )}

      {modal?.t === "owner" && (
        <OwnerModal
          owner={modal.owner}
          onClose={close}
          onAskDelete={() => setModal({ t: "ownerDel", owner: modal.owner })}
          onSave={async (input) => {
            const e = await run(() => trackerData.saveOwner(input, modal.owner && modal.owner.id));
            if (!e) close();
            return e;
          }}
        />
      )}

      {modal?.t === "ownerDel" && (
        <Confirm
          text={"تحذف المالك " + modal.owner.name + " نهائياً؟"}
          yes="احذف"
          onYes={async () => {
            const id = modal.owner.id;
            close();
            const e = await run(() => trackerData.removeOwner(id));
            if (e) setErr(e);
          }}
          onNo={close}
        />
      )}

      {modal?.t === "tx" && (
        <TxModal
          clients={data.clients}
          owners={data.owners}
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

      {modal?.t === "view" && (
        <TxDetails
          tx={modal.tx}
          clientName={clientName.get(modal.tx.clientId)}
          owner={ownerForPart(data.owners, modal.tx.partTitle)}
          onEdit={() => setModal({ t: "tx", tx: modal.tx })}
          onDelete={() => setModal({ t: "del", tx: modal.tx })}
          onClose={close}
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

function TxModal({ clients, owners, tx, onSave, onClose, onAskDelete }) {
  const editing = !!tx;
  const [clientId, setClientId] = React.useState(tx ? tx.clientId : clients[0] ? clients[0].id : "");
  const [number, setNumber] = React.useState(tx ? tx.number : "");
  const [partTitle, setPartTitle] = React.useState(tx ? tx.partTitle || "" : "");
  const [type, setType] = React.useState(tx ? tx.type : "");
  const [notes, setNotes] = React.useState(tx ? tx.notes || "" : "");
  const [status, setStatus] = React.useState(tx ? tx.status : "ongoing");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");

  const match = partTitle.trim() ? ownerForPart(owners, partTitle) : null;

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
          <input value={number} maxLength={LIMITS.number[1]} onChange={touch(setNumber)} />
        </label>

        <label className="tfield">
          <span>عنوان القطعة</span>
          <input value={partTitle} maxLength={LIMITS.partTitle[1]} onChange={touch(setPartTitle)} />
          {partTitle.trim() && (
            <small className="thint">
              {match
                ? "المالك المسجل على العنوان ده: " + match.name
                : "مفيش مالك مسجل على عنوان القطعة ده."}
            </small>
          )}
        </label>

        <label className="tfield">
          <span>نوع المعاملة</span>
          <input value={type} maxLength={LIMITS.type[1]} onChange={touch(setType)} />
        </label>

        <label className="tfield">
          <span>الملاحظات (اختياري)</span>
          <textarea rows="3" value={notes} maxLength={LIMITS.notes} onChange={touch(setNotes)} />
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
          {editing && <IB c="danger" n="trash" label="احذف المعاملة" onClick={onAskDelete} />}
        </div>
      </form>
    </Modal>
  );
}

// Loads the full owner record when the details open, so the list never holds plain IDs.
function OwnerSecrets({ owner }) {
  const [full, setFull] = React.useState(null);
  const [msg, setMsg] = React.useState("");

  React.useEffect(() => {
    let alive = true;
    trackerData
      .getOwner(owner.id)
      .then((f) => alive && setFull(f))
      .catch((e) => alive && setMsg(e.message));
    return () => {
      alive = false;
    };
  }, [owner.id]);

  if (msg) return <p className="msg" role="alert">{msg}</p>;
  if (!full) return <p className="empty">بنحمّل بيانات المالك...</p>;
  return (
    <dl className="tdet">
      <div className="tdet-row">
        <dt>الاسم</dt>
        <dd>{full.name}</dd>
      </div>
      <Secret label="الرقم القومي" value={full.nationalId} mask={maskId} />
      <Secret label="الباسور" value={full.password} mask={maskPassword} />
    </dl>
  );
}

function TxDetails({ tx, clientName, owner, onEdit, onDelete, onClose }) {
  return (
    <Modal onClose={onClose}>
      <p className="q">معاملة #{tx.number}</p>
      <dl className="tdet">
        <div className="tdet-row">
          <dt>العميل</dt>
          <dd>{clientName || "عميل محذوف"}</dd>
        </div>
        <div className="tdet-row">
          <dt>عنوان القطعة</dt>
          <dd>{tx.partTitle}</dd>
        </div>
        <div className="tdet-row">
          <dt>نوع المعاملة</dt>
          <dd>{tx.type}</dd>
        </div>
        <div className="tdet-row">
          <dt>الحالة</dt>
          <dd>{STATUS[tx.status]}</dd>
        </div>
        {tx.notes && (
          <div className="tdet-row">
            <dt>الملاحظات</dt>
            <dd>{tx.notes}</dd>
          </div>
        )}
      </dl>

      <h4 className="psec">بيانات المالك</h4>
      {owner ? (
        <OwnerSecrets owner={owner} />
      ) : (
        <p className="msg">مفيش مالك مسجل على عنوان القطعة ده. ضيفه من تبويب "العملاء والملاك".</p>
      )}

      <div className="bar tmodal-actions">
        <button type="button" className="btn main" onClick={onEdit}>
          تعديل
        </button>
        <IB c="danger" n="trash" label="احذف المعاملة" onClick={onDelete} />
        <button type="button" className="btn" onClick={onClose}>
          إغلاق
        </button>
      </div>
    </Modal>
  );
}
