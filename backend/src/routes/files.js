"use strict";

const express = require("express");
const multer = require("multer");
const { config } = require("../config");
const { requireAuth } = require("../middleware/auth");
const { storeUpload, getFileDownloadUrl } = require("../services/files");
const s3 = require("../storage/s3");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.uploadMaxMb * 1024 * 1024 }
});

router.post("/", requireAuth, upload.single("file"), async (req, res) => {
  if (!s3.isConfigured()) {
    return res.status(503).json({ ok: false, error: "storage_not_configured" });
  }
  if (!req.file || !req.file.buffer) {
    return res.status(400).json({ ok: false, error: "missing_file" });
  }
  try {
    const stored = await storeUpload({
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      originalName: req.file.originalname,
      userId: req.user.id
    });
    return res.status(201).json({
      ok: true,
      file: {
        id: stored.id,
        name: stored.name,
        mimeType: stored.mimeType
      }
    });
  } catch (err) {
    console.error("[files/upload]", err);
    return res.status(500).json({ ok: false, error: "upload_failed" });
  }
});

router.get("/:fileId/url", requireAuth, async (req, res) => {
  try {
    const result = await getFileDownloadUrl(req.params.fileId);
    if (!result) return res.status(404).json({ ok: false, error: "not_found" });
    return res.json({
      ok: true,
      url: result.url,
      name: result.meta.original_name,
      mimeType: result.meta.mime_type
    });
  } catch (err) {
    console.error("[files/url]", err);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

module.exports = router;
