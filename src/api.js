const TOKEN_KEY = "mwn:token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

async function req(path, opts = {}) {
  const token = getToken();
  let res;
  try {
    res = await fetch(path, {
      method: opts.method || "GET",
      headers: {
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      body: opts.body,
    });
  } catch (e) {
    throw new Error("network");
  }
  if (res.status === 401) {
    setToken(null);
    throw new Error("unauthorized");
  }
  if (!res.ok) {
    let code = "http" + res.status;
    try {
      const j = await res.json();
      if (j && j.error) code = j.error;
    } catch (e) {}
    throw new Error(code);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  // Auth
  login: (username, password) =>
    req("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  register: (username, password) =>
    req("/api/auth/register", { method: "POST", body: JSON.stringify({ username, password }) }),

  // Profile
  me: () => req("/api/me"),
  setAvatar: (avatar) =>
    req("/api/me/avatar", { method: "PUT", body: JSON.stringify({ avatar }) }),

  // Folders
  getFolders: () => req("/api/folders"),
  addFolder: (name, icon, id) =>
    req("/api/folders", { method: "POST", body: JSON.stringify({ name, icon, id }) }),
  updateFolder: (id, patch) =>
    req("/api/folders/" + id, { method: "PATCH", body: JSON.stringify(patch) }),
  removeFolder: (id) => req("/api/folders/" + id, { method: "DELETE" }),

  // Notes
  getNotes: (ids) =>
    req("/api/notes" + (ids && ids.length > 0 ? "?ids=" + ids.join(",") : "")),
  addNote: (n) => req("/api/notes", { method: "POST", body: JSON.stringify(n) }),
  updateNote: (id, patch) =>
    req("/api/notes/" + id, { method: "PUT", body: JSON.stringify(patch) }),
  removeNote: (id) => req("/api/notes/" + id, { method: "DELETE" }),

  // Collaboration - user search
  searchUsers: (q) =>
    req("/api/users/search?q=" + encodeURIComponent(q)),

  // Collaboration - shares (owner manages who can edit)
  getShares: (kind, id) =>
    req("/api/shares?" + kind + "=" + encodeURIComponent(id)),
  addShare: (kind, id, username) =>
    req("/api/shares", { method: "POST", body: JSON.stringify({ [kind]: id, username }) }),
  removeShare: (id) =>
    req("/api/shares/" + id, { method: "DELETE" }),

  // Collaboration - inbox (invitee sees pending invites)
  inbox: () => req("/api/inbox"),
  respond: (id, accept) =>
    req("/api/shares/" + id + "/respond", {
      method: "POST",
      body: JSON.stringify({ accept }),
    }),

  // Work tracker
  trackerList: () => req("/api/tracker"),
  addClient: (name, id) => req("/api/clients", { method: "POST", body: JSON.stringify({ name, id }) }),
  renameClient: (id, name) =>
    req("/api/clients/" + id, { method: "PATCH", body: JSON.stringify({ name }) }),
  getOwner: (id) => req("/api/owners/" + id),
  addOwner: (o) => req("/api/owners", { method: "POST", body: JSON.stringify(o) }),
  updateOwner: (id, o) =>
    req("/api/owners/" + id, { method: "PATCH", body: JSON.stringify(o) }),
  removeOwner: (id) => req("/api/owners/" + id, { method: "DELETE" }),
  addTx: (t) => req("/api/transactions", { method: "POST", body: JSON.stringify(t) }),
  updateTx: (id, patch) =>
    req("/api/transactions/" + id, { method: "PATCH", body: JSON.stringify(patch) }),
  removeTx: (id) => req("/api/transactions/" + id, { method: "DELETE" }),

  // Accounts (money owed by clients)
  accountsList: () => req("/api/accounts"),
  addAccount: (a) => req("/api/accounts", { method: "POST", body: JSON.stringify(a) }),
  updateAccount: (id, patch) =>
    req("/api/accounts/" + id, { method: "PATCH", body: JSON.stringify(patch) }),
  removeAccount: (id) => req("/api/accounts/" + id, { method: "DELETE" }),

  // Sync - poll for remote changes
  sync: (since) =>
    req("/api/sync" + (since ? "?since=" + encodeURIComponent(since) : "")),
};
