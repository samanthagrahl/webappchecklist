"use strict";

const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { config, assertProductionConfig } = require("./config");
const authRoutes = require("./routes/auth");
const bootstrapRoutes = require("./routes/bootstrap");
const documentsRoutes = require("./routes/documents");
const filesRoutes = require("./routes/files");
const mailRoutes = require("./routes/mail");

assertProductionConfig();

const app = express();
app.disable("x-powered-by");
if (config.trustProxy) app.set("trust proxy", 1);

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false
}));

const corsOptions = config.corsOrigins.length
  ? { origin: config.corsOrigins, credentials: true }
  : { origin: true, credentials: true };
app.use(cors(corsOptions));

app.use(express.json({ limit: `${Math.max(config.uploadMaxMb, 5)}mb` }));

app.use(
  "/api/v1/auth/login",
  rateLimit({ windowMs: 15 * 60 * 1000, max: 40, standardHeaders: true })
);

app.get("/api/v1/health", (req, res) => {
  res.json({
    ok: true,
    service: "immobiliencheck-api",
    mode: "cloud",
    time: new Date().toISOString()
  });
});

app.get("/api/v1/public-config", (req, res) => {
  res.json({
    ok: true,
    cloudMode: true,
    publicUrl: config.publicUrl || null
  });
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/bootstrap", bootstrapRoutes);
app.use("/api/v1/documents", documentsRoutes);
app.use("/api/v1/files", filesRoutes);
app.use("/api/v1/mail", mailRoutes);

/* Öffentliche Erkennung für die Webapp (ohne Login) */
app.get("/api/mail-capabilities", (req, res) => {
  const relay = Boolean(config.mail.enabled && config.mail.host);
  const body = {
    relay,
    apiTokenRequired: false,
    smtpHost: config.mail.host || ""
  };
  if (!relay) {
    body.relayOffDetail = {
      mailEnabled: config.mail.enabled,
      smtpHostSet: Boolean(config.mail.host),
      hint: "MAIL_ENABLED=true und SMTP_HOST in .env setzen, Server neu starten."
    };
  }
  res.json(body);
});

if (config.serveStatic) {
  app.use(express.static(config.siteRoot, { extensions: ["html"] }));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(config.siteRoot, "index.html"));
  });
}

app.use((err, req, res, next) => {
  if (err && err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ ok: false, error: "file_too_large" });
  }
  console.error("[api]", err);
  return res.status(500).json({ ok: false, error: "server_error" });
});

app.listen(config.port, config.host, () => {
  console.log(
    `[immobiliencheck] API + Webapp auf http://${config.host}:${config.port} (NODE_ENV=${config.nodeEnv})`
  );
});
