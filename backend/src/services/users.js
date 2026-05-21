"use strict";

const bcrypt = require("bcryptjs");
const { getPool } = require("../db/pool");

function mapUserRow(row) {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    label: row.label,
    manageEmployeeUsernames: row.manage_employee_usernames || [],
    allowedChecklistTemplateIds: row.allowed_checklist_template_ids || []
  };
}

async function findByUsername(username) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT * FROM users WHERE username = $1 AND is_active = TRUE LIMIT 1`,
    [String(username || "").trim().toLowerCase()]
  );
  return rows[0] || null;
}

async function verifyLogin(username, password) {
  const row = await findByUsername(username);
  if (!row) return null;
  const ok = await bcrypt.compare(String(password || ""), row.password_hash);
  if (!ok) return null;
  return mapUserRow(row);
}

async function listPublicUsers() {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, username, role, label, manage_employee_usernames, allowed_checklist_template_ids
     FROM users WHERE is_active = TRUE ORDER BY label`
  );
  return rows.map(mapUserRow);
}

module.exports = { findByUsername, verifyLogin, listPublicUsers, mapUserRow };
