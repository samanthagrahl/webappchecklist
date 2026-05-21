"use strict";

const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { requireFullBoss, isFullBossUser } = require("../middleware/requireFullBoss");
const {
  listPublicUsers,
  listAdminUsers,
  createUser,
  updateUser,
  deactivateUser,
  permanentlyDeleteUser
} = require("../services/users");

const router = express.Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    if (isFullBossUser(req.user)) {
      const users = await listAdminUsers();
      return res.json({ ok: true, users, admin: true });
    }
    const users = await listPublicUsers();
    return res.json({ ok: true, users, admin: false });
  } catch (err) {
    console.error("[users/list]", err);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

router.post("/", requireAuth, requireFullBoss, async (req, res) => {
  try {
    const user = await createUser(req.body || {});
    return res.status(201).json({ ok: true, user });
  } catch (err) {
    if (err.code === "invalid_input") return res.status(400).json({ ok: false, error: "invalid_input" });
    if (err.code === "invalid_password") return res.status(400).json({ ok: false, error: "invalid_password" });
    if (err.code === "username_taken") return res.status(409).json({ ok: false, error: "username_taken" });
    console.error("[users/create]", err);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

router.patch("/:id", requireAuth, requireFullBoss, async (req, res) => {
  try {
    const user = await updateUser(req.params.id, req.body || {});
    return res.json({ ok: true, user });
  } catch (err) {
    if (err.code === "not_found") return res.status(404).json({ ok: false, error: "not_found" });
    if (err.code === "invalid_input") return res.status(400).json({ ok: false, error: "invalid_input" });
    if (err.code === "invalid_password") return res.status(400).json({ ok: false, error: "invalid_password" });
    console.error("[users/update]", err);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

router.delete("/:id", requireAuth, requireFullBoss, async (req, res) => {
  try {
    const permanent = req.query.permanent === "1" || req.query.permanent === "true";
    if (permanent) {
      const removed = await permanentlyDeleteUser(req.params.id, req.user.id);
      return res.json({ ok: true, removed: true, username: removed.username });
    }
    const user = await deactivateUser(req.params.id, req.user.id);
    return res.json({ ok: true, user });
  } catch (err) {
    if (err.code === "not_found") return res.status(404).json({ ok: false, error: "not_found" });
    if (err.code === "cannot_delete_self") return res.status(400).json({ ok: false, error: "cannot_delete_self" });
    if (err.code === "last_full_boss") return res.status(400).json({ ok: false, error: "last_full_boss" });
    console.error("[users/delete]", err);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

module.exports = router;
