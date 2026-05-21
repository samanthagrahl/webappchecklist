"use strict";

const express = require("express");
const nodemailer = require("nodemailer");
const { config } = require("../config");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

function sanitizeEmail(raw) {
  const s = String(raw || "").trim();
  const ok = /^[^\s@]+@[^\s@\u0000-\u001f]+$/i.test(s) && !s.includes("..") && s.length <= 254;
  return ok ? s : "";
}

function createTransport() {
  const secure = Boolean(config.mail.secure);
  return nodemailer.createTransport({
    host: config.mail.host,
    port: config.mail.port,
    secure,
    requireTLS: secure ? false : Boolean(config.mail.requireTLS),
    auth: config.mail.user ? { user: config.mail.user, pass: config.mail.pass } : undefined
  });
}

router.get("/capabilities", requireAuth, (req, res) => {
  res.json({
    ok: true,
    relay: Boolean(config.mail.enabled && config.mail.host),
    smtpHost: config.mail.host || ""
  });
});

router.post("/send-report", requireAuth, async (req, res) => {
  if (!config.mail.enabled || !config.mail.host) {
    return res.status(503).json({ ok: false, error: "mail_disabled" });
  }
  const body = req.body || {};
  const to = sanitizeEmail(body.to);
  if (!to) return res.status(400).json({ ok: false, error: "invalid_recipient" });
  const subject = String(body.subject || "").trim().slice(0, 998);
  const text = String(body.text || "").trim();
  const html = String(body.html || "").trim();
  const pdfBase64 = String(body.pdfBase64 || "").trim();
  const pdfFileName = String(body.pdfFileName || "kundenbericht.pdf").trim().slice(0, 200);
  const attachments = [];
  if (pdfBase64) {
    attachments.push({
      filename: pdfFileName.endsWith(".pdf") ? pdfFileName : `${pdfFileName}.pdf`,
      content: Buffer.from(pdfBase64, "base64"),
      contentType: "application/pdf"
    });
  }
  try {
    const transport = createTransport();
    const mail = {
      from: config.mail.from || config.mail.user,
      to,
      subject: subject || "Kundenbericht",
      attachments
    };
    if (html) {
      mail.html = html;
      mail.text = text || html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    } else {
      mail.text = text || "";
    }
    await transport.sendMail(mail);
    return res.json({ ok: true });
  } catch (err) {
    console.error("[mail/send-report]", err);
    return res.status(500).json({ ok: false, error: "send_failed" });
  }
});

module.exports = router;
