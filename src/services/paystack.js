const { randomUUID } = require("node:crypto");

const API_URL = "https://api.paystack.co";

const requireTestSecret = () => {
  const secret = process.env.PAYSTACK_SECRET_KEY || "";
  if (!secret.startsWith("sk_test_")) {
    const err = new Error("Paystack test transfers require a test secret key (sk_test_...)");
    err.status = 503;
    throw err;
  }
  return secret;
};

const request = async (path, { method = "GET", body } = {}) => {
  const secret = requireTestSecret();
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    const err = new Error("Could not connect to Paystack. Check your network and try again.");
    err.status = 502;
    throw err;
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.status) {
    const err = new Error(payload.message || "Paystack request failed");
    err.status = response.status >= 400 && response.status < 500 ? 400 : 502;
    throw err;
  }
  return payload.data;
};

const listNigerianBanks = async () => {
  const data = await request("/bank?country=nigeria&perPage=100");
  return (Array.isArray(data) ? data : []).map(({ name, code }) => ({ name, code }));
};

const initiateTestTransfer = async ({ accountName, accountNumber, bankCode, amount, reason }) => {
  const recipient = await request("/transferrecipient", {
    method: "POST",
    body: {
      type: "nuban",
      name: accountName,
      account_number: accountNumber,
      bank_code: bankCode,
      currency: "NGN",
    },
  });

  const transfer = await request("/transfer", {
    method: "POST",
    body: {
      source: "balance",
      amount: Math.round(Number(amount) * 100),
      recipient: recipient.recipient_code,
      reference: `bb-${randomUUID()}`,
      reason: reason || "Bank Backy test transfer",
      currency: "NGN",
    },
  });

  return {
    status: transfer.status,
    reference: transfer.reference,
    transferCode: transfer.transfer_code,
    needsOtp: transfer.status === "otp",
    amount: transfer.amount,
    currency: transfer.currency,
  };
};

const finalizeTestTransfer = async ({ transferCode, otp }) => {
  const transfer = await request("/transfer/finalize_transfer", {
    method: "POST",
    body: { transfer_code: transferCode, otp },
  });
  return {
    status: transfer.status,
    reference: transfer.reference,
    transferCode: transfer.transfer_code,
    amount: transfer.amount,
    currency: transfer.currency,
  };
};

module.exports = { listNigerianBanks, initiateTestTransfer, finalizeTestTransfer };
