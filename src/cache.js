// Per-browser snapshot of the notes and folders, so the board can paint at once
// while the server answer is on its way. Keyed by username, and cleared on logout.
const PREFIX = "mwn:cache:";

export function readCache(who) {
  try {
    const raw = localStorage.getItem(PREFIX + who);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function writeCache(who, data) {
  try {
    localStorage.setItem(PREFIX + who, JSON.stringify(data));
  } catch (e) {
    // Storage full or blocked: the app works without the cache.
  }
}

export function clearCaches() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch (e) {}
}
