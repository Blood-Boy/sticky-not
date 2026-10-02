const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
require("dotenv").config();

const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { createClient } = require("@supabase/supabase-js");

const PORT = process.env.PORT || 4000;
const SECRET = process.env.JWT_SECRET || "dev-only-change-me";
const NAME_RE = /^[\w\u0600-\u06FF.\- ]{2,20}$/;

let sb = null;
function supa() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("MISSING_SUPABASE_CONFIG");
  }
  if (!sb) {
    sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  }
  return sb;
}

function sign(uid) {
  return jwt.sign({ uid }, SECRET, { expiresIn: "30d" });
}

function auth(req, res, next) {
  const h = req.headers.authorization || "";
  const t = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!t) return res.status(401).json({ error: "unauthorized" });
  try {
    req.user = jwt.verify(t, SECRET);
    next();
  } catch (e) {
    res.status(401).json({ error: "unauthorized" });
  }
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

function toNote(r) {
  return {
    id: r.id,
    title: r.title || "",
    folder: r.folder_id || null,
    theme: r.theme || 0,
    blocks: Array.isArray(r.blocks) ? r.blocks : [],
  };
}

function normBlocks(b) {
  if (!Array.isArray(b)) return [];
  return b.slice(0, 500).map((x) => ({
    id: String((x && x.id) || crypto.randomUUID()),
    k: x && x.k === "c" ? "c" : "p",
    t: String((x && x.t) || "").slice(0, 5000),
    d: !!(x && x.d),
  }));
}

async function owned(table, id, uid) {
  const { data, error } = await supa()
    .from(table)
    .select("id")
    .eq("id", id)
    .eq("user_id", uid)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/* ---------------- auth ---------------- */

app.post("/api/auth/login", async (req, res) => {
  try {
    const c = String(req.body.username || "").trim();
    if (!NAME_RE.test(c)) return res.status(400).json({ error: "badname" });
    const { data, error } = await supa()
      .from("profiles")
      .select("id")
      .ilike("username", c)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "notfound" });
    res.json({ token: sign(data.id) });
  } catch (e) {
    res.status(500).json({ error: "server" });
  }
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const c = String(req.body.username || "").trim();
    if (!NAME_RE.test(c)) return res.status(400).json({ error: "badname" });
    const db = supa();
    const { data: dup } = await db.from("profiles").select("id").ilike("username", c).maybeSingle();
    if (dup) return res.status(409).json({ error: "exists" });
    const { data, error } = await db.from("profiles").insert({ username: c }).select("id").single();
    if (error) throw error;
    res.json({ token: sign(data.id) });
  } catch (e) {
    if (String((e && e.message) || "").toLowerCase().includes("duplicate")) {
      return res.status(409).json({ error: "exists" });
    }
    res.status(500).json({ error: "server" });
  }
});

/* ---------------- profile ---------------- */

app.get("/api/me", auth, async (req, res) => {
  try {
    const { data, error } = await supa()
      .from("profiles")
      .select("username, avatar")
      .eq("id", req.user.uid)
      .maybeSingle();
    if (error || !data) return res.status(404).json({ error: "notfound" });
    res.json({ username: data.username, avatar: data.avatar || null });
  } catch (e) {
    res.status(500).json({ error: "server" });
  }
});

app.put("/api/me/avatar", auth, async (req, res) => {
  try {
    let avatar = null;
    if (req.body.avatar) {
      avatar = String(req.body.avatar);
      if (!avatar.startsWith("data:image/") || avatar.length > 300000) {
        return res.status(400).json({ error: "badavatar" });
      }
    }
    const { error } = await supa().from("profiles").update({ avatar }).eq("id", req.user.uid);
    if (error) throw error;
    res.json({ ok: true, avatar });
  } catch (e) {
    res.status(500).json({ error: "server" });
  }
});

/* ---------------- folders ---------------- */

app.get("/api/folders", auth, async (req, res) => {
  try {
    const { data, error } = await supa()
      .from("folders")
      .select("id, name, icon")
      .eq("user_id", req.user.uid)
      .order("created_at");
    if (error) throw error;
    res.json((data || []).map((f) => ({ id: f.id, name: f.name, icon: f.icon || null })));
  } catch (e) {
    res.status(500).json({ error: "server" });
  }
});

app.post("/api/folders", auth, async (req, res) => {
  try {
    const name = String(req.body.name || "").trim().slice(0, 40);
    const icon = String(req.body.icon || "📁").slice(0, 8);
    if (!name) return res.status(400).json({ error: "badname" });
    const { data, error } = await supa()
      .from("folders")
      .insert({ user_id: req.user.uid, name, icon })
      .select("id, name, icon")
      .single();
    if (error) throw error;
    res.json({ id: data.id, name: data.name, icon: data.icon || null });
  } catch (e) {
    res.status(500).json({ error: "server" });
  }
});

app.patch("/api/folders/:id", auth, async (req, res) => {
  try {
    const f = await owned("folders", req.params.id, req.user.uid);
    if (!f) return res.status(404).json({ error: "notfound" });
    const patch = {};
    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim().slice(0, 40);
      if (!name) return res.status(400).json({ error: "badname" });
      patch.name = name;
    }
    if (req.body.icon !== undefined) patch.icon = String(req.body.icon || null).slice(0, 8);
    const { data, error } = await supa()
      .from("folders")
      .update(patch)
      .eq("id", req.params.id)
      .select("id, name, icon")
      .single();
    if (error) throw error;
    res.json({ id: data.id, name: data.name, icon: data.icon || null });
  } catch (e) {
    res.status(500).json({ error: "server" });
  }
});

app.delete("/api/folders/:id", auth, async (req, res) => {
  try {
    const f = await owned("folders", req.params.id, req.user.uid);
    if (!f) return res.status(404).json({ error: "notfound" });
    const { error } = await supa().from("folders").delete().eq("id", req.params.id);
    if (error) throw error;
    res.status(204).end();
  } catch (e) {
    res.status(500).json({ error: "server" });
  }
});

/* ---------------- notes ---------------- */

app.get("/api/notes", auth, async (req, res) => {
  try {
    const { data, error } = await supa()
      .from("notes")
      .select("id, title, folder_id, theme, blocks")
      .eq("user_id", req.user.uid)
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json((data || []).map(toNote));
  } catch (e) {
    res.status(500).json({ error: "server" });
  }
});

app.post("/api/notes", auth, async (req, res) => {
  try {
    let folder = null;
    if (req.body.folder) {
      if (!(await owned("folders", req.body.folder, req.user.uid))) {
        return res.status(404).json({ error: "notfound" });
      }
      folder = req.body.folder;
    }
    const title = String(req.body.title || "").slice(0, 400);
    const theme = Math.max(0, Math.min(50, Number(req.body.theme) || 0));
    const blocks = normBlocks(req.body.blocks);
    const { data, error } = await supa()
      .from("notes")
      .insert({ user_id: req.user.uid, title, folder_id: folder, theme, blocks })
      .select("id, title, folder_id, theme, blocks")
      .single();
    if (error) throw error;
    res.json(toNote(data));
  } catch (e) {
    res.status(500).json({ error: "server" });
  }
});

app.put("/api/notes/:id", auth, async (req, res) => {
  try {
    const n = await owned("notes", req.params.id, req.user.uid);
    if (!n) return res.status(404).json({ error: "notfound" });
    const patch = { updated_at: new Date().toISOString() };
    if (req.body.title !== undefined) patch.title = String(req.body.title).slice(0, 400);
    if (req.body.theme !== undefined) {
      patch.theme = Math.max(0, Math.min(50, Number(req.body.theme) || 0));
    }
    if (req.body.blocks !== undefined) patch.blocks = normBlocks(req.body.blocks);
    if (req.body.folder !== undefined) {
      if (req.body.folder === null) patch.folder_id = null;
      else if (await owned("folders", req.body.folder, req.user.uid)) {
        patch.folder_id = req.body.folder;
      }
    }
    const { data, error } = await supa()
      .from("notes")
      .update(patch)
      .eq("id", req.params.id)
      .select("id, title, folder_id, theme, blocks")
      .single();
    if (error) throw error;
    res.json(toNote(data));
  } catch (e) {
    res.status(500).json({ error: "server" });
  }
});

app.delete("/api/notes/:id", auth, async (req, res) => {
  try {
    const n = await owned("notes", req.params.id, req.user.uid);
    if (!n) return res.status(404).json({ error: "notfound" });
    const { error } = await supa().from("notes").delete().eq("id", req.params.id);
    if (error) throw error;
    res.status(204).end();
  } catch (e) {
    res.status(500).json({ error: "server" });
  }
});

/* ---------------- static (local production run) ---------------- */

const dist = path.join(__dirname, "..", "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.use("/api", (req, res) => res.status(404).json({ error: "notfound" }));

if (require.main === module) {
  app.listen(PORT, () => {
    console.log("sticky-not server on http://localhost:" + PORT);
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.warn("warning: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set - API calls will fail until .env is filled in");
    }
  });
}

module.exports = app;
