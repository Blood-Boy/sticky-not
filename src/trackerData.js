import { store, uid } from "./lib.js";

// Limits shared by the forms and the rules below. Keep in sync with the server
// validation once /api/clients, /api/owners and /api/transactions exist.
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

/*
 * TEMPORARY data layer: localStorage stand-in for the upcoming API.
 * Every method returns the full { clients, txs, owners } snapshot so the UI can
 * replace its state after each change. When the server routes exist, keep
 * these names and signatures and swap the bodies for api.js calls.
 *
 * SECURITY: owner national IDs and passwords must be encrypted at rest on the
 * server (never stored or returned in plain text). localStorage is only a
 * stand-in for development.
 *
 * Business-rule errors are thrown as Error with an Arabic message the UI shows as-is.
 */
const KEY = "mwn:tracker";

function read() {
  const d = store.get(KEY, null);
  if (!d || !Array.isArray(d.clients) || !Array.isArray(d.txs)) {
    return { clients: [], txs: [], owners: [] };
  }
  return {
    clients: d.clients,
    txs: d.txs,
    owners: Array.isArray(d.owners) ? d.owners : [],
  };
}

function write(d) {
  store.set(KEY, d);
  return d;
}

function same(a, b) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}

// The owner whose part address matches the transaction's part title, or null.
export function ownerForPart(owners, partTitle) {
  if (!partTitle) return null;
  return owners.find((o) => same(o.partAddress, partTitle)) || null;
}

function checkOwner(input) {
  const name = String(input.name || "").trim();
  const partAddress = String(input.partAddress || "").trim();
  const nationalId = String(input.nationalId || "").trim();
  const password = String(input.password || "");
  if (name.length < LIMITS.owner[0] || name.length > LIMITS.owner[1]) {
    throw new Error("اسم المالك من 2 لـ 60 حرف.");
  }
  if (partAddress.length < LIMITS.partTitle[0] || partAddress.length > LIMITS.partTitle[1]) {
    throw new Error("عنوان القطعة مطلوب، وبحد أقصى 80 حرف.");
  }
  if (!new RegExp("^\\d{" + LIMITS.nationalId + "}$").test(nationalId)) {
    throw new Error("الرقم القومي لازم يكون 14 رقم بالظبط.");
  }
  if (password.length > LIMITS.password) {
    throw new Error("الباسور أطول من 128 حرف.");
  }
  return { name, partAddress, nationalId, password };
}

export const trackerData = {
  async list() {
    return read();
  },

  async addClient(name) {
    const n = String(name || "").trim();
    if (n.length < LIMITS.client[0] || n.length > LIMITS.client[1]) {
      throw new Error("اسم العميل من 2 لـ 60 حرف.");
    }
    const d = read();
    if (d.clients.some((c) => same(c.name, n))) {
      throw new Error("العميل ده موجود قبل كده.");
    }
    d.clients.push({ id: uid(), name: n, createdAt: new Date().toISOString() });
    return write(d);
  },

  async renameClient(id, name) {
    const n = String(name || "").trim();
    if (n.length < LIMITS.client[0] || n.length > LIMITS.client[1]) {
      throw new Error("اسم العميل من 2 لـ 60 حرف.");
    }
    const d = read();
    const c = d.clients.find((x) => x.id === id);
    if (!c) throw new Error("العميل ده مش موجود.");
    if (d.clients.some((x) => x.id !== id && same(x.name, n))) {
      throw new Error("في عميل تاني بنفس الاسم.");
    }
    c.name = n;
    c.updatedAt = new Date().toISOString();
    return write(d);
  },

  // input: { name, partAddress, nationalId, password }, id is set when editing
  async saveOwner(input, id) {
    const o = checkOwner(input);
    const d = read();
    if (d.owners.some((x) => x.id !== id && same(x.partAddress, o.partAddress))) {
      throw new Error("في مالك مسجل على عنوان القطعة ده قبل كده.");
    }
    const now = new Date().toISOString();
    if (id) {
      const i = d.owners.findIndex((x) => x.id === id);
      if (i === -1) throw new Error("المالك ده مش موجود.");
      d.owners[i] = { ...d.owners[i], ...o, updatedAt: now };
    } else {
      d.owners.push({ id: uid(), ...o, createdAt: now, updatedAt: now });
    }
    return write(d);
  },

  async removeOwner(id) {
    const d = read();
    d.owners = d.owners.filter((o) => o.id !== id);
    return write(d);
  },

  // input: { clientId, number, partTitle, type, notes, status }, id is set when editing
  async saveTx(input, id) {
    const number = String(input.number || "").trim();
    const partTitle = String(input.partTitle || "").trim();
    const type = String(input.type || "").trim();
    const notes = String(input.notes || "").trim();
    if (!input.clientId) throw new Error("اختار العميل الأول.");
    if (number.length < LIMITS.number[0] || number.length > LIMITS.number[1]) {
      throw new Error("رقم المعاملة مطلوب، وبحد أقصى 40 حرف.");
    }
    if (partTitle.length < LIMITS.partTitle[0] || partTitle.length > LIMITS.partTitle[1]) {
      throw new Error("عنوان القطعة مطلوب، وبحد أقصى 80 حرف.");
    }
    if (type.length < LIMITS.type[0] || type.length > LIMITS.type[1]) {
      throw new Error("نوع المعاملة مطلوب، وبحد أقصى 80 حرف.");
    }
    if (notes.length > LIMITS.notes) throw new Error("الملاحظات أطول من 1000 حرف.");
    if (!["ongoing", "done"].includes(input.status)) throw new Error("حالة غير صحيحة.");

    const d = read();
    if (!d.clients.some((c) => c.id === input.clientId)) {
      throw new Error("العميل ده مش موجود.");
    }
    if (d.txs.some((t) => t.id !== id && same(t.number, number))) {
      throw new Error("رقم المعاملة ده موجود قبل كده.");
    }

    const row = { clientId: input.clientId, number, partTitle, type, notes, status: input.status };
    if (id) {
      const i = d.txs.findIndex((t) => t.id === id);
      if (i === -1) throw new Error("المعاملة دي مش موجودة.");
      d.txs[i] = { ...d.txs[i], ...row, updatedAt: new Date().toISOString() };
    } else {
      const now = new Date().toISOString();
      d.txs.push({ id: uid(), ...row, createdAt: now, updatedAt: now });
    }
    return write(d);
  },

  async setStatus(id, status) {
    const d = read();
    const t = d.txs.find((x) => x.id === id);
    if (!t) throw new Error("المعاملة دي مش موجودة.");
    t.status = status;
    t.updatedAt = new Date().toISOString();
    return write(d);
  },

  async removeTx(id) {
    const d = read();
    d.txs = d.txs.filter((t) => t.id !== id);
    return write(d);
  },
};
