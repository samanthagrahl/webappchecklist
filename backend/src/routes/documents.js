"use strict";

const express = require("express");
const { getDocument, putDocument } = require("../services/documents");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/:docKey", requireAuth, async (req, res) => {
  try {
    const doc = await getDocument(req.params.docKey);
    if (!doc) return res.status(404).json({ ok: false, error: "not_found" });
    return res.json({ ok: true, ...doc });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ ok: false, error: err.message || "server_error" });
  }
});

router.put("/:docKey", requireAuth, async (req, res) => {
  try {
    const payload = req.body && req.body.payload;
    if (payload === undefined) {
      return res.status(400).json({ ok: false, error: "missing_payload" });
    }
    const expectedVersion = req.body.version != null ? Number(req.body.version) : null;
    const result = await putDocument(
      req.params.docKey,
      payload,
      expectedVersion,
      req.user.id
    );
    return res.json({ ok: true, version: result.version });
  } catch (err) {
    if (err.status === 409) {
      return res.status(409).json({
        ok: false,
        error: "version_conflict",
        currentVersion: err.currentVersion
      });
    }
    const status = err.status || 500;
    return res.status(status).json({ ok: false, error: err.message || "server_error" });
  }
});

module.exports = router;
