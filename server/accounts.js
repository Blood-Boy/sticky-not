// Accounts: money owed by registered clients (from the work tracker).
// Routes are online only.
const { RuleError } = require("./tracker-rules.js");
const { isUuid } = require("./util.js");

const ACCOUNT_COLS = "id, client_id, amount, item, notes, paid, created_at, updated_at";
const MAX_AMOUNT = 9999999999.99;

const toAccount = (r) => ({
  id: r.id,
  clientId: r.client_id,
  amount: Number(r.amount),
  item: r.item,
  notes: r.notes || "",
  paid: !!r.paid,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

// Validates the fields a client may send. Only the fields present are checked
// (requireAll=false is used for partial updates).
function checkAccount(input, { requireAll = true } = {}) {
  const src = input && typeof input === "object" ? input : {};
  const out = {};
  const has = (k) => src[k] !== undefined;

  if (requireAll || has("clientId")) {
    if (!isUuid(src.clientId)) throw new RuleError("badclient");
    out.clientId = src.clientId;
  }
  if (requireAll || has("amount")) {
    const n = typeof src.amount === "string" ? Number(src.amount.replace(",", ".")) : src.amount;
    if (typeof n !== "number" || !Number.isFinite(n) || n <= 0 || n > MAX_AMOUNT) {
      throw new RuleError("badamount");
    }
    out.amount = Math.round(n * 100) / 100;
  }
  if (requireAll || has("item")) {
    const item = String(src.item ?? "").trim();
    if (item.length < 1 || item.length > 80) throw new RuleError("baditem");
    out.item = item;
  }
  if (requireAll || has("notes")) {
    const notes = String(src.notes ?? "");
    if (notes.length > 1000) throw new RuleError("badnotes");
    out.notes = notes;
  }
  if (requireAll || has("paid")) {
    if (typeof src.paid !== "boolean") throw new RuleError("badinput");
    out.paid = src.paid;
  }
  return out;
}

function mountAccounts(app, { supa, auth, fail }) {
  function handle(res, where, e) {
    if (e instanceof RuleError) return res.status(e.status || 400).json({ error: e.code });
    if (e && e.code === "23503") return res.status(400).json({ error: "badclient" });
    return fail(res, where, e);
  }

  // The client must belong to this user.
  async function ownsClient(uid, clientId) {
    const { data, error } = await supa()
      .from("clients").select("id").eq("id", clientId).eq("user_id", uid).maybeSingle();
    if (error) throw error;
    if (!data) throw new RuleError("badclient");
  }

  app.get("/api/accounts", auth, async (req, res) => {
    try {
      const { data, error } = await supa()
        .from("accounts")
        .select(ACCOUNT_COLS)
        .eq("user_id", req.user.uid)
        .order("created_at", { ascending: false });
      if (error) throw error;
      res.json((data || []).map(toAccount));
    } catch (e) {
      return handle(res, "accounts list", e);
    }
  });

  app.post("/api/accounts", auth, async (req, res) => {
    try {
      const f = checkAccount(req.body, { requireAll: true });
      await ownsClient(req.user.uid, f.clientId);
      const { data, error } = await supa()
        .from("accounts")
        .insert({
          user_id: req.user.uid,
          client_id: f.clientId,
          amount: f.amount,
          item: f.item,
          notes: f.notes,
          paid: f.paid,
        })
        .select(ACCOUNT_COLS)
        .single();
      if (error) throw error;
      res.json(toAccount(data));
    } catch (e) {
      return handle(res, "account create", e);
    }
  });

  app.patch("/api/accounts/:id", auth, async (req, res) => {
    try {
      if (!isUuid(req.params.id)) return res.status(404).json({ error: "notfound" });
      const f = checkAccount(req.body, { requireAll: false });
      if (Object.keys(f).length === 0) throw new RuleError("badinput");
      if (f.clientId) await ownsClient(req.user.uid, f.clientId);
      const row = { updated_at: new Date().toISOString() };
      if (f.clientId !== undefined) row.client_id = f.clientId;
      if (f.amount !== undefined) row.amount = f.amount;
      if (f.item !== undefined) row.item = f.item;
      if (f.notes !== undefined) row.notes = f.notes;
      if (f.paid !== undefined) row.paid = f.paid;
      const { data, error } = await supa()
        .from("accounts")
        .update(row)
        .eq("id", req.params.id)
        .eq("user_id", req.user.uid)
        .select(ACCOUNT_COLS)
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: "notfound" });
      res.json(toAccount(data));
    } catch (e) {
      return handle(res, "account update", e);
    }
  });

  app.delete("/api/accounts/:id", auth, async (req, res) => {
    try {
      if (!isUuid(req.params.id)) return res.status(404).json({ error: "notfound" });
      const { data, error } = await supa()
        .from("accounts")
        .delete()
        .eq("id", req.params.id)
        .eq("user_id", req.user.uid)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: "notfound" });
      res.status(204).end();
    } catch (e) {
      return handle(res, "account delete", e);
    }
  });
}

module.exports = { mountAccounts, checkAccount, toAccount };
