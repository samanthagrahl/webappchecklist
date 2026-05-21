"use strict";

const path = require("path");
const { v4: uuidv4 } = require("uuid");
const { getPool } = require("../db/pool");
const s3 = require("../storage/s3");

function safeFileName(name) {
  const base = path.basename(String(name || "file")).replace(/[^\w.\-()+@ ]/g, "_");
  return base.slice(0, 180) || "file";
}

async function storeUpload({ buffer, mimeType, originalName, userId }) {
  const id = uuidv4();
  const storageKey = `uploads/${new Date().toISOString().slice(0, 10)}/${id}-${safeFileName(originalName)}`;
  await s3.putObject(storageKey, buffer, mimeType);
  const pool = getPool();
  await pool.query(
    `INSERT INTO stored_files (id, storage_key, bucket, original_name, mime_type, byte_size, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      storageKey,
      process.env.S3_BUCKET || "",
      safeFileName(originalName),
      mimeType || "application/octet-stream",
      buffer.length,
      userId || null
    ]
  );
  return { id, storageKey, mimeType: mimeType || "application/octet-stream", name: safeFileName(originalName) };
}

async function getFileMeta(fileId) {
  const pool = getPool();
  const { rows } = await pool.query(`SELECT * FROM stored_files WHERE id = $1`, [fileId]);
  return rows[0] || null;
}

async function getFileDownloadUrl(fileId) {
  const row = await getFileMeta(fileId);
  if (!row) return null;
  const url = await s3.getSignedDownloadUrl(row.storage_key);
  return { url, meta: row };
}

module.exports = { storeUpload, getFileMeta, getFileDownloadUrl, safeFileName };
