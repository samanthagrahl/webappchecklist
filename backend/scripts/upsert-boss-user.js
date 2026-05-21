"use strict";

/**
 * Einmalig auf dem Server (Passwort nicht committen):
 *   cd /opt/immobiliencheck/backend
 *   ADMIN_USERNAME=patrick_admin ADMIN_PASSWORD='Patrick123!' npm run upsert-boss-user
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const bcrypt = require("bcryptjs");
const { getPool } = require("../src/db/pool");

function normalizeUsername(raw) {
  const s = String(raw || "").trim().toLowerCase();
  return /^[a-z0-9_]{3,32}$/.test(s) ? s : "";
}

async function main() {
  const username = normalizeUsername(process.env.ADMIN_USERNAME || "patrick_admin");
  const password = String(process.env.ADMIN_PASSWORD || "").trim();
  const label = String(process.env.ADMIN_LABEL || "Patrick (Admin)").trim().slice(0, 80) || "Admin";

  if (!username) {
    console.error("[upsert-boss-user] ADMIN_USERNAME ungültig (a–z, 0–9, _, 3–32 Zeichen).");
    process.exit(1);
  }
  if (password.length < 3 || password.length > 128) {
    console.error("[upsert-boss-user] ADMIN_PASSWORD fehlt oder ist ungültig.");
    process.exit(1);
  }

  const rounds = Number.parseInt(String(process.env.BCRYPT_ROUNDS || "12"), 10) || 12;
  const hash = await bcrypt.hash(password, rounds);
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO users (username, password_hash, role, label, manage_employee_usernames, allowed_checklist_template_ids, is_active)
       VALUES ($1, $2, 'boss', $3, '[]'::jsonb, '[]'::jsonb, TRUE)
       ON CONFLICT (username) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         role = 'boss',
         label = EXCLUDED.label,
         manage_employee_usernames = '[]'::jsonb,
         allowed_checklist_template_ids = '[]'::jsonb,
         is_active = TRUE,
         updated_at = now()`,
      [username, hash, label]
    );
    console.log(`[upsert-boss-user] Voller Chef-Zugang: ${username} (${label})`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[upsert-boss-user] Fehler:", err);
  process.exit(1);
});
