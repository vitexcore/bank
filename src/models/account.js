const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { pool, withTransaction } = require("../db/pool");
const { httpError } = require("../utils/errors");

const toNumber = (value) => (value === null || value === undefined ? null : Number(value));

const normalizePhone = (phone) => String(phone || "").replace(/\D/g, "");

// Account number = the person's 11-digit phone number without its first digit.
const deriveAccNo = (phone) => {
  const digits = normalizePhone(phone);
  return digits.length >= 2 ? digits.slice(1) : null;
};

const generateReference = () =>
  "TXN" + Date.now().toString(36).toUpperCase() + crypto.randomBytes(3).toString("hex").toUpperCase();

const serializeAccount = (row) => ({
  id: row.id,
  accNo: row.acc_no,
  type: row.type,
  balance: toNumber(row.balance),
  currency: row.currency,
  createdAt: row.created_at,
});

const serializeTransaction = (row) => ({
  id: row.id,
  type: row.type,
  direction: row.direction,
  amount: toNumber(row.amount),
  balanceAfter: toNumber(row.balance_after),
  counterpartyName: row.counterparty_name,
  reference: row.reference,
  description: row.description,
  status: row.status,
  createdAt: row.created_at,
});

const serializeUser = (row) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  phone: row.phone,
  role: row.role,
  status: row.status,
  createdAt: row.created_at,
});

const createUser = async ({
  name,
  email = null,
  phone,
  password,
  role = "user",
  pin = null,
  balance = 1000,
  type = "savings",
  currency = "USD",
}) => {
  const accNo = deriveAccNo(phone);
  if (!accNo) throw httpError(400, "A valid 11-digit phone number is required");

  return withTransaction(async (client) => {
    const passwordHash = await bcrypt.hash(password, 10);
    const pinHash = pin ? await bcrypt.hash(String(pin), 10) : null;

    const userResult = await client.query(
      `INSERT INTO users (name, email, phone, password_hash, role, pin_hash)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, email, phone, role, status, created_at`,
      [name, email, phone, passwordHash, role, pinHash]
    );
    const user = userResult.rows[0];

    const accountResult = await client.query(
      `INSERT INTO accounts (user_id, acc_no, type, balance, currency)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, acc_no, type, balance, currency, created_at`,
      [user.id, accNo, type, balance, currency]
    );

    return { user: serializeUser(user), account: serializeAccount(accountResult.rows[0]) };
  });
};

const findUserByName = async (name, role) => {
  const params = [name];
  let sql = "SELECT * FROM users WHERE name = $1";
  if (role) {
    params.push(role);
    sql += " AND role = $2";
  }
  const { rows } = await pool.query(sql, params);
  return rows[0] || null;
};

const findUserById = async (id) => {
  const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
  return rows[0] || null;
};

const findUserByPhone = async (phone) => {
  const { rows } = await pool.query("SELECT * FROM users WHERE phone = $1", [String(phone)]);
  return rows[0] || null;
};

const lookupAccount = async (accNo) => {
  const { rows } = await pool.query(
    `SELECT a.acc_no, u.name, u.status
     FROM accounts a
     JOIN users u ON u.id = a.user_id
     WHERE a.acc_no = $1`,
    [String(accNo)]
  );
  return rows[0] || null;
};

const getPrimaryAccountByUserId = async (userId) => {
  const { rows } = await pool.query(
    "SELECT * FROM accounts WHERE user_id = $1 ORDER BY id ASC LIMIT 1",
    [userId]
  );
  return rows[0] ? serializeAccount(rows[0]) : null;
};

const findAccountByAccNo = async (accNo) => {
  const { rows } = await pool.query(
    `SELECT a.id AS account_id, a.acc_no, a.type, a.balance, a.currency, a.created_at AS account_created_at,
            u.id AS user_id, u.name, u.email, u.phone, u.role, u.status,
            u.pin_hash, u.password_hash, u.created_at AS user_created_at
     FROM accounts a
     JOIN users u ON u.id = a.user_id
     WHERE a.acc_no = $1`,
    [String(accNo)]
  );
  if (!rows[0]) return null;

  const row = rows[0];
  return {
    account: {
      id: row.account_id,
      accNo: row.acc_no,
      type: row.type,
      balance: toNumber(row.balance),
      currency: row.currency,
      createdAt: row.account_created_at,
    },
    user: {
      id: row.user_id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      role: row.role,
      status: row.status,
      createdAt: row.user_created_at,
    },
    pinHash: row.pin_hash,
    passwordHash: row.password_hash,
  };
};

const findAccountByOwnerName = async (name) => {
  const { rows } = await pool.query(
    `SELECT a.id AS account_id, a.acc_no, a.type, a.balance, a.currency,
            u.id AS user_id, u.name, u.role, u.status
     FROM accounts a
     JOIN users u ON u.id = a.user_id
     WHERE u.name = $1
     ORDER BY a.id ASC
     LIMIT 1`,
    [name]
  );
  if (!rows[0]) return null;

  const row = rows[0];
  return {
    account: { id: row.account_id, accNo: row.acc_no, type: row.type, balance: toNumber(row.balance), currency: row.currency },
    user: { id: row.user_id, name: row.name, role: row.role, status: row.status },
  };
};

const lockAccount = async (client, accNo) => {
  const { rows } = await client.query(
    `SELECT a.id, a.acc_no, a.balance, a.user_id, a.currency, u.name, u.status
     FROM accounts a
     JOIN users u ON u.id = a.user_id
     WHERE a.acc_no = $1
     FOR UPDATE OF a`,
    [String(accNo)]
  );
  return rows[0] || null;
};

const insertTransaction = async (client, tx) => {
  await client.query(
    `INSERT INTO transactions
       (account_id, type, direction, amount, balance_after, counterparty_account_id, counterparty_name, reference, description)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      tx.accountId,
      tx.type,
      tx.direction,
      tx.amount,
      tx.balanceAfter,
      tx.counterpartyAccountId || null,
      tx.counterpartyName || null,
      tx.reference,
      tx.description || null,
    ]
  );
};

const deposit = async (accNo, amount, description = "Deposit") =>
  withTransaction(async (client) => {
    const account = await lockAccount(client, accNo);
    if (!account) throw httpError(404, "Account not found");
    if (account.status !== "active") throw httpError(403, "Account is not active");

    const newBalance = Number(account.balance) + amount;
    await client.query("UPDATE accounts SET balance = $1 WHERE id = $2", [newBalance, account.id]);

    const reference = generateReference();
    await insertTransaction(client, {
      accountId: account.id,
      type: "deposit",
      direction: "credit",
      amount,
      balanceAfter: newBalance,
      reference,
      description,
    });

    return { balance: newBalance, reference };
  });

const withdraw = async (accNo, amount, description = "Withdrawal") =>
  withTransaction(async (client) => {
    const account = await lockAccount(client, accNo);
    if (!account) throw httpError(404, "Account not found");
    if (account.status !== "active") throw httpError(403, "Account is not active");
    if (amount > Number(account.balance)) throw httpError(400, "Insufficient balance");

    const newBalance = Number(account.balance) - amount;
    await client.query("UPDATE accounts SET balance = $1 WHERE id = $2", [newBalance, account.id]);

    const reference = generateReference();
    await insertTransaction(client, {
      accountId: account.id,
      type: "withdrawal",
      direction: "debit",
      amount,
      balanceAfter: newBalance,
      reference,
      description,
    });

    return { balance: newBalance, reference };
  });

const transfer = async ({ fromAccNo, toAccNo, amount, description }) =>
  withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT a.id, a.acc_no, a.balance, a.user_id, u.name, u.status
       FROM accounts a
       JOIN users u ON u.id = a.user_id
       WHERE a.acc_no IN ($1, $2)
       ORDER BY a.acc_no
       FOR UPDATE OF a`,
      [String(fromAccNo), String(toAccNo)]
    );

    const sender = rows.find((r) => String(r.acc_no) === String(fromAccNo));
    const receiver = rows.find((r) => String(r.acc_no) === String(toAccNo));

    if (!sender) throw httpError(404, "Your account was not found");
    if (!receiver) throw httpError(404, "Receiver account not found");
    if (sender.id === receiver.id) throw httpError(400, "Cannot transfer to your own account");
    if (sender.status !== "active") throw httpError(403, "Your account is not active");
    if (receiver.status !== "active") throw httpError(403, "Receiver account is not active");

    const senderBalance = Number(sender.balance);
    const receiverBalance = Number(receiver.balance);
    if (amount > senderBalance) throw httpError(400, "Insufficient balance");

    const newSenderBalance = senderBalance - amount;
    const newReceiverBalance = receiverBalance + amount;

    await client.query("UPDATE accounts SET balance = $1 WHERE id = $2", [newSenderBalance, sender.id]);
    await client.query("UPDATE accounts SET balance = $1 WHERE id = $2", [newReceiverBalance, receiver.id]);

    const reference = generateReference();
    await insertTransaction(client, {
      accountId: sender.id,
      type: "transfer",
      direction: "debit",
      amount,
      balanceAfter: newSenderBalance,
      counterpartyAccountId: receiver.id,
      counterpartyName: receiver.name,
      reference,
      description: description || `Transfer to ${receiver.name}`,
    });
    await insertTransaction(client, {
      accountId: receiver.id,
      type: "transfer",
      direction: "credit",
      amount,
      balanceAfter: newReceiverBalance,
      counterpartyAccountId: sender.id,
      counterpartyName: sender.name,
      reference: `${reference}R`,
      description: description || `Transfer from ${sender.name}`,
    });

    return {
      balance: newSenderBalance,
      reference,
      receiver: { name: receiver.name, accNo: receiver.acc_no },
    };
  });

const adminAdjust = async ({ targetAccNo, amount, direction, description }) =>
  withTransaction(async (client) => {
    const account = await lockAccount(client, targetAccNo);
    if (!account) throw httpError(404, "Account not found");

    const current = Number(account.balance);
    if (direction === "debit" && amount > current) throw httpError(400, "Insufficient balance");

    const newBalance = direction === "credit" ? current + amount : current - amount;
    await client.query("UPDATE accounts SET balance = $1 WHERE id = $2", [newBalance, account.id]);

    const reference = generateReference();
    await insertTransaction(client, {
      accountId: account.id,
      type: direction === "credit" ? "admin_credit" : "admin_debit",
      direction,
      amount,
      balanceAfter: newBalance,
      reference,
      description: description || `Admin ${direction}`,
    });

    return { balance: newBalance, reference, name: account.name };
  });

const listTransactions = async (accountId, { limit = 50, type, direction, from, to } = {}) => {
  const params = [accountId];
  let sql = "SELECT * FROM transactions WHERE account_id = $1";

  if (type) {
    params.push(type);
    sql += ` AND type = $${params.length}`;
  }
  if (direction) {
    params.push(direction);
    sql += ` AND direction = $${params.length}`;
  }
  if (from) {
    params.push(from);
    sql += ` AND created_at >= $${params.length}`;
  }
  if (to) {
    params.push(to);
    sql += ` AND created_at <= $${params.length}`;
  }

  params.push(Math.min(Number(limit) || 50, 200));
  sql += ` ORDER BY created_at DESC, id DESC LIMIT $${params.length}`;

  const { rows } = await pool.query(sql, params);
  return rows.map(serializeTransaction);
};

const getTransactionByReference = async (reference) => {
  const { rows } = await pool.query("SELECT * FROM transactions WHERE reference = $1", [reference]);
  return rows[0] ? serializeTransaction(rows[0]) : null;
};

const listBeneficiaries = async (userId) => {
  const { rows } = await pool.query(
    `SELECT b.id, b.nickname, b.created_at, a.acc_no, a.type, u.name
     FROM beneficiaries b
     JOIN accounts a ON a.id = b.account_id
     JOIN users u ON u.id = a.user_id
     WHERE b.user_id = $1
     ORDER BY b.created_at DESC`,
    [userId]
  );
  return rows.map((row) => ({
    id: row.id,
    nickname: row.nickname,
    name: row.name,
    accNo: row.acc_no,
    type: row.type,
    createdAt: row.created_at,
  }));
};

const addBeneficiary = async (userId, accNo, nickname = null) => {
  const target = await findAccountByAccNo(accNo);
  if (!target) throw httpError(404, "Account number not found");
  if (target.user.id === userId) throw httpError(400, "You cannot add your own account");

  const { rows } = await pool.query(
    `INSERT INTO beneficiaries (user_id, account_id, nickname)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, account_id)
     DO UPDATE SET nickname = EXCLUDED.nickname
     RETURNING id, nickname, created_at`,
    [userId, target.account.id, nickname]
  );

  return {
    id: rows[0].id,
    nickname: rows[0].nickname,
    name: target.user.name,
    accNo: target.account.accNo,
    createdAt: rows[0].created_at,
  };
};

const removeBeneficiary = async (userId, beneficiaryId) => {
  const { rowCount } = await pool.query(
    "DELETE FROM beneficiaries WHERE id = $1 AND user_id = $2",
    [beneficiaryId, userId]
  );
  if (rowCount === 0) throw httpError(404, "Beneficiary not found");
  return { id: Number(beneficiaryId) };
};

const updateProfile = async (userId, { email, phone }) =>
  withTransaction(async (client) => {
    const { rows: existingRows } = await client.query("SELECT * FROM users WHERE id = $1 FOR UPDATE", [userId]);
    const existing = existingRows[0];
    if (!existing) throw httpError(404, "User not found");

    if (phone && String(phone) !== existing.phone) {
      await client.query("UPDATE accounts SET acc_no = $1 WHERE user_id = $2", [deriveAccNo(phone), userId]);
    }

    const { rows } = await client.query(
      `UPDATE users
       SET email = COALESCE($2, email), phone = COALESCE($3, phone), updated_at = now()
       WHERE id = $1
       RETURNING id, name, email, phone, role, status, created_at`,
      [userId, email || null, phone || null]
    );
    return serializeUser(rows[0]);
  });

const updatePassword = async (userId, password) => {
  const hash = await bcrypt.hash(password, 10);
  await pool.query("UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2", [hash, userId]);
};

const setPin = async (userId, pin) => {
  const hash = await bcrypt.hash(String(pin), 10);
  await pool.query("UPDATE users SET pin_hash = $1, updated_at = now() WHERE id = $2", [hash, userId]);
};

const verifyPin = async (userId, pin) => {
  const { rows } = await pool.query("SELECT pin_hash FROM users WHERE id = $1", [userId]);
  if (!rows[0] || !rows[0].pin_hash) return false;
  return bcrypt.compare(String(pin), rows[0].pin_hash);
};

const listUsers = async () => {
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.email, u.phone, u.role, u.status, u.created_at,
            a.acc_no, a.balance, a.type, a.currency
     FROM users u
     LEFT JOIN accounts a ON a.user_id = u.id
     ORDER BY u.id ASC`
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    status: row.status,
    accNo: row.acc_no,
    balance: toNumber(row.balance),
    type: row.type,
    currency: row.currency,
    createdAt: row.created_at,
  }));
};

const updateUserStatus = async (userId, status) => {
  const valid = ["active", "frozen", "closed"];
  if (!valid.includes(status)) throw httpError(400, "Invalid status");
  const { rows } = await pool.query(
    "UPDATE users SET status = $1, updated_at = now() WHERE id = $2 RETURNING id, name, status",
    [status, userId]
  );
  if (!rows[0]) throw httpError(404, "User not found");
  return rows[0];
};

const listAllTransactions = async ({ limit = 100 } = {}) => {
  const { rows } = await pool.query(
    `SELECT t.*, a.acc_no, u.name AS owner_name
     FROM transactions t
     JOIN accounts a ON a.id = t.account_id
     JOIN users u ON u.id = a.user_id
     ORDER BY t.created_at DESC, t.id DESC
     LIMIT $1`,
    [Math.min(Number(limit) || 100, 500)]
  );
  return rows.map((row) => ({
    ...serializeTransaction(row),
    accNo: row.acc_no,
    ownerName: row.owner_name,
  }));
};

module.exports = {
  createUser,
  findUserByName,
  findUserById,
  findUserByPhone,
  lookupAccount,
  deriveAccNo,
  getPrimaryAccountByUserId,
  findAccountByAccNo,
  findAccountByOwnerName,
  deposit,
  withdraw,
  transfer,
  adminAdjust,
  listTransactions,
  getTransactionByReference,
  listBeneficiaries,
  addBeneficiary,
  removeBeneficiary,
  updateProfile,
  updatePassword,
  setPin,
  verifyPin,
  listUsers,
  updateUserStatus,
  listAllTransactions,
  normalizePhone,
};
