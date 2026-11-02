const authorization = (req, res, next) => {
  const role = req?.user?.role;

  if (!req?.user || role !== "admin") {
    if (res && typeof res.status === "function") {
      return res.status(403).json({
        message: "Access denied. Admins only.",
      });
    }

    if (typeof next === "function") {
      return next(new Error("Access denied. Admins only."));
    }

    return;
  }

  if (typeof next === "function") {
    next();
  }
};

module.exports = {authorization};