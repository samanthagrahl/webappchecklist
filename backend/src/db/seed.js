"use strict";

const bcrypt = require("bcryptjs");
const { getPool } = require("./pool");

const DEFAULT_USERS = [
  { username: "chef", password: "123", role: "boss", label: "Chef", manage: [], templates: [] },
  {
    username: "patrick_admin",
    password: "CHANGE_ME",
    role: "boss",
    label: "Patrick (Admin)",
    manage: [],
    templates: []
  },
  { username: "patrick", password: "123", role: "employee", label: "Patrick", manage: [], templates: [] },
  { username: "souhail", password: "123", role: "employee", label: "Souhail", manage: [], templates: [] },
  { username: "mohammed", password: "123", role: "employee", label: "Mohammed", manage: [], templates: [] },
  { username: "reinigungspaar", password: "123", role: "employee", label: "Reinigungspaar", manage: [], templates: [] },
  {
    username: "kristina",
    password: "123",
    role: "boss",
    label: "Kristina",
    manage: ["reinigungspaar"],
    templates: ["putzplan_haus"]
  }
];

async function upsertUser(client, user, rounds) {
  const hash = await bcrypt.hash(user.password, rounds);
  await client.query(
    `INSERT INTO users (username, password_hash, role, label, manage_employee_usernames, allowed_checklist_template_ids)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
     ON CONFLICT (username) DO UPDATE SET
       password_hash = EXCLUDED.password_hash,
       role = EXCLUDED.role,
       label = EXCLUDED.label,
       manage_employee_usernames = EXCLUDED.manage_employee_usernames,
       allowed_checklist_template_ids = EXCLUDED.allowed_checklist_template_ids,
       is_active = TRUE,
       updated_at = now()`,
    [
      user.username,
      hash,
      user.role,
      user.label,
      JSON.stringify(user.manage || []),
      JSON.stringify(user.templates || [])
    ]
  );
}

async function seed() {
  const pool = getPool();
  const rounds = Number.parseInt(String(process.env.BCRYPT_ROUNDS || "12"), 10) || 12;
  const client = await pool.connect();
  try {
    for (const user of DEFAULT_USERS) {
      const envPass = process.env[`SEED_PASSWORD_${user.username.toUpperCase()}`];
      await upsertUser(client, { ...user, password: envPass || user.password }, rounds);
    }
    console.log("[seed] Benutzer angelegt/aktualisiert.");
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error("[seed] Fehler:", err);
  process.exit(1);
});
