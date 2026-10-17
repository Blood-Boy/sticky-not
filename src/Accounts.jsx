import React from "react";
import { Modal, Ic } from "./ui.jsx";
import { api } from "./api.js";
import { LIMITS } from "./trackerData.js";

const MESSAGES = {
  badclient: "اختار عميل مسجل الأول.",
  badamount: "المبلغ لازم يكون رقم أكبر من صفر.",
  baditem: "البند مطلوب، وبحد أقصى 80 حرف.",
  badnotes: "الملاحظات أطول من 1000 حرف.",
  badinput: "البيانات مش مكتملة.",
  notfound: "الحساب ده مش موجود. يمكن اتمسح.",
  unauthorized: "لازم تسجل دخول تاني.",
  network: "مقدرتش أوصل للسيرفر. اتأكد من النت وجرّب تاني.",
  server: "في مشكلة في السيرفر. جرّب تاني بعد شوية.",
};

const msgFor = (e) => MESSAGES[(e && e.message) || ""] || MESSAGES.server;

// Parses the amount typed by the user. Returns null when it is not a valid amount.
function parseAmount(v) {
  const n = Number(String(v).trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 && n <= 9999999999.99 ? Math.round(n * 100) / 100 : null;
}

const money = (n) =>
  Number(n || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ج.م";

const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Builds an A4 invoice for the given accounts and opens the print dialog.
// The user picks "Save as PDF" in the dialog to get the PDF.
function printInvoice(rows, clientName) {
  const total = rows.reduce((s, a) => s + a.amount, 0);
  const paid = rows.filter((a) => a.paid).reduce((s, a) => s + a.amount, 0);
  const unpaid = total - paid;
  const lines = rows
    .map(
      (a) => `<tr>
        <td>${escapeHtml(clientName.get(a.clientId) || "—")}</td>
        <td>${escapeHtml(a.item)}</td>
        <td>${escapeHtml(a.notes)}</td>
        <td class="num">${money(a.amount)}</td>
        <td>${a.paid ? "مدفوع" : "غير مدفوع"}</td>
      </tr>`
    )
    .join("");
  const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
<title>فاتورة</title>
<style>
  @page { size: A4; margin: 16mm; }
  body { font-family: "Segoe UI", Tahoma, Arial, sans-serif; color: #111; margin: 0; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .date { color: #555; margin-bottom: 18px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { border-bottom: 1px solid #ccc; padding: 8px 6px; text-align: right; vertical-align: top; }
  th { background: #f3f3f3; }
  td.num { white-space: nowrap; }
  .totals { margin-top: 18px; width: 50%; margin-inline-start: auto; font-size: 14px; }
  .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
  .totals .grand { font-weight: 700; border-top: 2px solid #111; margin-top: 4px; padding-top: 6px; }
</style></head><body>
<h1>فاتورة</h1>
<div class="date">التاريخ: ${new Date().toLocaleDateString("ar-EG")}</div>
<table>
  <thead><tr><th>العميل</th><th>البند</th><th>الملاحظات</th><th>المبلغ</th><th>الحالة</th></tr></thead>
  <tbody>${lines}</tbody>
</table>
<div class="totals">
  <div><span>المدفوع</span><span>${money(paid)}</span></div>
  <div><span>غير محصّل</span><span>${money(unpaid)}</span></div>
  <div class="grand"><span>الإجمالي</span><span>${money(total)}</span></div>
</div>
</body></html>`;

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(frame);
  const doc = frame.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();
  frame.contentWindow.focus();
  setTimeout(() => {
    frame.contentWindow.print();
    setTimeout(() => frame.remove(), 1500);
  }, 150);
}

export default function Accounts({ user }) {
  const [accounts, setAccounts] = React.useState([]);
  const [clients, setClients] = React.useState([]);
  const [loaded, setLoaded] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [q, setQ] = React.useState("");
  const [filter, setFilter] = React.useState("all"); // all | paid | unpaid
  const [selected, setSelected] = React.useState(() => new Set());
  const [modal, setModal] = React.useState(null);    // { t: "new" } | { t: "edit", acc }

  React.useEffect(() => {
    let alive = true;
    Promise.all([api.accountsList(), api.trackerList()])
      .then(([a, t]) => {
        if (!alive) return;
        setAccounts(a);
        setClients(t.clients);
      })
      .catch((e) => alive && setErr(msgFor(e)))
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [user]);

  const clientName = React.useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients]);

  // Totals always cover every account; search and filter only change the list.
  const totals = React.useMemo(() => {
    const total = accounts.reduce((s, a) => s + a.amount, 0);
    const paid = accounts.filter((a) => a.paid).reduce((s, a) => s + a.amount, 0);
    return { total, paid, unpaid: total - paid };
  }, [accounts]);

  const shown = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return accounts
      .filter((a) => filter === "all" || a.paid === (filter === "paid"))
      .filter(
        (a) =>
          !needle ||
          [clientName.get(a.clientId), a.item, a.notes, String(a.amount)].some((v) =>
            String(v || "").toLowerCase().includes(needle)
          )
      );
  }, [accounts, q, filter, clientName]);

  const chosen = accounts.filter((a) => selected.has(a.id));

  function toggle(id) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function toggleAllShown() {
    const allOn = shown.length > 0 && shown.every((a) => selected.has(a.id));
    setSelected((s) => {
      const n = new Set(s);
      shown.forEach((a) => (allOn ? n.delete(a.id) : n.add(a.id)));
      return n;
    });
  }

  async function saveAccount(input, id) {
    try {
      const saved = id ? await api.updateAccount(id, input) : await api.addAccount(input);
      setAccounts((prev) => (id ? prev.map((a) => (a.id === id ? saved : a)) : [saved, ...prev]));
      setModal(null);
      return "";
    } catch (e) {
      return msgFor(e);
    }
  }

  async function removeAccount(id) {
    try {
      await api.removeAccount(id);
      setAccounts((prev) => prev.filter((a) => a.id !== id));
      setSelected((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
      setModal(null);
    } catch (e) {
      setErr(msgFor(e));
      setModal(null);
    }
  }

  const noClients = loaded && clients.length === 0;

  return (
    <section className="tracker" aria-label="الحسابات">
      <div className="tactions">
        <button
          type="button"
          className="btn main"
          disabled={noClients}
          onClick={() => setModal({ t: "new" })}
          title={noClients ? "سجّل عميل الأول من تاب متابعة الشغل" : undefined}
        >
          <Ic n="plus" s={18} />
          <span>حساب جديد</span>
        </button>
      </div>

      {err && <p className="msg" role="alert">{err}</p>}
      {noClients && <p className="msg">لازم تسجل عملاء من تاب متابعة الشغل الأول.</p>}

      <div className="tstats" role="group" aria-label="ملخص الحسابات">
        <div className="tstat" aria-live="polite">
          <span className="tval">{money(totals.total)}</span>
          <span className="tlbl">إجمالي الحسابات</span>
        </div>
        <div className="tstat">
          <span className="tval">{money(totals.paid)}</span>
          <span className="tlbl">مدفوع</span>
        </div>
        <div className="tstat">
          <span className="tval">{money(totals.unpaid)}</span>
          <span className="tlbl">غير محصّل</span>
        </div>
      </div>

      <div className="tsearch">
        <label className="sr" htmlFor="aq">ابحث في الحسابات</label>
        <input
          id="aq"
          type="search"
          value={q}
          placeholder="ابحث باسم العميل أو البند أو المبلغ..."
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="tseg" role="group" aria-label="فلترة الحسابات" style={{ margin: "8px 0" }}>
        {[
          ["all", "الكل"],
          ["unpaid", "غير مدفوع"],
          ["paid", "مدفوع"],
        ].map(([id, label]) => (
          <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}>
            {label}
          </button>
        ))}
      </div>

      <div className="bar tmodal-actions" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <label className="ainv-all">
          <input
            type="checkbox"
            checked={shown.length > 0 && shown.every((a) => selected.has(a.id))}
            onChange={toggleAllShown}
            disabled={shown.length === 0}
          />
          <span>تحديد الكل ({shown.length})</span>
        </label>
        <button
          type="button"
          className="btn"
          disabled={chosen.length === 0}
          onClick={() => printInvoice(chosen, clientName)}
        >
          ابعت فاتورة PDF ({chosen.length})
        </button>
      </div>

      {!loaded ? (
        <p className="empty">بنحمّل الحسابات...</p>
      ) : shown.length === 0 ? (
        <p className="empty">
          {accounts.length ? "مفيش نتايج للبحث ده." : "مفيش حسابات لسه. دوس \"حساب جديد\" وابدأ."}
        </p>
      ) : (
        <ul className="tlist">
          {shown.map((a) => (
            <li key={a.id} className={"trow " + (a.paid ? "done" : "ongoing")}>
              <input
                type="checkbox"
                className="ainv-check"
                aria-label={"اختار حساب " + (clientName.get(a.clientId) || "") + " — " + a.item}
                checked={selected.has(a.id)}
                onChange={() => toggle(a.id)}
              />
              <button type="button" className="tmain" onClick={() => setModal({ t: "edit", acc: a })}>
                <span className="tclient">{clientName.get(a.clientId) || "عميل محذوف"}</span>
                <span className="ttype">{a.item}</span>
                {a.notes && <span className="tnotes">{a.notes}</span>}
              </button>
              <span className="tnum" dir="ltr">{money(a.amount)}</span>
              <span className={"tstatus " + (a.paid ? "done" : "ongoing")}>{a.paid ? "مدفوع" : "غير مدفوع"}</span>
            </li>
          ))}
        </ul>
      )}

      {modal && (
        <AccountModal
          account={modal.t === "edit" ? modal.acc : null}
          clients={clients}
          onSave={saveAccount}
          onDelete={removeAccount}
          onClose={() => setModal(null)}
        />
      )}
    </section>
  );
}

// account: null for a new account, or the one being edited.
function AccountModal({ account, clients, onSave, onDelete, onClose }) {
  const [clientId, setClientId] = React.useState(account ? account.clientId : clients[0] ? clients[0].id : "");
  const [amount, setAmount] = React.useState(account ? String(account.amount) : "");
  const [item, setItem] = React.useState(account ? account.item : "");
  const [notes, setNotes] = React.useState(account ? account.notes : "");
  const [paid, setPaid] = React.useState(account ? account.paid : false);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const [confirmDel, setConfirmDel] = React.useState(false);

  const amountValue = parseAmount(amount);
  const ok = !!clientId && amountValue !== null && item.trim().length >= 1 && item.trim().length <= 80;

  async function submit(e) {
    e.preventDefault();
    if (!ok || busy) return;
    setBusy(true);
    setMsg(
      (await onSave(
        { clientId, amount: amountValue, item: item.trim(), notes: notes.trim(), paid },
        account ? account.id : null
      )) || ""
    );
    setBusy(false);
  }

  return (
    <Modal onClose={onClose}>
      <form onSubmit={submit} className="tform">
        <p className="q">{account ? "تعديل الحساب" : "حساب جديد"}</p>

        <label className="tfield">
          <span>العميل</span>
          <select value={clientId} onChange={(e) => { setClientId(e.target.value); setMsg(""); }}>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>

        <label className="tfield">
          <span>المبلغ (ج.م)</span>
          <input
            inputMode="decimal"
            dir="ltr"
            value={amount}
            onChange={(e) => { setAmount(e.target.value); setMsg(""); }}
          />
        </label>

        <label className="tfield">
          <span>البند</span>
          <input value={item} maxLength={LIMITS.partTitle[1]} onChange={(e) => { setItem(e.target.value); setMsg(""); }} />
        </label>

        <label className="tfield">
          <span>الملاحظات</span>
          <textarea rows={3} maxLength={1000} value={notes} onChange={(e) => { setNotes(e.target.value); setMsg(""); }} />
        </label>

        <div className="tfield">
          <span id="apaid-l">الحالة</span>
          <div className="tseg" role="group" aria-labelledby="apaid-l">
            <button type="button" aria-pressed={paid} className="done" onClick={() => setPaid(true)}>مدفوع</button>
            <button type="button" aria-pressed={!paid} className="ongoing" onClick={() => setPaid(false)}>غير مدفوع</button>
          </div>
        </div>

        <p className="msg" role="alert">{msg}</p>

        <div className="bar tmodal-actions">
          <button type="submit" className="btn main" disabled={!ok || busy}>حفظ</button>
          <button type="button" className="btn" onClick={onClose}>إلغاء</button>
          {account && !confirmDel && (
            <button type="button" className="btn danger" onClick={() => setConfirmDel(true)}>احذف الحساب</button>
          )}
          {account && confirmDel && (
            <button type="button" className="btn danger" onClick={() => onDelete(account.id)}>تأكيد الحذف</button>
          )}
        </div>
      </form>
    </Modal>
  );
}
