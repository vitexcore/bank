require("dotenv").config({ quiet: true });
const assert = require("node:assert/strict");
const { pool } = require("../src/db/pool");
const bank = require("../src/models/account");

const run = async () => {
  const suffix = Date.now().toString(36);
  const nameA = "testa" + suffix;
  const nameB = "testb" + suffix;
  const tail = 1000000000 + (Date.now() % 8000000000);
  const phoneA = "0" + tail;
  const phoneB = "0" + (tail + 1);

  const { account: accA } = await bank.createUser({
    name: nameA,
    phone: phoneA,
    password: "password123",
    pin: "1234",
    balance: 1000,
  });
  const { account: accB } = await bank.createUser({
    name: nameB,
    phone: phoneB,
    password: "password123",
    pin: "1234",
    balance: 1000,
  });

  const dep = await bank.deposit(accA.accNo, 250, "test deposit");
  assert.equal(dep.balance, 1250, "deposit should add to balance");

  const wd = await bank.withdraw(accA.accNo, 100, "test withdrawal");
  assert.equal(wd.balance, 1150, "withdrawal should subtract from balance");

  await assert.rejects(
    () => bank.withdraw(accA.accNo, 999999),
    /Insufficient/,
    "withdrawal should reject insufficient funds"
  );

  const tr = await bank.transfer({ fromAccNo: accA.accNo, toAccNo: accB.accNo, amount: 150 });
  assert.equal(tr.balance, 1000, "sender balance should decrease after transfer");

  const receiver = await bank.findAccountByAccNo(accB.accNo);
  assert.equal(receiver.account.balance, 1150, "receiver should be credited");

  await assert.rejects(
    () => bank.transfer({ fromAccNo: accA.accNo, toAccNo: accA.accNo, amount: 10 }),
    /own account/,
    "transfer to self should fail"
  );

  assert.equal(await bank.verifyPin(receiver.user.id, "1234"), true, "valid PIN should verify");
  assert.equal(await bank.verifyPin(receiver.user.id, "0000"), false, "invalid PIN should not verify");

  const ledger = await bank.listTransactions(receiver.account.id);
  assert.ok(ledger.length >= 1, "receiver should have ledger entries");
  assert.ok(
    ledger.some((tx) => tx.direction === "credit" && tx.type === "transfer"),
    "ledger should contain the incoming transfer"
  );

  await pool.query("DELETE FROM users WHERE name = ANY($1)", [[nameA, nameB]]);
  console.log("bank integration test passed");
};

run()
  .catch((err) => {
    console.error("test failed:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
