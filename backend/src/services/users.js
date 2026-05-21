"use strict";

const bcrypt = require("bcryptjs");
const { getPool } = require("../db/pool");
const { migrateUsernameReferences } = require("./usernameMigration");

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

function mapAdminUserRow(row) {
  return {
    ...mapUserRow(row),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeUsername(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (!/^[a-z0-9_]{3,32}$/.test(s)) return "";
  return s;
}

function normalizeRole(raw) {
  const r = String(raw || "").trim().toLowerCase();
  return r === "boss" || r === "employee" ? r : "";
}

function normalizeStringArray(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .slice(0, 50);
}

function normalizeLabel(raw) {
  const s = String(raw || "").trim();
  if (!s || s.length > 80) return "";
  return s;
}

async function findByUsername(username) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT * FROM users WHERE username = $1 AND is_active = TRUE LIMIT 1`,
    [normalizeUsername(username)]
  );
  return rows[0] || null;
}

async function findById(id) {
  const pool = getPool();
  const { rows } = await pool.query(`SELECT * FROM users WHERE id = $1 LIMIT 1`, [String(id || "")]);
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

async function listAdminUsers() {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, username, role, label, manage_employee_usernames, allowed_checklist_template_ids,
            is_active, created_at, updated_at
     FROM users
     ORDER BY is_active DESC, label ASC`
  );
  return rows.map(mapAdminUserRow);
}

async function countActiveFullBosses(excludeId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM users
     WHERE is_active = TRUE AND role = 'boss'
       AND COALESCE(jsonb_array_length(manage_employee_usernames), 0) = 0
       AND ($1::uuid IS NULL OR id <> $1)`,
    [excludeId || null]
  );
  return rows[0] ? rows[0].c : 0;
}

async function createUser(payload) {
  const username = normalizeUsername(payload.username);
  const role = normalizeRole(payload.role);
  const label = normalizeLabel(payload.label);
  const password = String(payload.password || "");
  if (!username || !role || !label) {
    throw Object.assign(new Error("invalid_input"), { code: "invalid_input" });
  }
  if (password.length < 3 || password.length > 128) {
    throw Object.assign(new Error("invalid_password"), { code: "invalid_password" });
  }
  const manage = role === "boss" ? normalizeStringArray(payload.manageEmployeeUsernames) : [];
  const templates = role === "boss" ? normalizeStringArray(payload.allowedChecklistTemplateIds) : [];
  const rounds = Number.parseInt(String(process.env.BCRYPT_ROUNDS || "12"), 10) || 12;
  const hash = await bcrypt.hash(password, rounds);
  const pool = getPool();
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (username, password_hash, role, label, manage_employee_usernames, allowed_checklist_template_ids)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
       RETURNING id, username, role, label, manage_employee_usernames, allowed_checklist_template_ids,
                 is_active, created_at, updated_at`,
      [username, hash, role, label, JSON.stringify(manage), JSON.stringify(templates)]
    );
    return mapAdminUserRow(rows[0]);
  } catch (err) {
    if (err && err.code === "23505") {
      throw Object.assign(new Error("username_taken"), { code: "username_taken" });
    }
    throw err;
  }
}

async function updateUser(id, payload) {
  const row = await findById(id);
  if (!row) throw Object.assign(new Error("not_found"), { code: "not_found" });
  const role = normalizeRole(payload.role) || row.role;
  const label = normalizeLabel(payload.label) || row.label;
  const manage = role === "boss"
    ? normalizeStringArray(
      payload.manageEmployeeUsernames !== undefined
        ? payload.manageEmployeeUsernames
        : row.manage_employee_usernames
    )
    : [];
  const templates = role === "boss"
    ? normalizeStringArray(
      payload.allowedChecklistTemplateIds !== undefined
        ? payload.allowedChecklistTemplateIds
        : row.allowed_checklist_template_ids
    )
    : [];
  let username = row.username;
  if (payload.username !== undefined && payload.username !== null) {
    const nextUsername = normalizeUsername(payload.username);
    if (!nextUsername) throw Object.assign(new Error("invalid_input"), { code: "invalid_input" });
    if (nextUsername !== row.username) {
      const pool = getPool();
      const { rows: taken } = await pool.query(
        `SELECT 1 FROM users WHERE username = $1 AND id <> $2 LIMIT 1`,
        [nextUsername, id]
      );
      if (taken.length) throw Object.assign(new Error("username_taken"), { code: "username_taken" });
      await migrateUsernameReferences(row.username, nextUsername);
      username = nextUsername;
    }
  }
  const sets = [
    "username = $2",
    "role = $3",
    "label = $4",
    "manage_employee_usernames = $5::jsonb",
    "allowed_checklist_template_ids = $6::jsonb",
    "updated_at = now()"
  ];
  const params = [id, username, role, label, JSON.stringify(manage), JSON.stringify(templates)];
  let idx = 7;
  if (payload.isActive === true && !row.is_active) {
    sets.push("is_active = TRUE");
  }
  const password = String(payload.password || "");
  if (password) {
    if (password.length < 3 || password.length > 128) {
      throw Object.assign(new Error("invalid_password"), { code: "invalid_password" });
    }
    const rounds = Number.parseInt(String(process.env.BCRYPT_ROUNDS || "12"), 10) || 12;
    const hash = await bcrypt.hash(password, rounds);
    sets.push(`password_hash = $${idx}`);
    params.push(hash);
    idx += 1;
  }
  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE users SET ${sets.join(", ")} WHERE id = $1
     RETURNING id, username, role, label, manage_employee_usernames, allowed_checklist_template_ids,
               is_active, created_at, updated_at`,
    params
  );
  return mapAdminUserRow(rows[0]);
}

async function deactivateUser(id, actorId) {
  const row = await findById(id);
  if (!row) throw Object.assign(new Error("not_found"), { code: "not_found" });
  if (!row.is_active) return mapAdminUserRow(row);
  if (String(row.id) === String(actorId)) {
    throw Object.assign(new Error("cannot_delete_self"), { code: "cannot_delete_self" });
  }
  const isRestricted = Array.isArray(row.manage_employee_usernames) && row.manage_employee_usernames.length > 0;
  const isFullBoss = row.role === "boss" && !isRestricted;
  if (isFullBoss) {
    const others = await countActiveFullBosses(row.id);
    if (others < 1) {
      throw Object.assign(new Error("last_full_boss"), { code: "last_full_boss" });
    }
  }
  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE users SET is_active = FALSE, updated_at = now() WHERE id = $1
     RETURNING id, username, role, label, manage_employee_usernames, allowed_checklist_template_ids,
               is_active, created_at, updated_at`,
    [id]
  );
  return mapAdminUserRow(rows[0]);
}

module.exports = {
  findByUsername,
  verifyLogin,
  listPublicUsers,
  listAdminUsers,
  createUser,
  updateUser,
  deactivateUser,
  mapUserRow,
  normalizeUsername,
  normalizeRole
};
