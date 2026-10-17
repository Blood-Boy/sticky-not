const { test } = require("node:test");
const assert = require("node:assert/strict");
const { checkAccount } = require("./accounts.js");
const { RuleError } = require("./tracker-rules.js");

const CID = "00000000-0000-4000-8000-0000000000c1";
const ok = { clientId: CID, amount: 150.5, item: "نقل ملكية", notes: "", paid: false };

const codeOf = (fn) => {
  try { fn(); } catch (e) { assert.ok(e instanceof RuleError); return e.code; }
  return null;
};

test("a full account passes and the amount is rounded to 2 decimals", () => {
  const f = checkAccount({ ...ok, amount: "12.345" });
  assert.equal(f.amount, 12.35);
  assert.equal(f.item, "نقل ملكية");
});

test("amount must be a positive number up to the limit", () => {
  assert.equal(codeOf(() => checkAccount({ ...ok, amount: 0 })), "badamount");
  assert.equal(codeOf(() => checkAccount({ ...ok, amount: -5 })), "badamount");
  assert.equal(codeOf(() => checkAccount({ ...ok, amount: "abc" })), "badamount");
  assert.equal(codeOf(() => checkAccount({ ...ok, amount: 1e11 })), "badamount");
});

test("client id must be a uuid", () => {
  assert.equal(codeOf(() => checkAccount({ ...ok, clientId: "x" })), "badclient");
});

test("item is required and at most 80 characters", () => {
  assert.equal(codeOf(() => checkAccount({ ...ok, item: "   " })), "baditem");
  assert.equal(codeOf(() => checkAccount({ ...ok, item: "أ".repeat(81) })), "baditem");
});

test("notes are limited to 1000 characters and paid must be a boolean", () => {
  assert.equal(codeOf(() => checkAccount({ ...ok, notes: "a".repeat(1001) })), "badnotes");
  assert.equal(codeOf(() => checkAccount({ ...ok, paid: "yes" })), "badinput");
});

test("partial update checks only the fields sent", () => {
  assert.deepEqual(checkAccount({ paid: true }, { requireAll: false }), { paid: true });
  assert.equal(codeOf(() => checkAccount({ amount: 0 }, { requireAll: false })), "badamount");
});
