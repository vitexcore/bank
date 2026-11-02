const bank = require("../models/account");

const error = (res, status, message) => res.status(status).json({ status: "error", message });
const isPositiveNumber = (value) => typeof value === "number" && Number.isFinite(value) && value > 0;

const admin = (req, res) => {
  res.status(200).json({ status: "success", message: "Welcome, Admin" });
};

const user = (req, res) => {
  res.status(200).json({ status: "success", message: "Welcome, User" });
};

const adminTransfer = async (req, res) => {
  const { receiverAccNo, receiverName, amount, description } = req.body || {};

  if (!isPositiveNumber(amount)) return error(res, 400, "Amount must be a positive number");
  if (!receiverAccNo && !receiverName) return error(res, 400, "Receiver account number or name is required");

  let targetAccNo = receiverAccNo;
  if (!targetAccNo && receiverName) {
    const target = await bank.findAccountByOwnerName(receiverName);
    if (!target) return error(res, 404, "Receiver not found");
    targetAccNo = target.account.accNo;
  }

  const result = await bank.adminAdjust({
    targetAccNo,
    amount,
    direction: "credit",
    description: description || "Admin transfer",
  });

  res.status(200).json({
    status: "success",
    message: `Admin transferred ${amount} to ${result.name}`,
    receiverBalance: result.balance,
    reference: result.reference,
  });
};

const getUsers = async (req, res) => {
  const users = await bank.listUsers();
  res.status(200).json({ status: "success", users });
};

const setStatus = async (req, res) => {
  const result = await bank.updateUserStatus(req.params.id, req.body.status);
  res.status(200).json({ status: "success", message: `Account ${result.status}`, user: result });
};

const getTransactions = async (req, res) => {
  const transactions = await bank.listAllTransactions(req.query);
  res.status(200).json({ status: "success", transactions });
};

const adjust = async (req, res) => {
  const { accNo, accountNumber, amount, direction, description } = req.body || {};
  const targetAccNo = accNo || accountNumber;

  if (!targetAccNo) return error(res, 400, "Account number is required");
  if (!isPositiveNumber(amount)) return error(res, 400, "Amount must be a positive number");

  const result = await bank.adminAdjust({
    targetAccNo,
    amount,
    direction: direction === "debit" ? "debit" : "credit",
    description: description || "Admin adjustment",
  });

  res.status(200).json({
    status: "success",
    message: `${direction === "debit" ? "Debited" : "Credited"} ${amount} for ${result.name}`,
    balance: result.balance,
    reference: result.reference,
  });
};

module.exports = { admin, user, adminTransfer, getUsers, setStatus, getTransactions, adjust };
