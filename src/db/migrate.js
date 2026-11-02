require("dotenv").config({ quiet: true });
const fs = require("fs");
const path = require("path");
const { pool } = require("./pool");

const migrate = async () => {
  const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  await pool.query(sql);
  console.log("Database schema applied successfully.");
};

migrate()
  .catch((err) => {
    console.error("Migration failed:", err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
