const express = require("express");
const router = express.Router();
const usersRouter = express.Router();

const {
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
} = require("../controllers/user");

const {
  register: registerValidation,
  login: loginValidation,
  createPin: createPinValidation,
  updatePin: updatePinValidation,
  transfer: transferValidation,
  paystackTestTransfer: paystackTestTransferValidation,
  paystackTestFinalize: paystackTestFinalizeValidation,
  deposit: depositValidation,
  withdraw: withdrawValidation,
  addBeneficiary: addBeneficiaryValidation,
  updateProfile: updateProfileValidation,
  changePassword: changePasswordValidation,
} = require("../middleware/validation");

const authenticate = require("../middleware/authentication");

router.post("/register", registerValidation, register);
router.post("/login", loginValidation, login);

router.get("/me", authenticate, me);
router.get("/balance", authenticate, balance);

router.post("/pin", authenticate, createPinValidation, createPin);
router.put("/pin", authenticate, updatePinValidation, updatePin);

router.post("/deposit", authenticate, depositValidation, deposit);
router.post("/withdraw", authenticate, withdrawValidation, withdraw);
router.post("/transfer", authenticate, transferValidation, transfer);
router.get("/paystack/banks", authenticate, paystackBanks);
router.post("/paystack/test-transfer", authenticate, paystackTestTransferValidation, paystackTestTransfer);
router.post("/paystack/test-transfer/finalize", authenticate, paystackTestFinalizeValidation, paystackTestFinalize);
router.get("/lookup", authenticate, lookupAccount);
router.get("/transactions", authenticate, transactions);

router.get("/beneficiaries", authenticate, beneficiaries);
router.post("/beneficiaries", authenticate, addBeneficiaryValidation, addBeneficiary);
router.delete("/beneficiaries/:id", authenticate, removeBeneficiary);

router.put("/profile", authenticate, updateProfileValidation, updateProfile);
router.put("/password", authenticate, changePasswordValidation, changePassword);

usersRouter.get("/", authenticate, allUsers);

module.exports = router;
module.exports.usersRouter = usersRouter;
