const assert = require("node:assert/strict");
const paystack = require("../src/services/paystack");

const run = async () => {
  const previousKey = process.env.PAYSTACK_SECRET_KEY;
  const previousFetch = global.fetch;
  const requests = [];
  const replies = [
    { status: true, data: [{ name: "Zenith Bank", code: "057" }] },
    { status: true, data: { recipient_code: "RCP_test123" } },
    { status: true, data: { status: "otp", transfer_code: "TRF_test123", reference: "bb-test", amount: 12345, currency: "NGN" } },
    { status: true, data: { status: "success", transfer_code: "TRF_test123", reference: "bb-test", amount: 12345, currency: "NGN" } },
  ];

  process.env.PAYSTACK_SECRET_KEY = "sk_test_unit_test_key";
  global.fetch = async (url, options) => {
    requests.push({ url, options });
    return { ok: true, status: 200, json: async () => replies.shift() };
  };

  try {
    const banks = await paystack.listNigerianBanks();
    assert.deepEqual(banks, [{ name: "Zenith Bank", code: "057" }]);

    const initiated = await paystack.initiateTestTransfer({
      accountName: "Test Recipient",
      accountNumber: "0000000000",
      bankCode: "057",
      amount: 123.45,
      reason: "Integration test",
    });
    assert.equal(initiated.needsOtp, true);
    assert.equal(initiated.transferCode, "TRF_test123");

    const recipientRequest = JSON.parse(requests[1].options.body);
    assert.equal(recipientRequest.account_number, "0000000000");
    assert.equal(recipientRequest.bank_code, "057");
    const transferRequest = JSON.parse(requests[2].options.body);
    assert.equal(transferRequest.amount, 12345, "NGN amount should be converted to kobo");
    assert.equal(transferRequest.recipient, "RCP_test123");
    assert.match(transferRequest.reference, /^bb-[a-f0-9-]{36}$/);
    assert.equal(requests[0].options.headers.Authorization, "Bearer sk_test_unit_test_key");

    const finalized = await paystack.finalizeTestTransfer({ transferCode: "TRF_test123", otp: "123456" });
    assert.equal(finalized.status, "success");
    assert.deepEqual(JSON.parse(requests[3].options.body), { transfer_code: "TRF_test123", otp: "123456" });

    process.env.PAYSTACK_SECRET_KEY = "sk_live_never-use-this";
    await assert.rejects(() => paystack.listNigerianBanks(), /require a test secret key/);
    assert.equal(requests.length, 4, "live keys must be rejected before making a request");

    console.log("Paystack sandbox integration test passed");
  } finally {
    if (previousKey === undefined) delete process.env.PAYSTACK_SECRET_KEY;
    else process.env.PAYSTACK_SECRET_KEY = previousKey;
    global.fetch = previousFetch;
  }
};

run().catch((err) => {
  console.error("Paystack test failed:", err);
  process.exitCode = 1;
});
