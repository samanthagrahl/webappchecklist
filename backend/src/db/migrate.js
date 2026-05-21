"use strict";

const fs = require("fs");
const path = require("path");
const { getPool } = require("./pool");

async function migrate() {
  const pool = getPool();
  const schemaPath = path.join(__dirname, "..", "..", "db", "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");
  await pool.query(sql);
  await pool.query(
    `INSERT INTO schema_migrations (id) VALUES ('001_initial')
     ON CONFLICT (id) DO NOTHING`
  );
  console.log("[db] Migration abgeschlossen.");
  await pool.end();
}

migrate().catch((err) => {
  console.error("[db] Migration fehlgeschlagen:", err);
  process.exit(1);
});
