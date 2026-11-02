require("dotenv").config({ quiet: true });
const { pool } = require("./pool");
const {
  createUser,
  findUserByName,
  getPrimaryAccountByUserId,
  deposit,
  transfer,
  deriveAccNo,
} = require("../models/account");

const demoUsers = [
  { name: "admin", password: "admin123", pin: "1234", role: "admin", balance: 5000, phone: "08000000000" },
  { name: "devv", password: "password123", pin: "1234", role: "user", balance: 1000, phone: "08000000001" },
  { name: "john", password: "password123", pin: "1234", role: "user", balance: 1000, phone: "08000000002" },
  { name: "jane", password: "password123", pin: "1234", role: "user", balance: 1000, phone: "08000000003" },
  { name: "sam", password: "password123", pin: "1234", role: "user", balance: 1000, phone: "08000000004" },
];

const seed = async () => {
  let created = 0;

  for (const demo of demoUsers) {
    const existing = await findUserByName(demo.name, demo.role);
    if (existing) continue;

    await createUser(demo);
    created += 1;
    console.log(`  + ${demo.name} (${demo.role})  account: ${deriveAccNo(demo.phone)}`);
  }

  const { rows } = await pool.query("SELECT COUNT(*)::int AS count FROM transactions");
  if (rows[0].count === 0) {
    const john = await findUserByName("john", "user");
    const jane = await findUserByName("jane", "user");
    if (john && jane) {
      const johnAcc = await getPrimaryAccountByUserId(john.id);
      const janeAcc = await getPrimaryAccountByUserId(jane.id);
      await deposit(johnAcc.accNo, 2500, "Initial salary");
      await transfer({ fromAccNo: johnAcc.accNo, toAccNo: janeAcc.accNo, amount: 500, description: "Rent split" });
      console.log("  + seeded sample transactions");
    }
  }

  console.log(`\nSeed complete. ${created} user(s) created.`);
};

seed()
  .catch((err) => {
    console.error("Seed failed:", err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
