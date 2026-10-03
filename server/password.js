const crypto = require("crypto");
const { promisify } = require("util");

const scrypt = promisify(crypto.scrypt);
const KEYLEN = 64;
const PARAMS = { N: 16384, r: 8, p: 1 };

// stored format: scrypt$<salt base64>$<key base64>
async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, KEYLEN, PARAMS);
  return ["scrypt", salt.toString("base64"), key.toString("base64")].join("$");
}

async function verifyPassword(password, stored) {
  if (typeof stored !== "string") return false;
  const [alg, s, k] = stored.split("$");
  if (alg !== "scrypt" || !s || !k) return false;
  const expected = Buffer.from(k, "base64");
  const key = await scrypt(password, Buffer.from(s, "base64"), expected.length, PARAMS);
  return crypto.timingSafeEqual(key, expected);
}

// burns the same CPU as a real check, so "no such user" isn't faster than "wrong password"
let dummy = null;
async function fakeVerify(password) {
  if (!dummy) dummy = await hashPassword("dummy-password");
  await verifyPassword(password, dummy);
  return false;
}

module.exports = { hashPassword, verifyPassword, fakeVerify };
