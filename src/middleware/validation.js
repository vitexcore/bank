const { findUserByName, findUserByPhone } = require("../models/account");

const validRoles = ["admin", "user"];

const isPin = (pin) => /^\d{4}$/.test(String(pin));
const isPositiveNumber = (value) => typeof value === "number" && Number.isFinite(value) && value > 0;

const register = async (req, res, next) => {
  const { name, password, role, phone } = req.body || {};
  const userRole = String(role || "user").toLowerCase();
  const phoneDigits = String(phone || "").replace(/\D/g, "");

  if (!name || !password) {
    return res.status(400).json({ status: "error", message: "Name and password are required" });
  }
  if (!validRoles.includes(userRole)) {
    return res.status(400).json({ status: "error", message: "Role must be either admin or user" });
  }
  if (String(name).length < 4 || String(password).length < 6) {
    return res.status(400).json({
      status: "error",
      message: "Name must be at least 4 characters and password must be at least 6 characters",
    });
  }
  if (phoneDigits.length !== 11) {
    return res.status(400).json({
      status: "error",
      message: "Phone number must be exactly 11 digits",
    });
  }

  const existing = await findUserByName(name, userRole);
  if (existing) {
    return res.status(409).json({ status: "error", message: "Name is already taken for this role" });
  }

  const phoneTaken = await findUserByPhone(phoneDigits);
  if (phoneTaken) {
    return res.status(409).json({ status: "error", message: "Phone number is already registered" });
  }

  next();
};

const login = async (req, res, next) => {
  const { name, password, role } = req.body || {};
  const userRole = String(role || "user").toLowerCase();

  if (!name || !password) {
    return res.status(400).json({ status: "error", message: "Name and password are required" });
  }
  if (!validRoles.includes(userRole)) {
    return res.status(400).json({ status: "error", message: "Role must be either admin or user" });
  }

  next();
};

const createPin = (req, res, next) => {
  const { pin } = req.body || {};
  if (!isPin(pin)) {
    return res.status(400).json({ status: "error", message: "PIN must be exactly 4 digits" });
  }
  next();
};

const updatePin = (req, res, next) => {
  const { currentPin, pin } = req.body || {};
  if (!isPin(pin)) {
    return res.status(400).json({ status: "error", message: "PIN must be exactly 4 digits" });
  }
  if (!currentPin) {
    return res.status(400).json({ status: "error", message: "Current PIN is required" });
  }
  next();
};

const resolveReceiver = (body) => {
  const { receiverAccNo, receiverName, receiverId } = body || {};
  if (!receiverAccNo && !receiverName && !receiverId) return null;
  return receiverAccNo || receiverName || receiverId;
};

const transfer = (req, res, next) => {
  const { amount, pin } = req.body || {};
  if (!resolveReceiver(req.body)) {
    return res.status(400).json({ status: "error", message: "Receiver account number or name is required" });
  }
  if (!isPositiveNumber(amount)) {
    return res.status(400).json({ status: "error", message: "Amount must be a positive number" });
  }
  if (!isPin(pin)) {
    return res.status(400).json({ status: "error", message: "PIN must be exactly 4 digits" });
  }
  next();
};

const deposit = (req, res, next) => {
  const { amount } = req.body || {};
  if (!isPositiveNumber(amount)) {
    return res.status(400).json({ status: "error", message: "Amount must be a positive number" });
  }
  next();
};

const withdraw = deposit;

const paystackTestTransfer = (req, res, next) => {
  const { accountName, accountNumber, bankCode, amount, reason } = req.body || {};
  if (!accountName || String(accountName).trim().length > 100) {
    return res.status(400).json({ status: "error", message: "Recipient account name is required (up to 100 characters)" });
  }
  if (!/^\d{10}$/.test(String(accountNumber || ""))) {
    return res.status(400).json({ status: "error", message: "Nigerian account number must be 10 digits" });
  }
  if (!/^\d{1,10}$/.test(String(bankCode || ""))) {
    return res.status(400).json({ status: "error", message: "Select a valid bank" });
  }
  if (!/^(?:\d+)(?:\.\d{1,2})?$/.test(String(amount || "")) || Number(amount) <= 0) {
    return res.status(400).json({ status: "error", message: "Amount must be positive and have at most 2 decimal places" });
  }
  if (reason !== undefined && String(reason).length > 80) {
    return res.status(400).json({ status: "error", message: "Transfer note must be 80 characters or less" });
  }
  next();
};

const paystackTestFinalize = (req, res, next) => {
  const { transferCode, otp } = req.body || {};
  if (!/^TRF_[A-Za-z0-9]+$/.test(String(transferCode || ""))) {
    return res.status(400).json({ status: "error", message: "A valid Paystack transfer code is required" });
  }
  if (!/^\d{6}$/.test(String(otp || ""))) {
    return res.status(400).json({ status: "error", message: "OTP must be 6 digits" });
  }
  next();
};

const addBeneficiary = (req, res, next) => {
  const { accNo, accountNumber } = req.body || {};
  if (!accNo && !accountNumber) {
    return res.status(400).json({ status: "error", message: "Account number is required" });
  }
  next();
};

const updateProfile = (req, res, next) => {
  const { email, phone } = req.body || {};
  if (email !== undefined && email !== null && email !== "" && !/^\S+@\S+\.\S+$/.test(String(email))) {
    return res.status(400).json({ status: "error", message: "Enter a valid email address" });
  }
  if (phone !== undefined && phone !== null && phone !== "" && String(phone).replace(/\D/g, "").length !== 11) {
    return res.status(400).json({ status: "error", message: "Phone number must be exactly 11 digits" });
  }
  next();
};

const changePassword = (req, res, next) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ status: "error", message: "Current and new password are required" });
  }
  if (String(newPassword).length < 6) {
    return res.status(400).json({ status: "error", message: "New password must be at least 6 characters" });
  }
  next();
};

module.exports = {
  register,
  login,
  createPin,
  updatePin,
  transfer,
  deposit,
  withdraw,
  paystackTestTransfer,
  paystackTestFinalize,
  addBeneficiary,
  updateProfile,
  changePassword,
};
