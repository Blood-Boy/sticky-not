// Offline queue. A change is shown on screen at once, kept on this device, and
// sent to the server in order when a connection is available.
//
// Op shapes:
//   { t: "note.add",    id, data }     data = the whole note as shown on screen
//   { t: "note.patch",  id, patch }    patch = title / theme / folder / blocks
//   { t: "note.del",    id }
//   { t: "folder.add",  id, data }     data = { name, icon }
//   { t: "folder.patch", id, patch }   patch = name / icon
//   { t: "folder.del",  id }
// The op being sent is the head of the queue with busy: true. It stays stored
// until the server answers, and later edits queue behind it.

const PREFIX = "mwn:outbox:";
const MAX_TRIES = 10;   // an op that keeps failing for the server is dropped after this

export function loadQueue(who) {
  try {
    const raw = localStorage.getItem(PREFIX + who);
    const q = raw ? JSON.parse(raw) : [];
    return Array.isArray(q) ? q.map((op) => ({ ...op, busy: false })) : [];
  } catch (e) {
    return [];
  }
}

export function saveQueue(who, q) {
  try {
    if (q.length) localStorage.setItem(PREFIX + who, JSON.stringify(q));
    else localStorage.removeItem(PREFIX + who);
  } catch (e) {
    // Storage full or blocked: changes still go to the server when online.
  }
}

// A random RFC 4122 v4 id, so the client can create notes and folders offline.
export function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// Adds an op. Edits fold into a create that is still waiting, and a delete
// cancels a create that never reached the server. The op being sent is never changed.
export function enqueue(q, op) {
  const kind = op.t.split(".")[0];
  const sameItem = (x) => x.id === op.id && x.t.split(".")[0] === kind;

  if (op.t.endsWith(".patch")) {
    const i = q.findIndex((x) => !x.busy && sameItem(x) && (x.t.endsWith(".add") || x.t.endsWith(".patch")));
    if (i < 0) return [...q, op];
    const cur = q[i];
    const next = cur.t.endsWith(".add")
      ? { ...cur, data: { ...cur.data, ...op.patch } }
      : { ...cur, patch: { ...cur.patch, ...op.patch } };
    return q.map((x, j) => (j === i ? next : x));
  }

  if (op.t.endsWith(".del")) {
    const createdOffline = q.some((x) => !x.busy && sameItem(x) && x.t.endsWith(".add"));
    const rest = q.filter((x) => x.busy || !sameItem(x) || (x.t.endsWith(".add") && !createdOffline));
    return createdOffline ? rest : [...rest, op];
  }

  return [...q, op];
}

// Marks the head of the queue as being sent.
export function markHead(q) {
  return q.length ? [{ ...q[0], busy: true }, ...q.slice(1)] : q;
}

// The head was accepted by the server.
export function afterSuccess(q) {
  return q.slice(1);
}

// The head failed. Returns the new queue and whether to stop and retry later.
//   "offline" | "server" | "auth" -> the op stays at the front, stop here
//   anything else                 -> the server refused it for good; drop it
export function afterFailure(q, err) {
  const [head, ...rest] = q;
  const kind = (err && err.kind) || "rejected";
  if (kind === "auth") return { queue: [{ ...head, busy: false }, ...rest], stop: "auth" };
  if (kind === "offline" || kind === "server") {
    const tries = (head.tries || 0) + 1;
    if (tries < MAX_TRIES) return { queue: [{ ...head, busy: false, tries }, ...rest], stop: kind };
  }
  return { queue: rest, stop: null };
}

// The screen state (last server copy) with pending ops applied on top.
export function overlay(state, q) {
  let notes = state.notes || [];
  let folders = state.folders || [];
  for (const op of q) {
    const [kind, act] = op.t.split(".");
    if (kind === "note") {
      if (act === "add") {
        if (!notes.some((n) => n.id === op.id)) notes = [op.data, ...notes];
      } else if (act === "patch") {
        notes = notes.map((n) => (n.id === op.id ? { ...n, ...op.patch } : n));
      } else if (act === "del") {
        notes = notes.filter((n) => n.id !== op.id);
      }
    } else if (kind === "folder") {
      if (act === "add") {
        if (!folders.some((f) => f.id === op.id)) folders = [...folders, { id: op.id, role: "owner", ...op.data }];
      } else if (act === "patch") {
        folders = folders.map((f) => (f.id === op.id ? { ...f, ...op.patch } : f));
      } else if (act === "del") {
        folders = folders.filter((f) => f.id !== op.id);
        notes = notes.map((n) => (n.folder === op.id ? { ...n, folder: null } : n));
      }
    }
  }
  return { notes, folders };
}
