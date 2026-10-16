// Work tracker routes: clients, owners, transactions.
// Every query filters by user_id, because the service role bypasses RLS.
// Owner national IDs and passwords are encrypted at rest (see vault.js).

const { checkClientName, checkOwner, checkTx, RuleError } = require("./tracker-rules.js");
const vault = require("./vault.js");
const { isUuid } = require("./util.js");

const CLIENT_COLS = "id, name, created_at, updated_at";
const OWNER_COLS = "id, name, part_address, national_id_last4, has_password, created_at, updated_at";
const OWNER_FULL_COLS = OWNER_COLS + ", national_id_enc, password_enc";
const TX_COLS = "id, client_id, number, part_title, type, notes, status, created_at, updated_at";

const toClient = (r) => ({ id: r.id, name: r.name, createdAt: r.created_at, updatedAt: r.updated_at });

const toOwner = (r) => ({
  id: r.id,
  name: r.name,
  partAddress: r.part_address,
  nationalIdLast4: r.national_id_last4,
  hasPassword: !!r.has_password,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toTx = (r) => ({
  id: r.id,
  clientId: r.client_id,
  number: r.number,
  partTitle: r.part_title,
  type: r.type,
  notes: r.notes || "",
  status: r.status,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

// Maps Postgres unique-violation errors to the codes the client understands.
function uniqueCode(e) {
  const m = String((e && (e.message || e.details)) || "");
  if (m.includes("clients_user_name_uq")) return "clientexists";
  if (m.includes("owners_user_addr_uq")) return "owneraddr";
  if (m.includes("transactions_user_number_uq")) return "txnumber";
  return "conflict";
}

function mountTracker(app, { supa, auth, fail }) {
  function handle(res, where, e) {
    if (e instanceof RuleError) return res.status(e.status).json({ error: e.code });
    if (e && e.code === "23505") return res.status(409).json({ error: uniqueCode(e) });
    if (e && e.code === "23503") return res.status(400).json({ error: "badinput" });
    return fail(res, where, e);
  }

  // Confirms a client belongs to the current user before a transaction uses it.
  async function ownsClient(db, uid, clientId) {
    const { data, error } = await db
      .from("clients")
      .select("id")
      .eq("id", clientId)
      .eq("user_id", uid)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new RuleError("badclient");
  }

  // Full snapshot the UI renders from. Owners are returned masked.
  app.get("/api/tracker", auth, async (req, res) => {
    try {
      const db = supa();
      const uid = req.user.uid;
      const [c, o, t] = await Promise.all([
        db.from("clients").select(CLIENT_COLS).eq("user_id", uid).order("created_at"),
        db.from("owners").select(OWNER_COLS).eq("user_id", uid).order("created_at"),
        db.from("transactions").select(TX_COLS).eq("user_id", uid).order("created_at"),
      ]);
      if (c.error) throw c.error;
      if (o.error) throw o.error;
      if (t.error) throw t.error;
      res.json({
        clients: c.data.map(toClient),
        owners: o.data.map(toOwner),
        txs: t.data.map(toTx),
      });
    } catch (e) {
      return handle(res, "tracker list", e);
    }
  });

  /* ── Clients ── */

  app.post("/api/clients", auth, async (req, res) => {
    try {
      const name = checkClientName(req.body.name);
      const { data, error } = await supa()
        .from("clients")
        .insert({ user_id: req.user.uid, name })
        .select(CLIENT_COLS)
        .single();
      if (error) throw error;
      res.json(toClient(data));
    } catch (e) {
      return handle(res, "client create", e);
    }
  });

  app.patch("/api/clients/:id", auth, async (req, res) => {
    try {
      if (!isUuid(req.params.id)) return res.status(404).json({ error: "notfound" });
      const name = checkClientName(req.body.name);
      const { data, error } = await supa()
        .from("clients")
        .update({ name, updated_at: new Date().toISOString() })
        .eq("id", req.params.id)
        .eq("user_id", req.user.uid)
        .select(CLIENT_COLS)
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: "notfound" });
      res.json(toClient(data));
    } catch (e) {
      return handle(res, "client rename", e);
    }
  });

  /* ── Owners ── */

  // Returns the decrypted national ID and password. Only the owner's own user can call this.
  app.get("/api/owners/:id", auth, async (req, res) => {
    try {
      if (!isUuid(req.params.id)) return res.status(404).json({ error: "notfound" });
      const { data, error } = await supa()
        .from("owners")
        .select(OWNER_FULL_COLS)
        .eq("id", req.params.id)
        .eq("user_id", req.user.uid)
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: "notfound" });
      res.json({
        ...toOwner(data),
        nationalId: vault.decrypt(data.national_id_enc),
        password: data.password_enc ? vault.decrypt(data.password_enc) : "",
      });
    } catch (e) {
      return handle(res, "owner read", e);
    }
  });

  function ownerRow(input) {
    const o = checkOwner(input);
    return {
      name: o.name,
      part_address: o.partAddress,
      national_id_enc: vault.encrypt(o.nationalId),
      national_id_last4: o.nationalId.slice(-4),
      password_enc: o.password ? vault.encrypt(o.password) : null,
      has_password: !!o.password,
    };
  }

  app.post("/api/owners", auth, async (req, res) => {
    try {
      const row = { user_id: req.user.uid, ...ownerRow(req.body) };
      const { data, error } = await supa().from("owners").insert(row).select(OWNER_COLS).single();
      if (error) throw error;
      res.json(toOwner(data));
    } catch (e) {
      return handle(res, "owner create", e);
    }
  });

  app.patch("/api/owners/:id", auth, async (req, res) => {
    try {
      if (!isUuid(req.params.id)) return res.status(404).json({ error: "notfound" });
      const row = { ...ownerRow(req.body), updated_at: new Date().toISOString() };
      const { data, error } = await supa()
        .from("owners")
        .update(row)
        .eq("id", req.params.id)
        .eq("user_id", req.user.uid)
        .select(OWNER_COLS)
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: "notfound" });
      res.json(toOwner(data));
    } catch (e) {
      return handle(res, "owner update", e);
    }
  });

  app.delete("/api/owners/:id", auth, async (req, res) => {
    try {
      if (!isUuid(req.params.id)) return res.status(404).json({ error: "notfound" });
      const { data, error } = await supa()
        .from("owners")
        .delete()
        .eq("id", req.params.id)
        .eq("user_id", req.user.uid)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: "notfound" });
      res.status(204).end();
    } catch (e) {
      return handle(res, "owner delete", e);
    }
  });

  /* ── Transactions ── */

  app.post("/api/transactions", auth, async (req, res) => {
    try {
      const f = checkTx(req.body, { requireAll: true });
      await ownsClient(supa(), req.user.uid, f.clientId);
      const { data, error } = await supa()
        .from("transactions")
        .insert({
          user_id: req.user.uid,
          client_id: f.clientId,
          number: f.number,
          part_title: f.partTitle,
          type: f.type,
          notes: f.notes,
          status: f.status,
        })
        .select(TX_COLS)
        .single();
      if (error) throw error;
      res.json(toTx(data));
    } catch (e) {
      return handle(res, "transaction create", e);
    }
  });

  app.patch("/api/transactions/:id", auth, async (req, res) => {
    try {
      if (!isUuid(req.params.id)) return res.status(404).json({ error: "notfound" });
      const f = checkTx(req.body, { requireAll: false });
      if (Object.keys(f).length === 0) throw new RuleError("badinput");
      if (f.clientId) await ownsClient(supa(), req.user.uid, f.clientId);
      const row = { updated_at: new Date().toISOString() };
      if (f.clientId !== undefined) row.client_id = f.clientId;
      if (f.number !== undefined) row.number = f.number;
      if (f.partTitle !== undefined) row.part_title = f.partTitle;
      if (f.type !== undefined) row.type = f.type;
      if (f.notes !== undefined) row.notes = f.notes;
      if (f.status !== undefined) row.status = f.status;
      const { data, error } = await supa()
        .from("transactions")
        .update(row)
        .eq("id", req.params.id)
        .eq("user_id", req.user.uid)
        .select(TX_COLS)
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: "notfound" });
      res.json(toTx(data));
    } catch (e) {
      return handle(res, "transaction update", e);
    }
  });

  app.delete("/api/transactions/:id", auth, async (req, res) => {
    try {
      if (!isUuid(req.params.id)) return res.status(404).json({ error: "notfound" });
      const { data, error } = await supa()
        .from("transactions")
        .delete()
        .eq("id", req.params.id)
        .eq("user_id", req.user.uid)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: "notfound" });
      res.status(204).end();
    } catch (e) {
      return handle(res, "transaction delete", e);
    }
  });
}

module.exports = { mountTracker };
