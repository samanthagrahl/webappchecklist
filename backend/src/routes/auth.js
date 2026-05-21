"use strict";

const express = require("express");
const { verifyLogin } = require("../services/users");
const { signToken } = require("../middleware/auth");

const router = express.Router();

router.post("/login", async (req, res) => {
  const username = String((req.body && req.body.username) || "").trim();
  const password = String((req.body && req.body.password) || "");
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: "missing_credentials" });
  }
  try {
    const user = await verifyLogin(username, password);
    if (!user) {
      return res.status(401).json({ ok: false, error: "invalid_credentials" });
    }
    const token = signToken(user);
    return res.json({
      ok: true,
      token,
      user: {
        username: user.username,
        role: user.role,
        label: user.label,
        manageEmployeeUsernames: user.manageEmployeeUsernames,
        allowedChecklistTemplateIds: user.allowedChecklistTemplateIds
      }
    });
  } catch (err) {
    console.error("[auth/login]", err);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

module.exports = router;
