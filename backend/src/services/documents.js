"use strict";

const { getPool } = require("../db/pool");

const ALLOWED_DOC_KEYS = new Set([
  "immobiliencheck-submissions-v1",
  "immobiliencheck-daily-attendance-v1",
  "immobiliencheck-staff-schedule-v1",
  "immobiliencheck-recurring-schedule-rules-v1",
  "immobiliencheck-work-orders-v1",
  "immobiliencheck-customer-db-v1",
  "immobiliencheck-guide-db-v1",
  "immobiliencheck-checklist-templates-v2",
  "immobiliencheck-checkpoint-catalog-v1"
]);

/** Alte localStorage-/DB-Schlüssel (Migration vor Umbenennung). */
const LEGACY_DOC_KEY_BY_NEW = {
  "immobiliencheck-submissions-v1": "werkstattcheck-submissions-v1",
  "immobiliencheck-daily-attendance-v1": "werkstattcheck-daily-attendance-v1",
  "immobiliencheck-staff-schedule-v1": "werkstattcheck-staff-schedule-v1",
  "immobiliencheck-recurring-schedule-rules-v1": "werkstattcheck-recurring-schedule-rules-v1",
  "immobiliencheck-work-orders-v1": "werkstattcheck-work-orders-v1",
  "immobiliencheck-customer-db-v1": "werkstattcheck-customer-db-v1",
  "immobiliencheck-guide-db-v1": "werkstattcheck-guide-db-v1",
  "immobiliencheck-checklist-templates-v2": "werkstattcheck-checklist-templates-v2",
  "immobiliencheck-checkpoint-catalog-v1": "werkstattcheck-checkpoint-catalog-v1"
};

function assertAllowedKey(docKey) {
  if (!ALLOWED_DOC_KEYS.has(docKey)) {
    const err = new Error("invalid_document_key");
    err.status = 400;
    throw err;
  }
}

async function fetchDocumentRow(docKey) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT doc_key, payload, version, updated_at FROM app_documents WHERE doc_key = $1`,
    [docKey]
  );
  if (!rows.length) return null;
  const row = rows[0];
  return {
    payload: row.payload,
    version: Number(row.version),
    updatedAt: row.updated_at
  };
}

async function getDocument(docKey) {
  assertAllowedKey(docKey);
  let doc = await fetchDocumentRow(docKey);
  if (!doc && LEGACY_DOC_KEY_BY_NEW[docKey]) {
    doc = await fetchDocumentRow(LEGACY_DOC_KEY_BY_NEW[docKey]);
  }
  return doc;
}

async function getBootstrap() {
  const documents = {};
  for (const key of ALLOWED_DOC_KEYS) {
    const doc = await getDocument(key);
    if (doc) documents[key] = doc;
  }
  return documents;
}

async function putDocument(docKey, payload, expectedVersion, userId) {
  assertAllowedKey(docKey);
  const pool = getPool();
  if (expectedVersion == null) {
    const { rows } = await pool.query(
      `INSERT INTO app_documents (doc_key, payload, version, updated_by)
       VALUES ($1, $2::jsonb, 1, $3)
       ON CONFLICT (doc_key) DO NOTHING
       RETURNING version`,
      [docKey, JSON.stringify(payload), userId || null]
    );
    if (rows.length) return { version: Number(rows[0].version) };
    const existing = await getDocument(docKey);
    const err = new Error("version_conflict");
    err.status = 409;
    err.currentVersion = existing ? existing.version : null;
    throw err;
  }

  const { rows } = await pool.query(
    `UPDATE app_documents
     SET payload = $2::jsonb,
         version = version + 1,
         updated_at = now(),
         updated_by = $4
     WHERE doc_key = $1 AND version = $3
     RETURNING version`,
    [docKey, JSON.stringify(payload), expectedVersion, userId || null]
  );
  if (!rows.length) {
    const existing = await getDocument(docKey);
    const err = new Error("version_conflict");
    err.status = 409;
    err.currentVersion = existing ? existing.version : null;
    throw err;
  }
  return { version: Number(rows[0].version) };
}

module.exports = {
  ALLOWED_DOC_KEYS,
  getBootstrap,
  getDocument,
  putDocument
};
