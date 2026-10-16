import { api } from "./api.js";

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

/*
 * Data layer for the work tracker. Each write returns a fresh snapshot
 * { clients, txs, owners }; owners are masked (last 4 digits of the national
 * ID, and a hasPassword flag). Use getOwner(id) to read the full owner data.
 */
export const trackerData = {
  list() {
    return call(() => api.trackerList());
  },

  async addClient(name) {
    await call(() => api.addClient(name));
    return this.list();
  },

  async renameClient(id, name) {
    await call(() => api.renameClient(id, name));
    return this.list();
  },

  // Full owner data, including the national ID and password. Call only when the user opens it.
  getOwner(id) {
    return call(() => api.getOwner(id));
  },

  // input: { name, partAddress, nationalId, password }, id is set when editing
  async saveOwner(input, id) {
    await call(() => (id ? api.updateOwner(id, input) : api.addOwner(input)));
    return this.list();
  },

  async removeOwner(id) {
    await call(() => api.removeOwner(id));
    return this.list();
  },

  // input: { clientId, number, partTitle, type, notes, status }, id is set when editing
  async saveTx(input, id) {
    await call(() => (id ? api.updateTx(id, input) : api.addTx(input)));
    return this.list();
  },

  async setStatus(id, status) {
    await call(() => api.updateTx(id, { status }));
    return this.list();
  },

  async removeTx(id) {
    await call(() => api.removeTx(id));
    return this.list();
  },
};
