// Shared utilities for the API server
const crypto = require("crypto");

// username: 2-20 chars, Arabic/Latin/digits/dot/dash/space
const NAME_RE = /^[\w؀-ۿ.\- ]{2,20}$/;

function isUuid(s) {
  return typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
}

// Escape ilike wildcards so % and _ in usernames are treated literally
function likeExact(s) {
  return s.replace(/[\\%_]/g, "\\$&");
}

// Truncate avatar data URI for listings (saves bandwidth)
function smallAvatar(a) {
  if (!a || typeof a !== "string") return null;
  if (a.length <= 200) return a;
  return a.slice(0, 200);
}

// Normalize block array - sanitize untrusted client data
function normBlocks(b) {
  if (!Array.isArray(b)) return [];
  return b.slice(0, 500).map((x) => ({
    id: String((x && x.id) || crypto.randomUUID()),
    k: x && x.k === "c" ? "c" : "p",
    t: String((x && x.t) || "").slice(0, 5000),
    d: !!(x && x.d),
  }));
}

module.exports = { NAME_RE, isUuid, likeExact, smallAvatar, normBlocks };
