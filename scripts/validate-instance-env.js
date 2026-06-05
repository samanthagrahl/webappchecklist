"use strict";

/**
 * Prüft eine Kunden-Instanz-.env vor dem Deploy.
 *
 * Beispiel:
 *   node scripts/validate-instance-env.js customers/kunde-a/instance.env
 *   node scripts/validate-instance-env.js --slug kunde-a
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        out[key] = true;
      } else {
        out[key] = next;
        i += 1;
      }
    } else {
      out._.push(arg);
    }
  }
  return out;
}

function parseEnvFile(content) {
  const env = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function isPlaceholder(value) {
  const s = String(value || "").trim();
  if (!s) return true;
  return (
    s.includes("deine-domain.de") ||
    s.includes("your-objectstorage.com") ||
    s === "USER:PASS@HOST" ||
    s.includes("USER:PASS@HOST") ||
    s.startsWith("postgres://USER:")
  );
}

function check(env) {
  const errors = [];
  const warnings = [];

  const required = [
    "NODE_ENV",
    "APP_PORT",
    "APP_PUBLIC_URL",
    "JWT_SECRET",
    "DATABASE_URL",
    "S3_ENDPOINT",
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY"
  ];

  for (const key of required) {
    if (!env[key] || !String(env[key]).trim()) {
      errors.push(`${key} fehlt`);
    } else if (isPlaceholder(env[key])) {
      errors.push(`${key} enthält noch Platzhalter`);
    }
  }

  if (env.NODE_ENV === "production" && (!env.JWT_SECRET || env.JWT_SECRET.length < 32)) {
    errors.push("JWT_SECRET muss in Produktion mindestens 32 Zeichen haben");
  }

  if (env.APP_PUBLIC_URL && !/^https:\/\//i.test(env.APP_PUBLIC_URL)) {
    warnings.push("APP_PUBLIC_URL sollte mit https:// beginnen (Produktion)");
  }

  if (env.MAIL_ENABLED === "true") {
    for (const key of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"]) {
      if (!env[key] || !String(env[key]).trim()) {
        warnings.push(`${key} fehlt — automatischer Kundenbericht per E-Mail ist deaktiviert`);
      }
    }
  }

  if (env.TRUST_PROXY !== "true") {
    warnings.push("TRUST_PROXY sollte true sein, wenn Nginx davor steht");
  }

  return { errors, warnings };
}

function resolveEnvPath(args) {
  if (args._.length > 0) {
    return path.isAbsolute(args._[0]) ? args._[0] : path.join(ROOT, args._[0]);
  }
  if (args.slug) {
    return path.join(ROOT, "customers", args.slug, "instance.env");
  }
  return null;
}

function main() {
  const args = parseArgs(process.argv);
  const envPath = resolveEnvPath(args);

  if (!envPath) {
    console.error("Verwendung: node scripts/validate-instance-env.js <pfad-zur-instance.env>");
    console.error("         oder: node scripts/validate-instance-env.js --slug kunde-a");
    process.exit(1);
  }

  if (!fs.existsSync(envPath)) {
    console.error(`[validate] Datei nicht gefunden: ${envPath}`);
    console.error("Tipp: cp customers/<slug>/instance.env.example customers/<slug>/instance.env");
    process.exit(1);
  }

  const env = parseEnvFile(fs.readFileSync(envPath, "utf8"));
  const { errors, warnings } = check(env);

  console.log(`[validate] ${envPath}`);

  for (const w of warnings) {
    console.log(`  WARNUNG: ${w}`);
  }

  if (errors.length) {
    for (const e of errors) {
      console.error(`  FEHLER: ${e}`);
    }
    process.exit(1);
  }

  console.log("  OK — Pflichtfelder sind gesetzt.");
}

main();
