const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const bank = require("../models/account");
const paystack = require("../services/paystack");

const signToken = (user, accNo) =>
  jwt.sign(
    { id: user.id, name: user.name, accNo, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES || "1d" }
  );

const error = (res, status, message) => res.status(status).json({ status: "error", message });

const register = async (req, res) => {
  const { name, password, role, email, phone, pin } = req.body;
  const userRole = String(role || "user").toLowerCase();

  const { user, account } = await bank.createUser({ name, email, phone, password, role: userRole, pin });

  res.status(201).json({
    status: "success",
    message: "Account created successfully",
    id: user.id,
    accNo: account.accNo,
    role: user.role,
  });
};

const login = async (req, res) => {
  const { name, password, role } = req.body;
  const userRole = String(role || "user").toLowerCase();

  const user = await bank.findUserByName(name, userRole);
  if (!user) return error(res, 401, "Invalid name, role or password");

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return error(res, 401, "Invalid name, role or password");
  if (user.status === "closed") return error(res, 403, "This account is closed");

  const account = await bank.getPrimaryAccountByUserId(user.id);

  res.status(200).json({
    status: "success",
    message: "Login successful",
    role: user.role,
    name: user.name,
    accNo: account ? account.accNo : null,
    token: signToken(user, account ? account.accNo : null),
  });
};

const currentAccount = async (req, res) => {
  const data = await bank.findAccountByAccNo(req.user.accNo);
  if (!data) {
    error(res, 404, "Account not found. Login again to get a fresh token");
    return null;
  }
  return data;
};

const me = async (req, res) => {
  const data = await currentAccount(req, res);
  if (!data) return;
  res.status(200).json({
    status: "success",
    user: { ...data.user, hasPin: Boolean(data.pinHash) },
    account: data.account,
  });
};

const balance = async (req, res) => {
  const data = await currentAccount(req, res);
  if (!data) return;
  res.status(200).json({
    status: "success",
    id: data.user.id,
    accNo: data.account.accNo,
    name: data.user.name,
    balance: data.account.balance,
    currency: data.account.currency,
    accountType: data.account.type,
    accountStatus: data.user.status,
  });
};

const createPin = async (req, res) => {
  const data = await currentAccount(req, res);
  if (!data) return;
  if (data.pinHash) return error(res, 400, "PIN already exists, use update PIN");

  await bank.setPin(data.user.id, req.body.pin);
  res.status(201).json({ status: "success", message: "PIN created successfully" });
};

const updatePin = async (req, res) => {
  const data = await currentAccount(req, res);
  if (!data) return;
  const { currentPin, pin } = req.body;

  if (!data.pinHash) return error(res, 400, "No PIN set, create a PIN first");

  const valid = await bank.verifyPin(data.user.id, currentPin);
  if (!valid) return error(res, 401, "Current PIN is incorrect");

  await bank.setPin(data.user.id, pin);
  res.status(200).json({ status: "success", message: "PIN updated successfully" });
};

const deposit = async (req, res) => {
  const data = await currentAccount(req, res);
  if (!data) return;

  const result = await bank.deposit(data.account.accNo, req.body.amount, req.body.description);
  res.status(200).json({
    status: "success",
    message: `Deposited ${req.body.amount} to your account`,
    balance: result.balance,
    reference: result.reference,
  });
};

const withdraw = async (req, res) => {
  const data = await currentAccount(req, res);
  if (!data) return;

  const result = await bank.withdraw(data.account.accNo, req.body.amount, req.body.description);
  res.status(200).json({
    status: "success",
    message: `Withdrew ${req.body.amount} from your account`,
    balance: result.balance,
    reference: result.reference,
  });
};

const transfer = async (req, res) => {
  const data = await currentAccount(req, res);
  if (!data) return;

  const { amount, pin, receiverAccNo, receiverName, description } = req.body;
  if (!data.pinHash) return error(res, 400, "Create a PIN before making a transfer");

  const valid = await bank.verifyPin(data.user.id, pin);
  if (!valid) return error(res, 401, "PIN is incorrect");

  let toAccNo = receiverAccNo;
  if (!toAccNo && receiverName) {
    const target = await bank.findAccountByOwnerName(receiverName);
    if (!target) return error(res, 404, "Receiver not found");
    toAccNo = target.account.accNo;
  }

  const result = await bank.transfer({
    fromAccNo: data.account.accNo,
    toAccNo,
    amount,
    description,
  });

  res.status(200).json({
    status: "success",
    message: `Transferred ${amount} to ${result.receiver.name}`,
    balance: result.balance,
    reference: result.reference,
    receiver: result.receiver,
  });
};

const paystackBanks = async (req, res) => {
  const banks = await paystack.listNigerianBanks();
  res.status(200).json({ status: "success", banks, mode: "test" });
};

const paystackTestTransfer = async (req, res) => {
  const transfer = await paystack.initiateTestTransfer(req.body);
  res.status(200).json({
    status: "success",
    message: transfer.needsOtp ? "Paystack requires an OTP to finish this test transfer" : "Paystack test transfer submitted",
    transfer,
  });
};

const paystackTestFinalize = async (req, res) => {
  const transfer = await paystack.finalizeTestTransfer(req.body);
  res.status(200).json({ status: "success", message: "Paystack test transfer finalized", transfer });
};

const lookupAccount = async (req, res) => {
  const data = await currentAccount(req, res);
  if (!data) return;

  const accNo = String(req.query.accNo || req.query.accountNumber || "").trim();
  if (!accNo) return error(res, 400, "Account number is required");

  const target = await bank.findAccountByAccNo(accNo);
  if (!target) return error(res, 404, "No account matches this number");

  res.status(200).json({
    status: "success",
    account: { accNo: target.account.accNo, name: target.user.name },
  });
};

const transactions = async (req, res) => {
  const data = await currentAccount(req, res);
  if (!data) return;

  const list = await bank.listTransactions(data.account.id, req.query);
  res.status(200).json({ status: "success", transactions: list });
};

const beneficiaries = async (req, res) => {
  const data = await currentAccount(req, res);
  if (!data) return;

  const list = await bank.listBeneficiaries(data.user.id);
  res.status(200).json({ status: "success", beneficiaries: list });
};

const addBeneficiary = async (req, res) => {
  const data = await currentAccount(req, res);
  if (!data) return;

  const { accNo, accountNumber, nickname } = req.body;
  const beneficiary = await bank.addBeneficiary(data.user.id, accNo || accountNumber, nickname);
  res.status(201).json({ status: "success", message: "Beneficiary saved", beneficiary });
};

const removeBeneficiary = async (req, res) => {
  const data = await currentAccount(req, res);
  if (!data) return;

  await bank.removeBeneficiary(data.user.id, req.params.id);
  res.status(200).json({ status: "success", message: "Beneficiary removed" });
};

const updateProfile = async (req, res) => {
  const data = await currentAccount(req, res);
  if (!data) return;

  const user = await bank.updateProfile(data.user.id, req.body);
  res.status(200).json({ status: "success", message: "Profile updated", user });
};

const changePassword = async (req, res) => {
  const data = await currentAccount(req, res);
  if (!data) return;
  const { currentPassword, newPassword } = req.body;

  const valid = await bcrypt.compare(currentPassword, data.passwordHash);
  if (!valid) return error(res, 401, "Current password is incorrect");

  await bank.updatePassword(data.user.id, newPassword);
  res.status(200).json({ status: "success", message: "Password updated successfully" });
};

const allUsers = async (req, res) => {
  const users = await bank.listUsers();
  res.status(200).json({ status: "success", users });
};

module.exports = {
  register,
  login,
  me,
  balance,
  createPin,
  updatePin,
  deposit,
  withdraw,
  transfer,
  paystackBanks,
  paystackTestTransfer,
  paystackTestFinalize,
  lookupAccount,
  transactions,
  beneficiaries,
  addBeneficiary,
  removeBeneficiary,
  updateProfile,
  changePassword,
  allUsers,
};
