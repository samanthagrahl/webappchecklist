"use strict";

const { Pool } = require("pg");
const { config } = require("../config");

let pool;

function getPool() {
  if (!pool) {
    if (!config.databaseUrl) {
      throw new Error("DATABASE_URL fehlt in .env");
    }
    pool = new Pool({
      connectionString: config.databaseUrl,
      max: Number.parseInt(String(process.env.PG_POOL_MAX || "20"), 10) || 20
    });
  }
  return pool;
}

module.exports = { getPool };
