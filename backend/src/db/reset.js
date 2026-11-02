require("dotenv").config({ quiet: true });
const fs = require("fs");
const path = require("path");
const { pool } = require("./pool");

const reset = async () => {
  await pool.query("DROP TABLE IF EXISTS beneficiaries, transactions, accounts, users CASCADE");
  const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  await pool.query(sql);
  console.log("Database reset and schema re-applied.");
};

reset()
  .catch((err) => {
    console.error("Reset failed:", err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
