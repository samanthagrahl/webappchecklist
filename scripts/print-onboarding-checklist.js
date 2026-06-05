"use strict";

/**
 * Gibt eine deploy-fertige Checkliste für einen Kunden aus.
 * Beispiel: node scripts/print-onboarding-checklist.js kunde-a
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function main() {
  const slug = String(process.argv[2] || "").trim();
  if (!slug) {
    console.error("Verwendung: node scripts/print-onboarding-checklist.js <slug>");
    process.exit(1);
  }

  const metaPath = path.join(ROOT, "customers", slug, "metadata.json");
  if (!fs.existsSync(metaPath)) {
    console.error(`[checklist] Nicht gefunden: customers/${slug}/metadata.json`);
    process.exit(1);
  }

  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  const infra = meta.infrastructure || {};
  const domain = meta.domain || {};

  console.log("");
  console.log(`=== Onboarding-Checkliste: ${meta.displayName} (${slug}) ===`);
  console.log("");
  console.log("Vorbereitung (Hetzner-Konsole / DNS):");
  console.log(`  [ ] A-Record: ${domain.fqdn} → Server-IP`);
  console.log(`  [ ] PostgreSQL-Datenbank anlegen: ${infra.databaseName}`);
  console.log(`  [ ] Object-Storage-Bucket anlegen: ${infra.s3Bucket}`);
  console.log("");
  console.log("Server:");
  console.log(`  [ ] customers/${slug}/instance.env ausfüllen (JWT, DB, S3, SMTP)`);
  console.log(`  [ ] node scripts/validate-instance-env.js --slug ${slug}`);
  console.log(`  [ ] cd backend && npm run migrate (mit EnvironmentFile=${slug})`);
  console.log(`  [ ] ADMIN_USERNAME=chef ADMIN_PASSWORD='...' npm run upsert-boss-user`);
  console.log(`  [ ] systemd: immobiliencheck-${slug}.service aktivieren`);
  console.log(`  [ ] nginx + certbot für ${domain.fqdn}`);
  console.log(`  [ ] curl https://${domain.fqdn}/api/v1/health → ok`);
  console.log("");
  console.log("Kunden-Onboarding:");
  console.log(`  [ ] Login testen (${meta.onboarding?.adminUsername || "chef"})`);
  console.log("  [ ] Mitarbeiter anlegen (Menü Mitarbeiter)");
  console.log("  [ ] Kundendatenbank importieren oder manuell befüllen");
  console.log("  [ ] Checklisten-Vorlagen prüfen");
  console.log("  [ ] Test-Checkliste + E-Mail-Versand testen");
  console.log(`  [ ] registry.json: status von "${meta.status}" auf "active" setzen`);
  console.log("");
}

main();
