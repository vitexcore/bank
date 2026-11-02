const errorHandler = (err, req, res, next) => {
  let status = err.status || 500;
  let message = err.message;

  if (err.code === "23505") {
    status = 409;
    message = "That value is already in use";
  } else if (err.code === "23503") {
    status = 400;
    message = "Related record not found";
  }

  if (status >= 500) {
    console.error(err.stack);
    message = "Internal Server Error";
  }

  res.status(status).json({ status: "error", message });
};

module.exports = errorHandler;
