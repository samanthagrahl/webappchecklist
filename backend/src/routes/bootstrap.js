"use strict";

const express = require("express");
const { getBootstrap } = require("../services/documents");
const s3 = require("../storage/s3");
const { config } = require("../config");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const documents = await getBootstrap();
    return res.json({
      ok: true,
      documents,
      user: req.user,
      capabilities: {
        objectStorage: s3.isConfigured(),
        mail: Boolean(config.mail.enabled && config.mail.host),
        publicUrl: config.publicUrl || null
      }
    });
  } catch (err) {
    console.error("[bootstrap]", err);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

module.exports = router;
