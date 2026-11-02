const express = require("express");
const router = express.Router();

const {
  admin,
  user,
  adminTransfer,
  getUsers,
  setStatus,
  getTransactions,
  adjust,
} = require("../controllers/adminController");
const authenticate = require("../middleware/authentication");
const { authorization } = require("../middleware/authorization");

router.get("/admin", authenticate, authorization, admin);
router.get("/user", authenticate, user);

router.post("/transfer", authenticate, authorization, adminTransfer);
router.post("/adjust", authenticate, authorization, adjust);

router.get("/users", authenticate, authorization, getUsers);
router.put("/users/:id/status", authenticate, authorization, setStatus);
router.get("/transactions", authenticate, authorization, getTransactions);

module.exports = router;
