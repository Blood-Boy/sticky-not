// Browser-side merge utilities (mirrors server/merge.js)
// Handles optimistic updates and rebasing for collaborative editing

const MAX_BLOCKS = 500;

/**
 * Apply ops to a blocks array, returning the new array.
 */
export function applyOps(blocks, ops) {
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
        const newBlock = {
          id: blk.id,
          k: blk.k === "c" ? "c" : "p",
          t: String(blk.t || "").slice(0, 5000),
          d: !!(blk.d),
        };
        if (op.after === null) {
          arr.unshift(newBlock);
        } else if (op.after !== undefined) {
          const afterIdx = arr.findIndex((b) => b.id === op.after);
          if (afterIdx === -1) arr.push(newBlock);
          else arr.splice(afterIdx + 1, 0, newBlock);
        } else {
          arr.push(newBlock);
        }
      } else {
        const updated = { ...arr[idx] };
        if (blk.k !== undefined) updated.k = blk.k === "c" ? "c" : "p";
        if (blk.t !== undefined) updated.t = String(blk.t).slice(0, 5000);
        if (blk.d !== undefined) updated.d = !!(blk.d);
        arr[idx] = updated;

        if (op.after !== undefined) {
          arr.splice(idx, 1);
          if (op.after === null) {
            arr.unshift(updated);
          } else {
            const afterIdx = arr.findIndex((b) => b.id === op.after);
            if (afterIdx === -1) arr.push(updated);
            else arr.splice(afterIdx + 1, 0, updated);
          }
        }
      }
      if (arr.length > MAX_BLOCKS) arr = arr.slice(0, MAX_BLOCKS);
    }
  }
  return arr;
}

/**
 * Compute ops that transform `base` into `current`.
 * Used to send only the diff to the server.
 */
export function diffBlocks(base, current) {
  const ops = [];
  const baseMap = new Map(base.map((b, i) => [b.id, { ...b, idx: i }]));
  const curMap = new Map(current.map((b, i) => [b.id, { ...b, idx: i }]));

  // Deleted blocks
  for (const [id] of baseMap) {
    if (!curMap.has(id)) {
      ops.push({ op: "del", id });
    }
  }

  // Added or changed blocks
  let prevId = null; // track "after" for ordering
  for (const [id, cur] of curMap) {
    const base_ = baseMap.get(id);
    if (!base_) {
      // New block - include position
      ops.push({ op: "set", block: { id, k: cur.k, t: cur.t, d: cur.d }, after: prevId });
    } else {
      // Changed block
      const changed = base_.k !== cur.k || base_.t !== cur.t || base_.d !== cur.d;
      const moved = base_.idx !== cur.idx;
      if (changed || moved) {
        const op = { op: "set", block: { id } };
        if (changed) {
          if (base_.k !== cur.k) op.block.k = cur.k;
          if (base_.t !== cur.t) op.block.t = cur.t;
          if (base_.d !== cur.d) op.block.d = cur.d;
        }
        if (moved) op.after = prevId;
        ops.push(op);
      }
    }
    prevId = id;
  }

  return ops;
}

/**
 * Rebase local changes on top of a newer server state.
 * `localOps` = what the user did since their last sync
 * `serverBlocks` = current server state
 */
export function rebase(localOps, serverBlocks) {
  return applyOps(serverBlocks, localOps);
}

/**
 * Returns true if current blocks differ from base.
 */
export function isDirty(base, current) {
  if (base.length !== current.length) return true;
  for (let i = 0; i < base.length; i++) {
    const a = base[i], b = current[i];
    if (a.id !== b.id || a.k !== b.k || a.t !== b.t || a.d !== b.d) return true;
  }
  return false;
}
