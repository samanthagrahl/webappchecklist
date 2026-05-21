#!/usr/bin/env node
"use strict";

/**
 * Importiert data/localstorage-export.json in PostgreSQL (app_documents).
 * Voraussetzung: .env mit DATABASE_URL, im Projektroot ausführen.
 *
 *   node scripts/import-localstorage-export.js
 */

const fs = require("fs");
const path = require("path");
const { Pool } = require(path.join(__dirname, "..", "backend", "node_modules", "pg"));

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const exportPath = path.join(__dirname, "..", "data", "localstorage-export.json");

const LEGACY_TO_NEW = {
  "werkstattcheck-submissions-v1": "immobiliencheck-submissions-v1",
  "werkstattcheck-daily-attendance-v1": "immobiliencheck-daily-attendance-v1",
  "werkstattcheck-staff-schedule-v1": "immobiliencheck-staff-schedule-v1",
  "werkstattcheck-recurring-schedule-rules-v1": "immobiliencheck-recurring-schedule-rules-v1",
  "werkstattcheck-work-orders-v1": "immobiliencheck-work-orders-v1",
  "werkstattcheck-customer-db-v1": "immobiliencheck-customer-db-v1",
  "werkstattcheck-guide-db-v1": "immobiliencheck-guide-db-v1",
  "werkstattcheck-checklist-templates-v2": "immobiliencheck-checklist-templates-v2",
  "werkstattcheck-checkpoint-catalog-v1": "immobiliencheck-checkpoint-catalog-v1"
};

function normalizeExportKeys(dump) {
  const out = {};
  for (const [key, value] of Object.entries(dump)) {
    const docKey = LEGACY_TO_NEW[key] || key;
    if (!out[docKey]) out[docKey] = value;
  }
  return out;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL fehlt in .env");
    process.exit(1);
  }
  if (!fs.existsSync(exportPath)) {
    console.error("Datei fehlt:", exportPath);
    console.error("Siehe DEPLOY-HETZNER.md → Daten exportieren.");
    process.exit(1);
  }
  const dump = normalizeExportKeys(JSON.parse(fs.readFileSync(exportPath, "utf8")));
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const keys = Object.keys(dump);
  for (const key of keys) {
    await pool.query(
      `INSERT INTO app_documents (doc_key, payload, version)
       VALUES ($1, $2::jsonb, 1)
       ON CONFLICT (doc_key) DO UPDATE SET payload = EXCLUDED.payload, version = app_documents.version + 1`,
      [key, JSON.stringify(dump[key])]
    );
    console.log("[import]", key);
  }
  await pool.end();
  console.log("[import] Fertig:", keys.length, "Dokumente.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
