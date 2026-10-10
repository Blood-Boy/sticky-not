// Block-level merge for concurrent note editing
// Each block has: { id, k (type: "p"|"c"), t (text), d (done) }
// Ops: { op:"set", block:{id,...fields}, after?:id|null } | { op:"del", id }
// after=null means "move to start", after=undefined means "don't move"

const MAX_BLOCKS = 500;

/**
 * Apply ops to a blocks array, returning the new array.
 * "Different lines: both survive. Same line last-write-wins. Deleted edit dropped."
 */
function applyOps(blocks, ops) {
  if (!Array.isArray(ops) || ops.length === 0) return blocks;
  let arr = blocks.slice();

  for (const op of ops) {
    if (!op || typeof op !== "object") continue;

    if (op.op === "del") {
      arr = arr.filter((b) => b.id !== op.id);
    } else if (op.op === "set") {
      const blk = op.block;
      if (!blk || !blk.id) continue;
      const idx = arr.findIndex((b) => b.id === blk.id);

      if (idx === -1) {
        // New block - insert at position
        const newBlock = {
          id: blk.id,
          k: blk.k === "c" ? "c" : "p",
          t: String(blk.t || "").slice(0, 5000),
          d: !!(blk.d),
        };
        if (op.after === null) {
          // Insert at start
          arr.unshift(newBlock);
        } else if (op.after !== undefined) {
          // Insert after specific block
          const afterIdx = arr.findIndex((b) => b.id === op.after);
          if (afterIdx === -1) {
            arr.push(newBlock); // fallback: append
          } else {
            arr.splice(afterIdx + 1, 0, newBlock);
          }
        } else {
          arr.push(newBlock); // append
        }
      } else {
        // Existing block - update fields (last write wins)
        const updated = { ...arr[idx] };
        if (blk.k !== undefined) updated.k = blk.k === "c" ? "c" : "p";
        if (blk.t !== undefined) updated.t = String(blk.t).slice(0, 5000);
        if (blk.d !== undefined) updated.d = !!(blk.d);
        arr[idx] = updated;

        // Move if after specified
        if (op.after !== undefined) {
          arr.splice(idx, 1);
          if (op.after === null) {
            arr.unshift(updated);
          } else {
            const afterIdx = arr.findIndex((b) => b.id === op.after);
            if (afterIdx === -1) {
              arr.push(updated);
            } else {
              arr.splice(afterIdx + 1, 0, updated);
            }
          }
        }
      }

      if (arr.length > MAX_BLOCKS) arr = arr.slice(0, MAX_BLOCKS);
    }
  }

  return arr;
}

/**
 * Validate and sanitize ops from an untrusted request body.
 */
function cleanOps(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((op) => op && typeof op === "object")
    .filter((op) => op.op === "del" || op.op === "set")
    .map((op) => {
      if (op.op === "del") {
        if (typeof op.id !== "string" || !op.id) return null;
        return { op: "del", id: op.id };
      }
      // set
      const blk = op.block;
      if (!blk || typeof blk !== "object" || typeof blk.id !== "string" || !blk.id) return null;
      const clean = { op: "set", block: { id: blk.id } };
      if (blk.k !== undefined) clean.block.k = blk.k === "c" ? "c" : "p";
      if (blk.t !== undefined) clean.block.t = String(blk.t).slice(0, 5000);
      if (blk.d !== undefined) clean.block.d = !!(blk.d);
      if (op.after === null) clean.after = null;
      else if (typeof op.after === "string" && op.after) clean.after = op.after;
      return clean;
    })
    .filter(Boolean)
    .slice(0, 200); // max 200 ops per request
}

module.exports = { applyOps, cleanOps, MAX_BLOCKS };
