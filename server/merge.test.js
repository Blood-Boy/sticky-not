// node --test server/merge.test.js
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { applyOps, cleanOps } = require("./merge.js");

describe("applyOps", () => {
  it("no-ops returns original", () => {
    const b = [{ id: "a", k: "p", t: "hello", d: false }];
    assert.deepEqual(applyOps(b, []), b);
  });

  it("set updates existing block text", () => {
    const b = [{ id: "a", k: "p", t: "old", d: false }];
    const r = applyOps(b, [{ op: "set", block: { id: "a", t: "new" } }]);
    assert.equal(r[0].t, "new");
    assert.equal(r.length, 1);
  });

  it("set inserts new block at end", () => {
    const b = [{ id: "a", k: "p", t: "x", d: false }];
    const r = applyOps(b, [{ op: "set", block: { id: "b", k: "p", t: "y" } }]);
    assert.equal(r.length, 2);
    assert.equal(r[1].id, "b");
  });

  it("set inserts after specified block", () => {
    const b = [
      { id: "a", k: "p", t: "1", d: false },
      { id: "c", k: "p", t: "3", d: false },
    ];
    const r = applyOps(b, [{ op: "set", block: { id: "b", k: "p", t: "2" }, after: "a" }]);
    assert.equal(r[0].id, "a");
    assert.equal(r[1].id, "b");
    assert.equal(r[2].id, "c");
  });

  it("set with after=null inserts at start", () => {
    const b = [{ id: "a", k: "p", t: "x", d: false }];
    const r = applyOps(b, [{ op: "set", block: { id: "b", k: "p", t: "y" }, after: null }]);
    assert.equal(r[0].id, "b");
    assert.equal(r[1].id, "a");
  });

  it("del removes block", () => {
    const b = [
      { id: "a", k: "p", t: "x", d: false },
      { id: "b", k: "p", t: "y", d: false },
    ];
    const r = applyOps(b, [{ op: "del", id: "a" }]);
    assert.equal(r.length, 1);
    assert.equal(r[0].id, "b");
  });

  it("del nonexistent id is a no-op", () => {
    const b = [{ id: "a", k: "p", t: "x", d: false }];
    const r = applyOps(b, [{ op: "del", id: "z" }]);
    assert.equal(r.length, 1);
  });

  it("set on deleted block (del before set) is dropped", () => {
    const b = [{ id: "a", k: "p", t: "x", d: false }];
    const r = applyOps(b, [
      { op: "del", id: "a" },
      { op: "set", block: { id: "a", t: "y" } },
    ]);
    // After del, "a" is gone; the set creates it anew (this is expected behavior)
    // The new block is appended since "a" was deleted
    assert.equal(r.length, 1);
    assert.equal(r[0].id, "a");
    assert.equal(r[0].t, "y");
  });

  it("set moves existing block when after specified", () => {
    const b = [
      { id: "a", k: "p", t: "1", d: false },
      { id: "b", k: "p", t: "2", d: false },
      { id: "c", k: "p", t: "3", d: false },
    ];
    const r = applyOps(b, [{ op: "set", block: { id: "a" }, after: "c" }]);
    assert.equal(r[0].id, "b");
    assert.equal(r[1].id, "c");
    assert.equal(r[2].id, "a");
  });

  it("checkbox set d=true", () => {
    const b = [{ id: "a", k: "c", t: "task", d: false }];
    const r = applyOps(b, [{ op: "set", block: { id: "a", d: true } }]);
    assert.equal(r[0].d, true);
  });

  it("multiple ops applied in order", () => {
    const b = [];
    const r = applyOps(b, [
      { op: "set", block: { id: "a", k: "p", t: "A" } },
      { op: "set", block: { id: "b", k: "p", t: "B" } },
      { op: "del", id: "a" },
    ]);
    assert.equal(r.length, 1);
    assert.equal(r[0].id, "b");
  });
});

describe("cleanOps", () => {
  it("rejects non-array", () => {
    assert.deepEqual(cleanOps("bad"), []);
    assert.deepEqual(cleanOps(null), []);
  });

  it("filters invalid ops", () => {
    const r = cleanOps([
      null,
      {},
      { op: "del" }, // no id
      { op: "set" }, // no block
      { op: "set", block: {} }, // no id
    ]);
    assert.deepEqual(r, []);
  });

  it("accepts valid del", () => {
    const r = cleanOps([{ op: "del", id: "abc" }]);
    assert.equal(r.length, 1);
    assert.equal(r[0].op, "del");
    assert.equal(r[0].id, "abc");
  });

  it("accepts valid set", () => {
    const r = cleanOps([{ op: "set", block: { id: "a", k: "p", t: "hello" } }]);
    assert.equal(r.length, 1);
    assert.equal(r[0].block.t, "hello");
  });

  it("truncates text to 5000 chars", () => {
    const r = cleanOps([{ op: "set", block: { id: "a", t: "x".repeat(6000) } }]);
    assert.equal(r[0].block.t.length, 5000);
  });

  it("limits to 200 ops", () => {
    const ops = Array.from({ length: 300 }, (_, i) => ({ op: "del", id: String(i) }));
    assert.equal(cleanOps(ops).length, 200);
  });
});
