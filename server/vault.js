// AES-256-GCM encryption for sensitive owner fields (national ID, password).
// The key comes from TRACKER_ENC_KEY: 32 random bytes, base64-encoded.
// Generate one with:  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
// Stored format: "v1:" + base64(iv[12] | tag[16] | ciphertext)

const crypto = require("crypto");

const ALG = "aes-256-gcm";

function loadKey() {
  const k = process.env.TRACKER_ENC_KEY;
  if (!k) throw new Error("MISSING_TRACKER_KEY: set TRACKER_ENC_KEY");
  const b = Buffer.from(k, "base64");
  if (b.length !== 32) throw new Error("BAD_TRACKER_KEY: TRACKER_ENC_KEY must decode to 32 bytes");
  return b;
}

function encrypt(plain, key = loadKey()) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv(ALG, key, iv);
  const ct = Buffer.concat([c.update(String(plain), "utf8"), c.final()]);
  return "v1:" + Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}

function decrypt(stored, key = loadKey()) {
  if (typeof stored !== "string" || !stored.startsWith("v1:")) {
    throw new Error("bad ciphertext format");
  }
  const b = Buffer.from(stored.slice(3), "base64");
  const d = crypto.createDecipheriv(ALG, key, b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8");
}

module.exports = { encrypt, decrypt };
