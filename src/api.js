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
  login: (username) =>
    req("/api/auth/login", { method: "POST", body: JSON.stringify({ username }) }),
  register: (username) =>
    req("/api/auth/register", { method: "POST", body: JSON.stringify({ username }) }),
  me: () => req("/api/me"),
  setAvatar: (avatar) =>
    req("/api/me/avatar", { method: "PUT", body: JSON.stringify({ avatar }) }),
  getFolders: () => req("/api/folders"),
  addFolder: (name, icon) =>
    req("/api/folders", { method: "POST", body: JSON.stringify({ name, icon }) }),
  updateFolder: (id, patch) =>
    req("/api/folders/" + id, { method: "PATCH", body: JSON.stringify(patch) }),
  removeFolder: (id) => req("/api/folders/" + id, { method: "DELETE" }),
  getNotes: () => req("/api/notes"),
  addNote: (n) => req("/api/notes", { method: "POST", body: JSON.stringify(n) }),
  updateNote: (id, patch) =>
    req("/api/notes/" + id, { method: "PUT", body: JSON.stringify(patch) }),
  removeNote: (id) => req("/api/notes/" + id, { method: "DELETE" }),
};
