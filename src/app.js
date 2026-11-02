require("dotenv").config({ quiet: true });

const express = require("express");
const path = require("path");
const cors = require("cors");

const app = express();
const logger = require("./middleware/logger");
const errorHandler = require("./middleware/error");
const userRoutes = require("./routes/user.route");
const roleRoutes = require("./routes/role.route");

app.use(cors());
app.use(express.json());
app.use(logger);

app.get(["/health", "/api/health"], (req, res) => {
  res.status(200).json({ status: "success", message: "Bank Backy API is running" });
});

// Routes (both clean and /api-prefixed paths)
app.use(["/user", "/api/user"], userRoutes);
app.use(["/users", "/api/users"], userRoutes.usersRouter);
app.use(["/role", "/api/role"], roleRoutes);
app.use(["/admin", "/api/admin"], roleRoutes);

// Static frontend
app.use(express.static(path.join(__dirname, "..", "public")));

// 404 for unknown API routes
app.use(["/user", "/users", "/role", "/admin", "/api"], (req, res) => {
  res.status(404).json({ status: "error", message: "Route not found" });
});

// Error handler (must be last, 4-arg middleware)
app.use(errorHandler);

module.exports = app;
