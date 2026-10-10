// Collaboration routes: shares, inbox, sync, and scoped CRUD
const { normBlocks, isUuid, likeExact, smallAvatar } = require("./util.js");
const { applyOps, cleanOps } = require("./merge.js");

// ──────────────────────────────────────────────
// Access helpers
// ──────────────────────────────────────────────

/** Returns { note, role: "owner"|"editor" } or null */
async function noteAccess(db, uid, noteId) {
  // Owner check
  const { data: own, error: e1 } = await db
    .from("notes")
    .select("id, user_id, folder_id, title, theme, blocks, version, updated_at")
    .eq("id", noteId)
    .eq("user_id", uid)
    .maybeSingle();
  if (e1) throw e1;
  if (own) return { note: own, role: "owner" };

  // Shared check (accepted share for this note directly)
  const { data: sn, error: e2 } = await db
    .from("shares")
    .select("id")
    .eq("invitee_id", uid)
    .eq("note_id", noteId)
    .eq("status", "accepted")
    .maybeSingle();
  if (e2) throw e2;
  if (sn) {
    const { data: n2, error: e3 } = await db
      .from("notes")
      .select("id, user_id, folder_id, title, theme, blocks, version, updated_at")
      .eq("id", noteId)
      .maybeSingle();
    if (e3) throw e3;
    if (n2) return { note: n2, role: "editor" };
  }

  // Folder-level share check
  const { data: note3, error: e4 } = await db
    .from("notes")
    .select("id, user_id, folder_id, title, theme, blocks, version, updated_at")
    .eq("id", noteId)
    .maybeSingle();
  if (e4) throw e4;
  if (!note3 || !note3.folder_id) return null;

  const { data: sf, error: e5 } = await db
    .from("shares")
    .select("id")
    .eq("invitee_id", uid)
    .eq("folder_id", note3.folder_id)
    .eq("status", "accepted")
    .maybeSingle();
  if (e5) throw e5;
  if (sf) return { note: note3, role: "editor" };

  return null;
}

/** Returns { folder, role: "owner"|"editor" } or null */
async function folderAccess(db, uid, folderId) {
  const { data: own, error: e1 } = await db
    .from("folders")
    .select("id, user_id, name, icon")
    .eq("id", folderId)
    .eq("user_id", uid)
    .maybeSingle();
  if (e1) throw e1;
  if (own) return { folder: own, role: "owner" };

  const { data: sf, error: e2 } = await db
    .from("shares")
    .select("id")
    .eq("invitee_id", uid)
    .eq("folder_id", folderId)
    .eq("status", "accepted")
    .maybeSingle();
  if (e2) throw e2;
  if (sf) {
    const { data: f2, error: e3 } = await db
      .from("folders")
      .select("id, user_id, name, icon")
      .eq("id", folderId)
      .maybeSingle();
    if (e3) throw e3;
    if (f2) return { folder: f2, role: "editor" };
  }
  return null;
}

/** Returns all accepted shares where uid is the invitee */
async function myScope(db, uid) {
  const { data, error } = await db
    .from("shares")
    .select("id, owner_id, note_id, folder_id, created_at")
    .eq("invitee_id", uid)
    .eq("status", "accepted");
  if (error) throw error;
  return data || [];
}

/** Returns notes reachable by uid (own + shared) */
async function reachableNotes(db, uid, cols = "id, title, folder_id, theme, blocks, version, updated_at, user_id", ids = null) {
  // Own notes
  let ownQ = db.from("notes").select(cols).eq("user_id", uid);
  if (ids && ids.length > 0) ownQ = ownQ.in("id", ids);
  const { data: own, error: e1 } = await ownQ;
  if (e1) throw e1;

  // Shared notes (direct)
  const { data: sharedNoteShares, error: e2 } = await db
    .from("shares")
    .select("note_id")
    .eq("invitee_id", uid)
    .eq("status", "accepted")
    .not("note_id", "is", null);
  if (e2) throw e2;

  // Shared folders
  const { data: sharedFolderShares, error: e3 } = await db
    .from("shares")
    .select("folder_id")
    .eq("invitee_id", uid)
    .eq("status", "accepted")
    .not("folder_id", "is", null);
  if (e3) throw e3;

  const sharedNoteIds = (sharedNoteShares || []).map((s) => s.note_id).filter(Boolean);
  const sharedFolderIds = (sharedFolderShares || []).map((s) => s.folder_id).filter(Boolean);

  const extra = [];

  if (sharedNoteIds.length > 0) {
    let q = db.from("notes").select(cols).in("id", sharedNoteIds).neq("user_id", uid);
    if (ids && ids.length > 0) q = q.in("id", ids);
    const { data, error } = await q;
    if (error) throw error;
    if (data) extra.push(...data);
  }

  if (sharedFolderIds.length > 0) {
    let q = db.from("notes").select(cols).in("folder_id", sharedFolderIds).neq("user_id", uid);
    if (ids && ids.length > 0) q = q.in("id", ids);
    const { data, error } = await q;
    if (error) throw error;
    if (data) extra.push(...data);
  }

  // Deduplicate (own notes might also be in shared folder, shouldn't happen but be safe)
  const ownIds = new Set((own || []).map((n) => n.id));
  const uniqueExtra = extra.filter((n) => !ownIds.has(n.id));

  return [...(own || []), ...uniqueExtra];
}

function toNote(r, role) {
  return {
    id: r.id,
    title: r.title || "",
    folder: r.folder_id || null,
    theme: r.theme || 0,
    blocks: Array.isArray(r.blocks) ? r.blocks : [],
    version: r.version || 1,
    updatedAt: r.updated_at || null,
    ownerId: r.user_id || null,
    role: role || "owner",
  };
}

// ──────────────────────────────────────────────
// Route mounting
// ──────────────────────────────────────────────

function mountWorkspace(app, { supa, auth, fail }) {

  /* ── Folders ── */

  app.get("/api/folders", auth, async (req, res) => {
    try {
      const db = supa();
      const uid = req.user.uid;

      // Own folders
      const { data: own, error: e1 } = await db
        .from("folders")
        .select("id, name, icon, user_id")
        .eq("user_id", uid)
        .order("created_at");
      if (e1) throw e1;

      // Shared folders
      const { data: sharedShares, error: e2 } = await db
        .from("shares")
        .select("folder_id")
        .eq("invitee_id", uid)
        .eq("status", "accepted")
        .not("folder_id", "is", null);
      if (e2) throw e2;

      const sharedFolderIds = (sharedShares || []).map((s) => s.folder_id).filter(Boolean);
      let sharedFolders = [];
      if (sharedFolderIds.length > 0) {
        // Get owner info for shared folders
        const { data: sf, error: e3 } = await db
          .from("folders")
          .select("id, name, icon, user_id")
          .in("id", sharedFolderIds);
        if (e3) throw e3;
        if (sf && sf.length > 0) {
          const ownerIds = [...new Set(sf.map((f) => f.user_id))];
          const { data: owners } = await db
            .from("profiles")
            .select("id, username, avatar")
            .in("id", ownerIds);
          const ownerMap = {};
          (owners || []).forEach((o) => { ownerMap[o.id] = o; });
          sharedFolders = sf.map((f) => ({
            id: f.id,
            name: f.name,
            icon: f.icon || null,
            role: "editor",
            owner: ownerMap[f.user_id]
              ? { username: ownerMap[f.user_id].username, avatar: smallAvatar(ownerMap[f.user_id].avatar) }
              : null,
          }));
        }
      }

      const result = [
        ...(own || []).map((f) => ({ id: f.id, name: f.name, icon: f.icon || null, role: "owner" })),
        ...sharedFolders,
      ];

      res.json(result);
    } catch (e) {
      return fail(res, "folders list ws", e);
    }
  });

  app.post("/api/folders", auth, async (req, res) => {
    try {
      const db = supa();
      const name = String(req.body.name || "").trim().slice(0, 40);
      const icon = String(req.body.icon || "📁").slice(0, 8);
      if (!name) return res.status(400).json({ error: "badname" });
      const { data, error } = await db
        .from("folders")
        .insert({ user_id: req.user.uid, name, icon })
        .select("id, name, icon")
        .single();
      if (error) throw error;
      res.json({ id: data.id, name: data.name, icon: data.icon || null, role: "owner" });
    } catch (e) {
      return fail(res, "folders add ws", e);
    }
  });

  app.patch("/api/folders/:id", auth, async (req, res) => {
    try {
      if (!isUuid(req.params.id)) return res.status(404).json({ error: "notfound" });
      const db = supa();
      const access = await folderAccess(db, req.user.uid, req.params.id);
      if (!access) return res.status(404).json({ error: "notfound" });
      if (access.role !== "owner") return res.status(403).json({ error: "forbidden" });

      const patch = {};
      if (req.body.name !== undefined) {
        const name = String(req.body.name).trim().slice(0, 40);
        if (!name) return res.status(400).json({ error: "badname" });
        patch.name = name;
      }
      if (req.body.icon !== undefined) patch.icon = String(req.body.icon || "").slice(0, 8) || null;
      const { data, error } = await db
        .from("folders")
        .update(patch)
        .eq("id", req.params.id)
        .select("id, name, icon")
        .single();
      if (error) throw error;
      res.json({ id: data.id, name: data.name, icon: data.icon || null, role: "owner" });
    } catch (e) {
      return fail(res, "folders update ws", e);
    }
  });

  app.delete("/api/folders/:id", auth, async (req, res) => {
    try {
      if (!isUuid(req.params.id)) return res.status(404).json({ error: "notfound" });
      const db = supa();
      const access = await folderAccess(db, req.user.uid, req.params.id);
      if (!access) return res.status(404).json({ error: "notfound" });
      if (access.role !== "owner") return res.status(403).json({ error: "forbidden" });
      const { error } = await db.from("folders").delete().eq("id", req.params.id);
      if (error) throw error;
      res.status(204).end();
    } catch (e) {
      return fail(res, "folders delete ws", e);
    }
  });

  /* ── Notes ── */

  app.get("/api/notes", auth, async (req, res) => {
    try {
      const db = supa();
      const uid = req.user.uid;
      const idsParam = req.query.ids;
      const ids = idsParam ? idsParam.split(",").filter(isUuid) : null;

      const all = await reachableNotes(db, uid, "id, title, folder_id, theme, blocks, version, updated_at, user_id", ids);

      // Tag each note with role
      const ownNoteSet = new Set();
      const { data: ownCheck } = await db.from("notes").select("id").eq("user_id", uid);
      (ownCheck || []).forEach((n) => ownNoteSet.add(n.id));

      res.json(all.map((n) => toNote(n, ownNoteSet.has(n.id) ? "owner" : "editor")));
    } catch (e) {
      return fail(res, "notes list ws", e);
    }
  });

  app.post("/api/notes", auth, async (req, res) => {
    try {
      const db = supa();
      const uid = req.user.uid;
      let folder = null;
      if (req.body.folder) {
        if (!isUuid(req.body.folder)) return res.status(400).json({ error: "badinput" });
        const fa = await folderAccess(db, uid, req.body.folder);
        if (!fa) return res.status(404).json({ error: "notfound" });
        // Editors can create notes in shared folders
        folder = req.body.folder;
      }
      const title = String(req.body.title || "").slice(0, 400);
      const theme = Math.max(0, Math.min(50, Number(req.body.theme) || 0));
      const blocks = normBlocks(req.body.blocks);
      const { data, error } = await db
        .from("notes")
        .insert({ user_id: uid, title, folder_id: folder, theme, blocks, version: 1 })
        .select("id, title, folder_id, theme, blocks, version, updated_at, user_id")
        .single();
      if (error) throw error;
      res.json(toNote(data, "owner"));
    } catch (e) {
      return fail(res, "notes add ws", e);
    }
  });

  app.put("/api/notes/:id", auth, async (req, res) => {
    try {
      if (!isUuid(req.params.id)) return res.status(404).json({ error: "notfound" });
      const db = supa();
      const uid = req.user.uid;
      const access = await noteAccess(db, uid, req.params.id);
      if (!access) return res.status(404).json({ error: "notfound" });
      const { note, role } = access;

      // Editors can edit content but not move/delete
      const patch = { updated_at: new Date().toISOString(), updated_by: uid };

      // Block-level ops (collaborative editing)
      if (Array.isArray(req.body.ops) && req.body.ops.length > 0) {
        const ops = cleanOps(req.body.ops);
        const clientVersion = Number(req.body.version) || 0;
        if (clientVersion > 0 && clientVersion !== note.version) {
          // Version conflict - return current state so client can rebase
          return res.status(409).json({
            error: "conflict",
            note: toNote(note, role),
          });
        }
        const currentBlocks = Array.isArray(note.blocks) ? note.blocks : [];
        patch.blocks = applyOps(currentBlocks, ops);
        patch.version = (note.version || 1) + 1;
      } else {
        // Full replace (title, theme, blocks, folder)
        if (req.body.title !== undefined) patch.title = String(req.body.title).slice(0, 400);
        if (req.body.theme !== undefined) {
          patch.theme = Math.max(0, Math.min(50, Number(req.body.theme) || 0));
        }
        if (req.body.blocks !== undefined) {
          patch.blocks = normBlocks(req.body.blocks);
          patch.version = (note.version || 1) + 1;
        }
        if (req.body.folder !== undefined && role === "owner") {
          if (req.body.folder === null) {
            patch.folder_id = null;
          } else if (isUuid(req.body.folder)) {
            const fa = await folderAccess(db, uid, req.body.folder);
            if (fa && fa.role === "owner") patch.folder_id = req.body.folder;
          }
        }
      }

      const { data, error } = await db
        .from("notes")
        .update(patch)
        .eq("id", req.params.id)
        .select("id, title, folder_id, theme, blocks, version, updated_at, user_id")
        .single();
      if (error) throw error;
      res.json(toNote(data, role));
    } catch (e) {
      return fail(res, "notes update ws", e);
    }
  });

  app.delete("/api/notes/:id", auth, async (req, res) => {
    try {
      if (!isUuid(req.params.id)) return res.status(404).json({ error: "notfound" });
      const db = supa();
      const access = await noteAccess(db, req.user.uid, req.params.id);
      if (!access) return res.status(404).json({ error: "notfound" });
      if (access.role !== "owner") return res.status(403).json({ error: "forbidden" });
      const { error } = await db.from("notes").delete().eq("id", req.params.id);
      if (error) throw error;
      res.status(204).end();
    } catch (e) {
      return fail(res, "notes delete ws", e);
    }
  });

  /* ── User search ── */

  app.get("/api/users/search", auth, async (req, res) => {
    try {
      const q = String(req.query.q || "").trim().slice(0, 40);
      if (q.length < 2) return res.json([]);
      const db = supa();
      const { data, error } = await db
        .from("profiles")
        .select("id, username, avatar")
        .ilike("username", "%" + likeExact(q) + "%")
        .neq("id", req.user.uid)
        .limit(10);
      if (error) throw error;
      res.json(
        (data || []).map((u) => ({
          id: u.id,
          username: u.username,
          avatar: smallAvatar(u.avatar),
        }))
      );
    } catch (e) {
      return fail(res, "users search", e);
    }
  });

  /* ── Shares ── */

  // List shares for a note or folder (owner sees who they shared with)
  app.get("/api/shares", auth, async (req, res) => {
    try {
      const db = supa();
      const uid = req.user.uid;
      const noteId = req.query.note;
      const folderId = req.query.folder;
      if (!noteId && !folderId) return res.status(400).json({ error: "badinput" });
      if (noteId && !isUuid(noteId)) return res.status(400).json({ error: "badinput" });
      if (folderId && !isUuid(folderId)) return res.status(400).json({ error: "badinput" });

      let q = db
        .from("shares")
        .select("id, invitee_id, status, created_at, responded_at")
        .eq("owner_id", uid);
      if (noteId) q = q.eq("note_id", noteId);
      else q = q.eq("folder_id", folderId);

      const { data: shares, error: e1 } = await q;
      if (e1) throw e1;

      if (!shares || shares.length === 0) return res.json([]);

      const inviteeIds = [...new Set(shares.map((s) => s.invitee_id))];
      const { data: profiles } = await db
        .from("profiles")
        .select("id, username, avatar")
        .in("id", inviteeIds);
      const pmap = {};
      (profiles || []).forEach((p) => { pmap[p.id] = p; });

      res.json(
        shares.map((s) => ({
          id: s.id,
          status: s.status,
          createdAt: s.created_at,
          respondedAt: s.responded_at || null,
          invitee: pmap[s.invitee_id]
            ? {
                id: s.invitee_id,
                username: pmap[s.invitee_id].username,
                avatar: smallAvatar(pmap[s.invitee_id].avatar),
              }
            : { id: s.invitee_id, username: "؟", avatar: null },
        }))
      );
    } catch (e) {
      return fail(res, "shares list", e);
    }
  });

  // Send an invite
  app.post("/api/shares", auth, async (req, res) => {
    try {
      const db = supa();
      const uid = req.user.uid;
      const { username, note: noteId, folder: folderId } = req.body;

      if (!username || typeof username !== "string") return res.status(400).json({ error: "badinput" });
      if (!noteId && !folderId) return res.status(400).json({ error: "badinput" });
      if (noteId && !isUuid(noteId)) return res.status(400).json({ error: "badinput" });
      if (folderId && !isUuid(folderId)) return res.status(400).json({ error: "badinput" });

      // Verify ownership
      if (noteId) {
        const { data: n } = await db.from("notes").select("id").eq("id", noteId).eq("user_id", uid).maybeSingle();
        if (!n) return res.status(403).json({ error: "forbidden" });
      } else {
        const { data: f } = await db.from("folders").select("id").eq("id", folderId).eq("user_id", uid).maybeSingle();
        if (!f) return res.status(403).json({ error: "forbidden" });
      }

      // Find invitee
      const { data: invitee, error: e1 } = await db
        .from("profiles")
        .select("id")
        .ilike("username", likeExact(username.trim()))
        .maybeSingle();
      if (e1) throw e1;
      if (!invitee) return res.status(404).json({ error: "usernotfound" });
      if (invitee.id === uid) return res.status(400).json({ error: "selfshare" });

      // Insert share (unique index prevents duplicates)
      const row = {
        owner_id: uid,
        invitee_id: invitee.id,
        status: "pending",
        kind: noteId ? "note" : "folder",
      };
      if (noteId) row.note_id = noteId;
      else row.folder_id = folderId;

      const { data, error: e2 } = await db
        .from("shares")
        .insert(row)
        .select("id, status, created_at")
        .single();
      if (e2) {
        if (e2.code === "23505") return res.status(409).json({ error: "alreadyshared" });
        throw e2;
      }
      res.json({ id: data.id, status: data.status, createdAt: data.created_at });
    } catch (e) {
      return fail(res, "shares add", e);
    }
  });

  // Remove a share (owner can revoke, invitee can leave)
  app.delete("/api/shares/:id", auth, async (req, res) => {
    try {
      if (!isUuid(req.params.id)) return res.status(404).json({ error: "notfound" });
      const db = supa();
      const uid = req.user.uid;
      const { data: share, error: e1 } = await db
        .from("shares")
        .select("id, owner_id, invitee_id")
        .eq("id", req.params.id)
        .maybeSingle();
      if (e1) throw e1;
      if (!share) return res.status(404).json({ error: "notfound" });
      if (share.owner_id !== uid && share.invitee_id !== uid) {
        return res.status(403).json({ error: "forbidden" });
      }
      const { error: e2 } = await db.from("shares").delete().eq("id", req.params.id);
      if (e2) throw e2;
      res.status(204).end();
    } catch (e) {
      return fail(res, "shares delete", e);
    }
  });

  /* ── Inbox ── */

  app.get("/api/inbox", auth, async (req, res) => {
    try {
      const db = supa();
      const uid = req.user.uid;
      const { data: shares, error: e1 } = await db
        .from("shares")
        .select("id, owner_id, note_id, folder_id, status, created_at")
        .eq("invitee_id", uid)
        .order("created_at", { ascending: false })
        .limit(50);
      if (e1) throw e1;
      if (!shares || shares.length === 0) return res.json([]);

      const ownerIds = [...new Set(shares.map((s) => s.owner_id))];
      const noteIds = shares.map((s) => s.note_id).filter(Boolean);
      const folderIds = shares.map((s) => s.folder_id).filter(Boolean);

      const [ownersRes, notesRes, foldersRes] = await Promise.all([
        db.from("profiles").select("id, username, avatar").in("id", ownerIds),
        noteIds.length > 0 ? db.from("notes").select("id, title").in("id", noteIds) : { data: [] },
        folderIds.length > 0 ? db.from("folders").select("id, name, icon").in("id", folderIds) : { data: [] },
      ]);

      const omap = {};
      (ownersRes.data || []).forEach((o) => { omap[o.id] = o; });
      const nmap = {};
      (notesRes.data || []).forEach((n) => { nmap[n.id] = n; });
      const fmap = {};
      (foldersRes.data || []).forEach((f) => { fmap[f.id] = f; });

      res.json(
        shares.map((s) => {
          const owner = omap[s.owner_id];
          const note = s.note_id ? nmap[s.note_id] : null;
          const folder = s.folder_id ? fmap[s.folder_id] : null;
          return {
            id: s.id,
            status: s.status,
            createdAt: s.created_at,
            kind: s.note_id ? "note" : "folder",
            owner: owner
              ? { username: owner.username, avatar: smallAvatar(owner.avatar) }
              : { username: "؟", avatar: null },
            target: note
              ? { id: note.id, name: note.title || "نوت بدون اسم" }
              : folder
              ? { id: folder.id, name: (folder.icon || "📁") + " " + folder.name }
              : null,
          };
        })
      );
    } catch (e) {
      return fail(res, "inbox", e);
    }
  });

  // Accept or decline an invite
  app.post("/api/shares/:id/respond", auth, async (req, res) => {
    try {
      if (!isUuid(req.params.id)) return res.status(404).json({ error: "notfound" });
      const db = supa();
      const uid = req.user.uid;
      const accept = req.body.accept === true || req.body.accept === "true";

      const { data: share, error: e1 } = await db
        .from("shares")
        .select("id, invitee_id, status")
        .eq("id", req.params.id)
        .maybeSingle();
      if (e1) throw e1;
      if (!share) return res.status(404).json({ error: "notfound" });
      if (share.invitee_id !== uid) return res.status(403).json({ error: "forbidden" });
      if (share.status !== "pending") return res.status(409).json({ error: "alreadyresponded" });

      const newStatus = accept ? "accepted" : "declined";
      const { error: e2 } = await db
        .from("shares")
        .update({ status: newStatus, responded_at: new Date().toISOString() })
        .eq("id", req.params.id);
      if (e2) throw e2;
      res.json({ ok: true, status: newStatus });
    } catch (e) {
      return fail(res, "shares respond", e);
    }
  });

  /* ── Sync ── */

  // Returns notes that changed since `since` (ISO string or epoch ms)
  app.get("/api/sync", auth, async (req, res) => {
    try {
      const db = supa();
      const uid = req.user.uid;
      const since = req.query.since;
      let sinceDate = null;
      if (since) {
        const d = new Date(isNaN(since) ? since : Number(since));
        if (!isNaN(d.getTime())) sinceDate = d.toISOString();
      }

      let q = db.from("notes").select("id, title, folder_id, theme, blocks, version, updated_at, user_id");
      const scopeIds = await getReachableNoteIds(db, uid);
      if (scopeIds.length === 0) {
        return res.json({ notes: [], ts: new Date().toISOString() });
      }
      q = q.in("id", scopeIds);
      if (sinceDate) q = q.gt("updated_at", sinceDate);

      const { data, error } = await q;
      if (error) throw error;

      // Determine role for each note
      const ownNoteSet = new Set();
      const { data: ownIds } = await db.from("notes").select("id").eq("user_id", uid).in("id", scopeIds);
      (ownIds || []).forEach((n) => ownNoteSet.add(n.id));

      res.json({
        notes: (data || []).map((n) => toNote(n, ownNoteSet.has(n.id) ? "owner" : "editor")),
        ts: new Date().toISOString(),
      });
    } catch (e) {
      return fail(res, "sync", e);
    }
  });
}

/** Helper to get all note IDs reachable by uid (for sync) */
async function getReachableNoteIds(db, uid) {
  const { data: own } = await db.from("notes").select("id").eq("user_id", uid);
  const ownIds = (own || []).map((n) => n.id);

  const { data: sharedNoteShares } = await db
    .from("shares")
    .select("note_id")
    .eq("invitee_id", uid)
    .eq("status", "accepted")
    .not("note_id", "is", null);
  const sharedNoteIds = (sharedNoteShares || []).map((s) => s.note_id).filter(Boolean);

  const { data: sharedFolderShares } = await db
    .from("shares")
    .select("folder_id")
    .eq("invitee_id", uid)
    .eq("status", "accepted")
    .not("folder_id", "is", null);
  const sharedFolderIds = (sharedFolderShares || []).map((s) => s.folder_id).filter(Boolean);

  let folderNoteIds = [];
  if (sharedFolderIds.length > 0) {
    const { data: fn } = await db.from("notes").select("id").in("folder_id", sharedFolderIds).neq("user_id", uid);
    folderNoteIds = (fn || []).map((n) => n.id);
  }

  return [...new Set([...ownIds, ...sharedNoteIds, ...folderNoteIds])];
}

module.exports = { mountWorkspace };
