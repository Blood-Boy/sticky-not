import { api } from "./api.js";
import { readCache, writeCache } from "./cache.js";
import { afterFailure, afterSuccess, enqueue, loadQueue, markHead, newId, saveQueue } from "./outbox.js";

// Limits mirror server/tracker-rules.js. The server is the source of truth.
export const LIMITS = {
  client: [2, 60],
  number: [1, 40],
  partTitle: [1, 80],
  type: [1, 80],
  notes: 1000,
  owner: [2, 60],
  nationalId: 14,
  password: 128,
};

export const STATUS = {
  ongoing: "جارية",
  done: "منتهية",
};

// Server error codes -> Arabic messages shown to the user.
const MESSAGES = {
  badname: "الاسم لازم يكون من 2 لـ 60 حرف.",
  badaddress: "عنوان القطعة مطلوب، وبحد أقصى 80 حرف.",
  badnid: "الرقم القومي لازم يكون 14 رقم بالظبط.",
  badpass: "الباسور أطول من 128 حرف.",
  badnumber: "رقم المعاملة مطلوب، وبحد أقصى 40 حرف.",
  badpart: "عنوان القطعة مطلوب، وبحد أقصى 80 حرف.",
  badtype: "نوع المعاملة مطلوب، وبحد أقصى 80 حرف.",
  badnotes: "الملاحظات أطول من 1000 حرف.",
  badstatus: "حالة المعاملة مش صحيحة.",
  badinput: "اختار العميل الأول، وبعدين اكمل البيانات.",
  badclient: "العميل ده مش موجود عندك.",
  clientexists: "في عميل تاني بنفس الاسم.",
  owneraddr: "في مالك مسجل على عنوان القطعة ده قبل كده.",
  txnumber: "رقم المعاملة ده موجود قبل كده.",
  notfound: "العنصر ده مش موجود. يمكن اتمسح.",
  unauthorized: "لازم تسجل دخول تاني.",
  server: "في مشكلة في السيرفر. جرّب تاني بعد شوية.",
  network: "مقدرتش أوصل للسيرفر. اتأكد من النت وجرّب تاني.",
};

function toUserError(e) {
  const code = (e && e.message) || "";
  return new Error(MESSAGES[code] || MESSAGES.server);
}

async function call(fn) {
  try {
    return await fn();
  } catch (e) {
    throw toUserError(e);
  }
}

// The owner whose part address matches the transaction's part title, or null.
export function ownerForPart(owners, partTitle) {
  const p = String(partTitle || "").trim().toLowerCase();
  if (!p) return null;
  return owners.find((o) => String(o.partAddress || "").trim().toLowerCase() === p) || null;
}

// Applies queued changes on top of a snapshot. Safe to run more than once.
export function overlayTracker(state, q) {
  let { clients, txs, owners } = state;
  for (const op of q) {
    const [kind, act] = op.t.split(".");
    if (kind === "client") {
      if (act === "add") {
        if (!clients.some((c) => c.id === op.id)) clients = [...clients, { id: op.id, ...op.data }];
      } else if (act === "patch") {
        clients = clients.map((c) => (c.id === op.id ? { ...c, ...op.patch } : c));
      }
    } else if (kind === "tx") {
      if (act === "add") {
        if (!txs.some((t) => t.id === op.id)) txs = [...txs, { id: op.id, ...op.data }];
      } else if (act === "patch") {
        txs = txs.map((t) => (t.id === op.id ? { ...t, ...op.patch } : t));
      } else if (act === "del") {
        txs = txs.filter((t) => t.id !== op.id);
      }
    } else if (kind === "owner" && act === "del") {
      owners = owners.filter((o) => o.id !== op.id);
    }
  }
  return { clients, txs, owners };
}

// Only the fields the server accepts for a transaction.
function pickTx(input) {
  const out = {};
  for (const k of ["clientId", "number", "partTitle", "type", "notes", "status"]) {
    if (input[k] !== undefined) out[k] = input[k];
  }
  return out;
}

/*
 * Work tracker data. Clients, transactions and owner removals work offline:
 * they are shown at once, kept on this device, and sent in order when there is
 * a connection. Owner add/edit is online only, because it carries the national
 * ID and password, which are never stored on the device in plain text.
 * Owners in the snapshot are masked (last 4 digits, hasPassword flag).
 */
const EMPTY = { clients: [], txs: [], owners: [] };
const RETRY_MS = 15000;

let who = null;          // username; storage keys are built from it
let base = null;         // last server snapshot, with confirmed changes folded in
let queue = [];          // queued changes (see outbox.js)
let online = true;
let pendingNotice = "";  // one-off message, e.g. a change the server refused
let running = false;
let again = false;
let timer = null;
let listening = false;
const listeners = new Set();

const key = () => who + "#tracker";
const view = () => overlayTracker(base || EMPTY, queue);

function snapshot(notice = "") {
  return { data: view(), online, pending: queue.length, notice };
}

function emit() {
  const st = snapshot(pendingNotice);
  pendingNotice = "";
  listeners.forEach((fn) => fn(st));
}

function setQueue(q) {
  queue = q;
  if (who) saveQueue(key(), q);
}

function setBase(b) {
  base = b;
  if (who) writeCache(key(), b);
}

async function sendOp(op) {
  try {
    switch (op.t) {
      case "client.add": return await api.addClient(op.data.name, op.id);
      case "client.patch": return await api.renameClient(op.id, op.patch.name);
      case "tx.add": return await api.addTx({ ...op.data, id: op.id });
      case "tx.patch": return await api.updateTx(op.id, op.patch);
      case "tx.del": return await api.removeTx(op.id);
      case "owner.del": return await api.removeOwner(op.id);
      default: return null;
    }
  } catch (e) {
    const c = (e && e.message) || "";
    if (c === "notfound" && op.t.endsWith(".del")) return null;   // already gone
    const err = new Error(c);
    err.code = c;
    err.kind =
      c === "network" ? "offline"
      : c === "unauthorized" ? "auth"
      : c === "server" || /^http5/.test(c) ? "server"
      : "rejected";
    throw err;
  }
}

async function runFlush() {
  if (running) {
    again = true;
    return;
  }
  running = true;
  try {
    do {
      again = false;
      while (queue.length) {
        setQueue(markHead(queue));
        const op = queue[0];
        try {
          await sendOp(op);
          // Fold the confirmed change into the snapshot, so the item never disappears.
          setBase(overlayTracker(base || EMPTY, [op]));
          setQueue(afterSuccess(queue));
          online = true;
          emit();
        } catch (e) {
          const r = afterFailure(queue, e);
          setQueue(r.queue);
          if (r.stop === "offline") online = false;
          if (!r.stop && e.kind === "rejected") pendingNotice = MESSAGES[e.code] || MESSAGES.server;
          emit();
          if (r.stop) {
            clearTimeout(timer);
            timer = setTimeout(runFlush, RETRY_MS);
            return;
          }
        }
      }
      // Queue is empty: take the server's copy, which has the server's own timestamps.
      if (who && !queue.length) {
        try {
          setBase(await api.trackerList());
          online = true;
          emit();
        } catch (e) {
          if (e && e.message === "network") online = false;
        }
      }
    } while (again);
  } finally {
    running = false;
  }
}

function flushSoon() {
  clearTimeout(timer);
  runFlush();
}

function enqueueOp(op) {
  setQueue(enqueue(queue, op));
  flushSoon();
  return view();
}

export const trackerData = {
  // Called when the tracker opens for a user. Loads the saved snapshot and queue.
  use(name) {
    who = name;
    base = readCache(key()) || null;
    queue = loadQueue(key());
    online = navigator.onLine !== false;
    if (!listening) {
      listening = true;
      addEventListener("online", () => {
        online = true;
        flushSoon();
        emit();
      });
      addEventListener("offline", () => {
        online = false;
        emit();
      });
    }
    if (queue.length) flushSoon();
    emit();
  },

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  // Fresh snapshot from the server. Without a connection, the saved one is used.
  async list() {
    try {
      const snap = await api.trackerList();
      setBase(snap);
      online = true;
      flushSoon();
      emit();
      return view();
    } catch (e) {
      if (e && e.message === "network" && base) {
        online = false;
        emit();
        return view();
      }
      throw toUserError(e);
    }
  },

  // Full owner data, including the national ID and password. Call only when the user opens it.
  getOwner(id) {
    return call(() => api.getOwner(id));
  },

  addClient: async (name) => enqueueOp({ t: "client.add", id: newId(), data: { name } }),

  renameClient: async (id, name) => enqueueOp({ t: "client.patch", id, patch: { name } }),

  // Online only: the national ID and password are sent to the server to be encrypted.
  async saveOwner(input, id) {
    await call(() => (id ? api.updateOwner(id, input) : api.addOwner(input)));
    return this.list();
  },

  removeOwner: async (id) => enqueueOp({ t: "owner.del", id }),

  // input: { clientId, number, partTitle, type, notes, status }, id is set when editing
  saveTx: async (input, id) => {
    if (id) return enqueueOp({ t: "tx.patch", id, patch: pickTx(input) });
    const now = new Date().toISOString();
    return enqueueOp({
      t: "tx.add",
      id: newId(),
      data: { ...pickTx(input), status: input.status || "ongoing", createdAt: now, updatedAt: now },
    });
  },

  setStatus: async (id, status) => enqueueOp({ t: "tx.patch", id, patch: { status } }),

  removeTx: async (id) => enqueueOp({ t: "tx.del", id }),
};
