require("dotenv").config({ quiet: true });

const app = require("./app");
const { pool } = require("./db/pool");

const PORT = process.env.PORT || 5700;

const start = async () => {
  try {
    await pool.query("SELECT 1");
    console.log("Connected to PostgreSQL");
  } catch (err) {
    console.error("Could not connect to PostgreSQL:", err.message);
    console.error("Check DATABASE_URL in your .env and that the database is running.");
  }

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
};

start();
