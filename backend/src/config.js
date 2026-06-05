"use strict";

const fs = require("fs");
const path = require("path");

function resolveEnvFilePath() {
  const siteRoot = path.resolve(__dirname, "..", "..");
  const explicit = String(process.env.INSTANCE_ENV_FILE || process.env.ENV_FILE || "").trim();
  if (explicit) {
    return path.isAbsolute(explicit) ? explicit : path.join(siteRoot, explicit);
  }
  const slug = String(process.env.CUSTOMER_SLUG || "").trim();
  if (slug) {
    return path.join(siteRoot, "customers", slug, "instance.env");
  }
  return path.join(siteRoot, ".env");
}

const envFilePath = resolveEnvFilePath();
if (!fs.existsSync(envFilePath)) {
  const slug = String(process.env.CUSTOMER_SLUG || "").trim();
  const explicit = String(process.env.INSTANCE_ENV_FILE || process.env.ENV_FILE || "").trim();
  if (slug || explicit) {
    throw new Error(`Env-Datei nicht gefunden: ${envFilePath}`);
  }
}
require("dotenv").config({ path: envFilePath });

function parseBool(raw, defaultVal) {
  if (raw === undefined || raw === null || String(raw).trim() === "") return defaultVal;
  const s = String(raw).trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "ja" || s === "on";
}

function parseOrigins(raw) {
  if (!raw || typeof raw !== "string") return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

const config = {
  nodeEnv: String(process.env.NODE_ENV || "development").trim(),
  host: String(process.env.APP_HOST || "0.0.0.0").trim(),
  port: Number.parseInt(String(process.env.APP_PORT || "3847"), 10) || 3847,
  publicUrl: String(process.env.APP_PUBLIC_URL || "").trim(),
  siteRoot: path.resolve(__dirname, "..", ".."),
  serveStatic: parseBool(process.env.APP_SERVE_STATIC, true),
  corsOrigins: parseOrigins(process.env.APP_CORS_ORIGINS),
  jwtSecret: String(process.env.JWT_SECRET || "").trim(),
  jwtExpiresIn: String(process.env.JWT_EXPIRES_IN || "7d").trim(),
  databaseUrl: String(process.env.DATABASE_URL || "").trim(),
  s3: {
    endpoint: String(process.env.S3_ENDPOINT || "").trim(),
    region: String(process.env.S3_REGION || "eu-central").trim(),
    bucket: String(process.env.S3_BUCKET || "").trim(),
    accessKeyId: String(process.env.S3_ACCESS_KEY_ID || "").trim(),
    secretAccessKey: String(process.env.S3_SECRET_ACCESS_KEY || "").trim(),
    publicBaseUrl: String(process.env.S3_PUBLIC_BASE_URL || "").trim(),
    forcePathStyle: parseBool(process.env.S3_FORCE_PATH_STYLE, true)
  },
  mail: {
    enabled: parseBool(process.env.MAIL_ENABLED, false) || parseBool(process.env.SMTP_ENABLED, false),
    host: String(process.env.SMTP_HOST || "").trim(),
    port: Number.parseInt(String(process.env.SMTP_PORT || "587"), 10) || 587,
    secure: parseBool(process.env.SMTP_SECURE, false),
    requireTLS: parseBool(process.env.SMTP_REQUIRE_TLS, true),
    user: String(process.env.SMTP_USER || "").trim(),
    pass: String(process.env.SMTP_PASS || ""),
    from: String(process.env.SMTP_FROM || "").trim()
  },
  uploadMaxMb: Number.parseInt(String(process.env.UPLOAD_MAX_MB || "25"), 10) || 25,
  trustProxy: parseBool(process.env.TRUST_PROXY, false)
};

function prepareRuntimeConfig() {
  if (config.nodeEnv === "production") return;
  if (!config.jwtSecret) {
    config.jwtSecret = "local-dev-only-jwt-secret-min-32-characters-long";
  }
}

function assertProductionConfig() {
  prepareRuntimeConfig();
  if (config.nodeEnv !== "production") return;
  const missing = [];
  if (!config.jwtSecret || config.jwtSecret.length < 32) missing.push("JWT_SECRET (min. 32 Zeichen)");
  if (!config.databaseUrl) missing.push("DATABASE_URL");
  if (!config.s3.endpoint) missing.push("S3_ENDPOINT");
  if (!config.s3.bucket) missing.push("S3_BUCKET");
  if (!config.s3.accessKeyId) missing.push("S3_ACCESS_KEY_ID");
  if (!config.s3.secretAccessKey) missing.push("S3_SECRET_ACCESS_KEY");
  if (missing.length) {
    throw new Error(`Produktions-Konfiguration unvollständig: ${missing.join(", ")}`);
  }
}

module.exports = { config, assertProductionConfig, parseBool };
