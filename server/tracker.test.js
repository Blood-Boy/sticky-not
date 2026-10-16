const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const rules = require("./tracker-rules.js");
const vault = require("./vault.js");

const KEY = crypto.randomBytes(32);

test("vault round-trips and uses a fresh IV each time", () => {
  const a = vault.encrypt("12345678901234", KEY);
  const b = vault.encrypt("12345678901234", KEY);
  assert.notEqual(a, b);
  assert.ok(a.startsWith("v1:"));
  assert.equal(vault.decrypt(a, KEY), "12345678901234");
  assert.equal(vault.decrypt(b, KEY), "12345678901234");
});

test("vault rejects tampered ciphertext", () => {
  const s = vault.encrypt("secret", KEY);
  const raw = Buffer.from(s.slice(3), "base64");
  raw[raw.length - 1] ^= 0x01;
  assert.throws(() => vault.decrypt("v1:" + raw.toString("base64"), KEY));
});

test("vault rejects the wrong key and bad format", () => {
  const s = vault.encrypt("secret", KEY);
  assert.throws(() => vault.decrypt(s, crypto.randomBytes(32)));
  assert.throws(() => vault.decrypt("plain", KEY));
});

test("client names need 2 to 60 characters after trimming", () => {
  assert.equal(rules.checkClientName("  أحمد  "), "أحمد");
  assert.throws(() => rules.checkClientName("a"), { code: "badname" });
  assert.throws(() => rules.checkClientName("x".repeat(61)), { code: "badname" });
});

test("owners require a 14-digit national ID and a part address", () => {
  const ok = rules.checkOwner({ name: "محمد", partAddress: "شقة 4", nationalId: "29901011234567", password: "" });
  assert.equal(ok.nationalId, "29901011234567");
  assert.throws(() => rules.checkOwner({ name: "محمد", partAddress: "شقة 4", nationalId: "1234", password: "" }), { code: "badnid" });
  assert.throws(() => rules.checkOwner({ name: "محمد", partAddress: "شقة 4", nationalId: "2990101123456a", password: "" }), { code: "badnid" });
  assert.throws(() => rules.checkOwner({ name: "محمد", partAddress: "", nationalId: "29901011234567", password: "" }), { code: "badaddress" });
  assert.throws(() => rules.checkOwner({ name: "محمد", partAddress: "شقة", nationalId: "29901011234567", password: "x".repeat(129) }), { code: "badpass" });
});

test("owner password is optional", () => {
  const o = rules.checkOwner({ name: "محمد", partAddress: "شقة", nationalId: "29901011234567" });
  assert.equal(o.password, "");
});

test("transactions require all fields on create", () => {
  const t = rules.checkTx(
    { clientId: "c1", number: "1024", partTitle: "الغطاء الخلفي", type: "تقديم", notes: "", status: "ongoing" },
    { requireAll: true }
  );
  assert.equal(t.number, "1024");
  assert.throws(() => rules.checkTx({ clientId: "c1", number: "", partTitle: "x", type: "y", status: "ongoing" }, { requireAll: true }), { code: "badnumber" });
  assert.throws(() => rules.checkTx({ clientId: "c1", number: "1", partTitle: "x", type: "y", status: "lost" }, { requireAll: true }), { code: "badstatus" });
});

test("transaction patches only validate the fields they send", () => {
  const p = rules.checkTx({ status: "done" }, { requireAll: false });
  assert.deepEqual(p, { status: "done" });
  assert.throws(() => rules.checkTx({ notes: "x".repeat(1001) }, { requireAll: false }), { code: "badnotes" });
});
