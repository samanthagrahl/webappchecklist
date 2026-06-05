"use strict";

/**
 * Neuen Kunden (eigene Instanz) aus der Vorlage anlegen.
 *
 * Beispiel:
 *   node scripts/create-customer.js --slug kunde-b --name "Kunde B" --fqdn kunde-b.deine-domain.de
 *   node scripts/create-customer.js --slug kunde-b --name "Kunde B" --port 3848
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const TEMPLATE_DIR = path.join(ROOT, "customers", "_template");
const REGISTRY_PATH = path.join(ROOT, "customers", "registry.json");
const PLATFORM_CONFIG_PATH = path.join(ROOT, "infrastructure", "platform.config.json");

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = true;
      continue;
    }
    out[key] = next;
    i += 1;
  }
  return out;
}

function slugToUnderscore(slug) {
  return String(slug).trim().toLowerCase().replace(/-/g, "_");
}

function normalizeSlug(raw) {
  const slug = String(raw || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(slug)) {
    throw new Error("Slug ungültig (a-z, 0-9, Bindestrich, 3–32 Zeichen).");
  }
  return slug;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function loadPlatformConfig() {
  if (!fs.existsSync(PLATFORM_CONFIG_PATH)) return null;
  try {
    return readJson(PLATFORM_CONFIG_PATH);
  } catch (err) {
    console.warn("[create-customer] platform.config.json konnte nicht gelesen werden:", err.message);
    return null;
  }
}

function nextFreePort(registry) {
  const used = new Set(registry.customers.map((c) => c.appPort));
  let port = registry.customers.length
    ? Math.max(...registry.customers.map((c) => c.appPort)) + 1
    : 3847;
  while (used.has(port)) port += 1;
  return port;
}

function replacePlaceholders(content, vars) {
  let out = content;
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(`{{${key}}}`).join(String(value));
  }
  return out;
}

function copyTemplateFile(srcName, destDir, vars) {
  const src = path.join(TEMPLATE_DIR, srcName);
  if (!fs.existsSync(src)) return;
  const content = replacePlaceholders(fs.readFileSync(src, "utf8"), vars);
  fs.writeFileSync(path.join(destDir, srcName), content, "utf8");
}

function main() {
  const args = parseArgs(process.argv);
  const slug = normalizeSlug(args.slug);
  const displayName = String(args.name || args["display-name"] || slug).trim();
  const platform = loadPlatformConfig();
  const baseDomain = String(args.domain || platform?.dns?.baseDomain || "deine-domain.de").trim();
  const fqdn = String(args.fqdn || `${slug}.${baseDomain}`).trim().toLowerCase();

  const customerDir = path.join(ROOT, "customers", slug);
  if (fs.existsSync(customerDir)) {
    console.error(`[create-customer] Ordner existiert bereits: customers/${slug}`);
    process.exit(1);
  }

  const registry = readJson(REGISTRY_PATH);
  if (registry.customers.some((c) => c.slug === slug)) {
    console.error(`[create-customer] Slug bereits in registry.json: ${slug}`);
    process.exit(1);
  }

  const appPort = Number.parseInt(String(args.port || nextFreePort(registry)), 10);
  if (!Number.isFinite(appPort) || appPort < 1024 || appPort > 65535) {
    console.error("[create-customer] Ungültiger Port.");
    process.exit(1);
  }

  const s3 = platform?.objectStorage || {};
  const smtp = platform?.smtp || {};
  const vars = {
    SLUG: slug,
    SLUG_UNDERSCORE: slugToUnderscore(slug),
    DISPLAY_NAME: displayName,
    FQDN: fqdn,
    APP_PORT: appPort,
    CREATED_AT: new Date().toISOString().slice(0, 10),
    BASE_DOMAIN: baseDomain,
    S3_ENDPOINT: s3.endpoint || "https://fsn1.your-objectstorage.com",
    S3_REGION: s3.region || "fsn1",
    S3_ACCESS_KEY_ID: s3.accessKeyId || "",
    S3_SECRET_ACCESS_KEY: s3.secretAccessKey || "",
    SMTP_HOST: smtp.host || "smtp.deine-domain.de",
    SMTP_PORT: smtp.port ?? 587,
    SMTP_SECURE: smtp.secure === true ? "true" : "false",
    SMTP_REQUIRE_TLS: smtp.requireTls !== false ? "true" : "false",
    SMTP_USER: smtp.user || "",
    SMTP_PASS: smtp.pass || ""
  };

  fs.mkdirSync(customerDir, { recursive: true });

  copyTemplateFile("metadata.json", customerDir, vars);
  copyTemplateFile("instance.env.example", customerDir, vars);
  copyTemplateFile("nginx-site.conf.example", customerDir, vars);
  copyTemplateFile("systemd.service.example", customerDir, vars);

  registry.customers.push({
    slug,
    displayName,
    status: "pending",
    fqdn,
    appPort,
    databaseName: `immobiliencheck_${slugToUnderscore(slug)}`,
    s3Bucket: `immobiliencheck-${slug}`,
    systemdService: `immobiliencheck-${slug}`,
    createdAt: vars.CREATED_AT
  });
  writeJson(REGISTRY_PATH, registry);

  console.log(`[create-customer] Kunde angelegt: ${displayName} (${slug})`);
  console.log(`  Ordner:     customers/${slug}/`);
  console.log(`  Domain:     https://${fqdn}`);
  console.log(`  Port:       ${appPort}`);
  console.log(`  Datenbank:  immobiliencheck_${slugToUnderscore(slug)}`);
  console.log(`  S3-Bucket:  immobiliencheck-${slug}`);
  console.log("");
  console.log("Nächste Schritte:");
  console.log(`  1. customers/${slug}/instance.env.example → instance.env ausfüllen`);
  console.log(`  2. ONBOARDING-KUNDE.md — Abschnitt „Neue Instanz deployen“`);
}

try {
  main();
} catch (err) {
  console.error("[create-customer] Fehler:", err.message || err);
  process.exit(1);
}
