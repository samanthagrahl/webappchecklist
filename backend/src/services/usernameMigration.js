"use strict";

const { getPool } = require("../db/pool");
const { ALLOWED_DOC_KEYS } = require("./documents");

const USERNAME_FIELD_KEYS = new Set(["employeeUsername", "checklistOwnerUsername"]);
const USERNAME_LIST_KEYS = new Set(["manageEmployeeUsernames", "assignedEmployeeUsernames"]);

function rewriteUsernameDeep(value, oldUsername, newUsername) {
  if (value == null) return value;
  if (Array.isArray(value)) {
    return value.map((item) => rewriteUsernameDeep(item, oldUsername, newUsername));
  }
  if (typeof value !== "object") return value;
  const out = {};
  for (const key of Object.keys(value)) {
    const raw = value[key];
    if (USERNAME_FIELD_KEYS.has(key) && raw === oldUsername) {
      out[key] = newUsername;
    } else if (USERNAME_LIST_KEYS.has(key) && Array.isArray(raw)) {
      out[key] = raw.map((item) => (item === oldUsername ? newUsername : item));
    } else {
      out[key] = rewriteUsernameDeep(raw, oldUsername, newUsername);
    }
  }
  return out;
}

async function migrateManageArraysOnUsers(client, oldUsername, newUsername) {
  const { rows } = await client.query(
    `SELECT id, manage_employee_usernames FROM users
     WHERE manage_employee_usernames @> $1::jsonb`,
    [JSON.stringify([oldUsername])]
  );
  for (const row of rows) {
    const list = Array.isArray(row.manage_employee_usernames) ? row.manage_employee_usernames : [];
    const next = list.map((u) => (u === oldUsername ? newUsername : u));
    await client.query(
      `UPDATE users SET manage_employee_usernames = $2::jsonb, updated_at = now() WHERE id = $1`,
      [row.id, JSON.stringify(next)]
    );
  }
}

async function migrateUsernameInAllDocuments(client, oldUsername, newUsername) {
  for (const docKey of ALLOWED_DOC_KEYS) {
    const { rows } = await client.query(
      `SELECT payload FROM app_documents WHERE doc_key = $1 LIMIT 1`,
      [docKey]
    );
    if (!rows.length) continue;
    const payload = rows[0].payload;
    const nextPayload = rewriteUsernameDeep(payload, oldUsername, newUsername);
    await client.query(
      `UPDATE app_documents
       SET payload = $2::jsonb, version = version + 1, updated_at = now()
       WHERE doc_key = $1`,
      [docKey, JSON.stringify(nextPayload)]
    );
  }
  const legacyKeys = {
    "immobiliencheck-submissions-v1": "werkstattcheck-submissions-v1",
    "immobiliencheck-daily-attendance-v1": "werkstattcheck-daily-attendance-v1",
    "immobiliencheck-staff-schedule-v1": "werkstattcheck-staff-schedule-v1",
    "immobiliencheck-recurring-schedule-rules-v1": "werkstattcheck-recurring-schedule-rules-v1",
    "immobiliencheck-work-orders-v1": "werkstattcheck-work-orders-v1"
  };
  for (const legacyKey of Object.values(legacyKeys)) {
    const { rows } = await client.query(
      `SELECT payload FROM app_documents WHERE doc_key = $1 LIMIT 1`,
      [legacyKey]
    );
    if (!rows.length) continue;
    const nextPayload = rewriteUsernameDeep(rows[0].payload, oldUsername, newUsername);
    await client.query(
      `UPDATE app_documents
       SET payload = $2::jsonb, version = version + 1, updated_at = now()
       WHERE doc_key = $1`,
      [legacyKey, JSON.stringify(nextPayload)]
    );
  }
}

async function migrateUsernameReferences(oldUsername, newUsername) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await migrateUsernameInAllDocuments(client, oldUsername, newUsername);
    await migrateManageArraysOnUsers(client, oldUsername, newUsername);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { migrateUsernameReferences, rewriteUsernameDeep };
