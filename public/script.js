/* Bank Backy frontend
   Set window.BANK_API_BASE before this script if the API lives on another origin. */
const API_BASE = window.BANK_API_BASE || "";

const state = {
  token: localStorage.getItem("bb_token"),
  user: null,
  account: null,
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

const formatMoney = (amount, currency = "USD") => {
  const value = Number(amount) || 0;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
  } catch {
    return value.toFixed(2);
  }
};

const formatDate = (value) => {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString(undefined, {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
};

const typeLabel = (type) =>
  ({
    deposit: "Deposit",
    withdrawal: "Withdrawal",
    transfer: "Transfer",
    admin_credit: "Admin credit",
    admin_debit: "Admin debit",
  }[type] || type);

function toast(message, kind = "info", title) {
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.innerHTML = `<div class="t-title">${escapeHtml(title || (kind === "error" ? "Something went wrong" : "Done"))}</div>
    <div class="t-msg">${escapeHtml(message)}</div>`;
  $("#toasts").appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity .3s, transform .3s";
    el.style.opacity = "0";
    el.style.transform = "translateX(20px)";
    setTimeout(() => el.remove(), 300);
  }, 3600);
}

async function api(path, { method = "GET", body, auth = true } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth && state.token) headers.Authorization = `Bearer ${state.token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && auth) {
    handleLogout(true);
    throw new Error(data.message || "Session expired. Please sign in again.");
  }
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

function setButtonLoading(button, loading) {
  if (!button) return;
  button.disabled = loading;
  if (loading) {
    button.dataset.label = button.textContent;
    button.textContent = "Please wait...";
  } else if (button.dataset.label) {
    button.textContent = button.dataset.label;
  }
}

const VIEW_TITLES = {
  dashboard: "Dashboard",
  transfer: "Transfer",
  cash: "Deposit / Withdraw",
  transactions: "Transactions",
  beneficiaries: "Beneficiaries",
  profile: "Profile",
  admin: "Admin panel",
};

function setView(name) {
  $$(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  $$(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${name}`));
  $("#page-title").textContent = VIEW_TITLES[name] || "Dashboard";

  if (name === "dashboard") loadDashboard();
  if (name === "transfer") {
    loadBeneficiaryOptions();
    loadPaystackBanks();
  }
  if (name === "transactions") loadTransactions();
  if (name === "beneficiaries") loadBeneficiaries();
  if (name === "profile") renderProfile();
  if (name === "admin") {
    loadAdminUsers();
    loadAdminTransactions();
  }
}

/* ---------------- Session ---------------- */

function showAuth() {
  $("#auth-view").classList.remove("hidden");
  $("#app-view").classList.add("hidden");
}

function showApp() {
  $("#auth-view").classList.add("hidden");
  $("#app-view").classList.remove("hidden");
}

function updateMe() {
  const { user } = state;
  if (!user) return;
  const initials = user.name.slice(0, 2).toUpperCase();
  $("#me-avatar").textContent = initials;
  $("#me-name").textContent = user.name;
  $("#me-role").textContent = user.role;
  $$(".admin-only").forEach((el) => el.classList.toggle("hidden", user.role !== "admin"));
  updateBalancePill();
}

function updateBalancePill() {
  const cur = state.account?.currency || "USD";
  $("#balance-pill").textContent = state.account ? formatMoney(state.account.balance, cur) : "--";
}

async function loadSession() {
  const { user, account } = await api("/user/me");
  state.user = user;
  state.account = account;
  updateMe();
  showApp();
  setView("dashboard");
}

async function handleLogin(name, password, role) {
  const data = await api("/user/login", {
    method: "POST",
    auth: false,
    body: { name, password, role },
  });
  state.token = data.token;
  localStorage.setItem("bb_token", data.token);
  await loadSession();
}

function handleLogout(silent) {
  state.token = null;
  state.user = null;
  state.account = null;
  localStorage.removeItem("bb_token");
  showAuth();
  if (silent) toast("Your session ended. Please sign in again.", "error", "Signed out");
}

/* ---------------- Dashboard ---------------- */

async function loadDashboard() {
  const cur = state.account?.currency || "USD";
  $("#dash-balance").textContent = formatMoney(state.account.balance, cur);
  $("#dash-acc").textContent = `Acct ${state.account.accNo}`;
  $("#dash-type").textContent = `${state.account.type} account`;
  const badge = $("#dash-status");
  badge.textContent = state.user.status;
  badge.className = `status-badge ${state.user.status}`;

  try {
    const { transactions } = await api("/user/transactions?limit=200");
    const income = transactions.filter((t) => t.direction === "credit").reduce((s, t) => s + t.amount, 0);
    const expense = transactions.filter((t) => t.direction === "debit").reduce((s, t) => s + t.amount, 0);
    $("#dash-in").textContent = formatMoney(income, cur);
    $("#dash-out").textContent = formatMoney(expense, cur);
    renderTxList($("#dash-tx"), transactions.slice(0, 6), cur);
  } catch (err) {
    $("#dash-tx").innerHTML = `<div class="empty">${escapeHtml(err.message)}</div>`;
  }
}

function txRow(tx, cur, currency) {
  const c = currency || cur;
  const sign = tx.direction === "credit" ? "+" : "-";
  const title = tx.counterpartyName
    ? `${tx.direction === "credit" ? "From" : "To"} ${escapeHtml(tx.counterpartyName)}`
    : typeLabel(tx.type);
  return `<div class="tx-row">
    <div class="tx-icon ${tx.direction}">${tx.direction === "credit" ? "IN" : "OUT"}</div>
    <div class="tx-main">
      <div class="tx-title">${title}</div>
      <div class="tx-sub">${formatDate(tx.createdAt)}${tx.description ? " &middot; " + escapeHtml(tx.description) : ""}</div>
    </div>
    <div class="tx-amt ${tx.direction}">${sign}${formatMoney(tx.amount, c)}</div>
  </div>`;
}

function renderTxList(container, transactions, currency) {
  if (!transactions.length) {
    container.innerHTML = `<div class="empty">No transactions yet.</div>`;
    return;
  }
  container.innerHTML = transactions.map((t) => txRow(t, currency)).join("");
}

/* ---------------- Transfer ---------------- */

async function loadBeneficiaryOptions() {
  try {
    const { beneficiaries } = await api("/user/beneficiaries");
    const select = $("#transfer-beneficiary");
    select.innerHTML =
      `<option value="">-- choose --</option>` +
      beneficiaries
        .map((b) => `<option value="${escapeHtml(b.accNo)}">${escapeHtml(b.nickname || b.name)} · ${escapeHtml(b.accNo)}</option>`)
        .join("");
  } catch {
    /* ignore */
  }
}

function setupAccountLookup(inputId, hintId) {
  const input = document.getElementById(inputId);
  const hint = document.getElementById(hintId);
  if (!input || !hint) return;

  let timer;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    const accNo = input.value.replace(/\D/g, "");
    input.value = accNo;
    hint.textContent = "";
    hint.className = "hint";

    if (accNo.length !== 10) return;

    timer = setTimeout(async () => {
      try {
        const { account } = await api(`/user/lookup?accNo=${encodeURIComponent(accNo)}`);
        hint.textContent = `Account name: ${account.name}`;
        hint.className = "hint ok";
      } catch (err) {
        hint.textContent = err.message;
        hint.className = "hint err";
      }
    }, 350);
  });
}

async function submitTransfer(e) {
  e.preventDefault();
  const button = e.submitter || e.target.querySelector("button");
  const body = {
    receiverAccNo: $("#transfer-acc").value.trim(),
    amount: parseFloat($("#transfer-amount").value),
    pin: $("#transfer-pin").value.trim(),
    description: $("#transfer-desc").value.trim() || undefined,
  };
  try {
    setButtonLoading(button, true);
    const data = await api("/user/transfer", { method: "POST", body });
    toast(data.message, "success", "Transfer sent");
    e.target.reset();
    await refreshAccount();
    loadDashboard();
  } catch (err) {
    toast(err.message, "error", "Transfer failed");
  } finally {
    setButtonLoading(button, false);
  }
}

async function loadPaystackBanks() {
  const select = $("#paystack-bank");
  if (select.dataset.loaded === "true") return;
  try {
    const { banks } = await api("/user/paystack/banks");
    select.innerHTML = '<option value="">-- choose a Nigerian bank --</option>' + banks
      .map((bank) => `<option value="${escapeHtml(bank.code)}">${escapeHtml(bank.name)}</option>`)
      .join("");
    select.dataset.loaded = "true";
  } catch (err) {
    select.innerHTML = '<option value="">Paystack test key required</option>';
    toast(err.message, "error", "Paystack test mode unavailable");
  }
}

async function submitPaystackTestTransfer(e) {
  e.preventDefault();
  const button = e.submitter || e.target.querySelector("button");
  const body = {
    accountName: $("#paystack-account-name").value.trim(),
    accountNumber: $("#paystack-account-number").value.trim(),
    bankCode: $("#paystack-bank").value,
    amount: Number($("#paystack-amount").value),
    reason: $("#paystack-reason").value.trim() || undefined,
  };
  try {
    setButtonLoading(button, true);
    const { transfer } = await api("/user/paystack/test-transfer", { method: "POST", body });
    if (transfer.needsOtp) {
      $("#paystack-transfer-code").value = transfer.transferCode;
      $("#paystack-otp-form").classList.remove("hidden");
      toast("Enter the Paystack OTP to finish the test transfer.", "info", "OTP required");
    } else {
      toast(`Reference: ${transfer.reference} · Status: ${transfer.status}`, "success", "Paystack test transfer complete");
      e.target.reset();
    }
  } catch (err) {
    toast(err.message, "error", "Paystack test transfer failed");
  } finally {
    setButtonLoading(button, false);
  }
}

async function submitPaystackOtp(e) {
  e.preventDefault();
  const button = e.submitter || e.target.querySelector("button");
  const body = {
    transferCode: $("#paystack-transfer-code").value,
    otp: $("#paystack-otp").value.trim(),
  };
  try {
    setButtonLoading(button, true);
    const { transfer } = await api("/user/paystack/test-transfer/finalize", { method: "POST", body });
    toast(`Reference: ${transfer.reference} · Status: ${transfer.status}`, "success", "Paystack test transfer complete");
    e.target.reset();
    e.target.classList.add("hidden");
    $("#paystack-test-transfer-form").reset();
  } catch (err) {
    toast(err.message, "error", "Could not finalize test transfer");
  } finally {
    setButtonLoading(button, false);
  }
}

/* ---------------- Cash ---------------- */

async function submitCash(e, action) {
  e.preventDefault();
  const button = e.submitter || e.target.querySelector("button");
  const id = action === "deposit" ? "deposit" : "withdraw";
  const body = {
    amount: parseFloat($(`#${id}-amount`).value),
    description: $(`#${id}-desc`).value.trim() || undefined,
  };
  try {
    setButtonLoading(button, true);
    const data = await api(`/user/${action}`, { method: "POST", body });
    toast(data.message, "success", action === "deposit" ? "Deposit complete" : "Withdrawal complete");
    e.target.reset();
    await refreshAccount();
    loadDashboard();
  } catch (err) {
    toast(err.message, "error", action === "deposit" ? "Deposit failed" : "Withdrawal failed");
  } finally {
    setButtonLoading(button, false);
  }
}

async function refreshAccount() {
  try {
    const { user, account } = await api("/user/me");
    state.user = user;
    state.account = account;
    updateMe();
  } catch {
    /* handled by api */
  }
}

/* ---------------- Transactions ---------------- */

async function loadTransactions() {
  const params = new URLSearchParams();
  const type = $("#tx-type").value;
  const direction = $("#tx-direction").value;
  const from = $("#tx-from").value;
  const to = $("#tx-to").value;
  if (type) params.set("type", type);
  if (direction) params.set("direction", direction);
  if (from) params.set("from", from);
  if (to) params.set("to", `${to} 23:59:59`);
  params.set("limit", "100");

  const container = $("#tx-table");
  container.innerHTML = `<div class="empty">Loading...</div>`;
  try {
    const { transactions } = await api(`/user/transactions?${params.toString()}`);
    container.innerHTML = transactionsTable(transactions, state.account.currency, false);
  } catch (err) {
    container.innerHTML = `<div class="empty">${escapeHtml(err.message)}</div>`;
  }
}

function transactionsTable(transactions, currency, showOwner) {
  if (!transactions.length) return `<div class="empty">No transactions found.</div>`;
  const rows = transactions
    .map(
      (t) => `<tr>
        <td>${formatDate(t.createdAt)}</td>
        ${showOwner ? `<td>${escapeHtml(t.ownerName || "-")}<div class="tx-sub">${escapeHtml(t.accNo || "")}</div></td>` : ""}
        <td>${escapeHtml(typeLabel(t.type))}</td>
        <td>${escapeHtml(t.counterpartyName || "-")}</td>
        <td><span class="tag ${t.direction}">${t.direction === "credit" ? "In" : "Out"}</span></td>
        <td>${formatMoney(t.amount, currency)}</td>
        <td>${formatMoney(t.balanceAfter, currency)}</td>
        <td><code>${escapeHtml(t.reference)}</code></td>
      </tr>`
    )
    .join("");
  return `<table>
    <thead><tr>
      <th>Date</th>${showOwner ? "<th>Account</th>" : ""}<th>Type</th><th>Counterparty</th>
      <th>Direction</th><th>Amount</th><th>Balance after</th><th>Reference</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

/* ---------------- Beneficiaries ---------------- */

async function loadBeneficiaries() {
  const container = $("#beneficiary-list");
  container.innerHTML = `<div class="empty">Loading...</div>`;
  try {
    const { beneficiaries } = await api("/user/beneficiaries");
    if (!beneficiaries.length) {
      container.innerHTML = `<div class="empty">No beneficiaries saved yet.</div>`;
      return;
    }
    container.innerHTML = beneficiaries
      .map(
        (b) => `<div class="list-item">
          <div class="tx-icon">${escapeHtml((b.nickname || b.name).slice(0, 2).toUpperCase())}</div>
          <div class="grow">
            <div class="tx-title">${escapeHtml(b.nickname || b.name)}</div>
            <div class="tx-sub">${escapeHtml(b.name)} &middot; ${escapeHtml(b.accNo)}</div>
          </div>
          <button class="btn small danger" data-remove-beneficiary="${b.id}">Remove</button>
        </div>`
      )
      .join("");
  } catch (err) {
    container.innerHTML = `<div class="empty">${escapeHtml(err.message)}</div>`;
  }
}

async function submitBeneficiary(e) {
  e.preventDefault();
  const button = e.submitter || e.target.querySelector("button");
  try {
    setButtonLoading(button, true);
    const data = await api("/user/beneficiaries", {
      method: "POST",
      body: { accNo: $("#ben-acc").value.trim(), nickname: $("#ben-nick").value.trim() || undefined },
    });
    toast(data.message, "success", "Beneficiary saved");
    e.target.reset();
    loadBeneficiaries();
    loadBeneficiaryOptions();
  } catch (err) {
    toast(err.message, "error", "Could not save beneficiary");
  } finally {
    setButtonLoading(button, false);
  }
}

/* ---------------- Profile ---------------- */

function renderProfile() {
  const { user, account } = state;
  $("#profile-info").innerHTML = `
    <div class="info"><div class="label">Name</div><div class="val">${escapeHtml(user.name)}</div></div>
    <div class="info"><div class="label">Account number</div><div class="val">${escapeHtml(account.accNo)}</div></div>
    <div class="info"><div class="label">Account type</div><div class="val">${escapeHtml(account.type)}</div></div>
    <div class="info"><div class="label">Balance</div><div class="val">${formatMoney(account.balance, account.currency)}</div></div>
    <div class="info"><div class="label">Status</div><div class="val"><span class="tag ${user.status}">${escapeHtml(user.status)}</span></div></div>
    <div class="info"><div class="label">Role</div><div class="val">${escapeHtml(user.role)}</div></div>
    <div class="info"><div class="label">Member since</div><div class="val">${formatDate(user.createdAt)}</div></div>`;

  $("#profile-email").value = user.email || "";
  $("#profile-phone").value = user.phone || "";

  $("#pin-create-form").classList.toggle("hidden", user.hasPin);
  $("#pin-update-form").classList.toggle("hidden", !user.hasPin);
}

async function submitProfile(e) {
  e.preventDefault();
  const button = e.submitter || e.target.querySelector("button");
  try {
    setButtonLoading(button, true);
    await api("/user/profile", {
      method: "PUT",
      body: { email: $("#profile-email").value.trim(), phone: $("#profile-phone").value.trim() },
    });
    toast("Profile updated", "success");
    await refreshAccount();
    renderProfile();
  } catch (err) {
    toast(err.message, "error", "Update failed");
  } finally {
    setButtonLoading(button, false);
  }
}

async function submitPassword(e) {
  e.preventDefault();
  const button = e.submitter || e.target.querySelector("button");
  try {
    setButtonLoading(button, true);
    await api("/user/password", {
      method: "PUT",
      body: { currentPassword: $("#pw-current").value, newPassword: $("#pw-new").value },
    });
    toast("Password updated", "success");
    e.target.reset();
  } catch (err) {
    toast(err.message, "error", "Could not update password");
  } finally {
    setButtonLoading(button, false);
  }
}

async function submitPin(e, isUpdate) {
  e.preventDefault();
  const button = e.submitter || e.target.querySelector("button");
  try {
    setButtonLoading(button, true);
    if (isUpdate) {
      await api("/user/pin", {
        method: "PUT",
        body: { currentPin: $("#pin-current").value, pin: $("#pin-update-new").value },
      });
    } else {
      await api("/user/pin", { method: "POST", body: { pin: $("#pin-new").value } });
    }
    toast(isUpdate ? "PIN updated" : "PIN created", "success");
    e.target.reset();
    await refreshAccount();
    renderProfile();
  } catch (err) {
    toast(err.message, "error", "PIN update failed");
  } finally {
    setButtonLoading(button, false);
  }
}

/* ---------------- Admin ---------------- */

async function submitAdminAdjust(e) {
  e.preventDefault();
  const button = e.submitter || e.target.querySelector("button");
  try {
    setButtonLoading(button, true);
    const data = await api("/admin/adjust", {
      method: "POST",
      body: {
        accNo: $("#admin-acc").value.trim(),
        amount: parseFloat($("#admin-amount").value),
        direction: $("#admin-direction").value,
        description: $("#admin-desc").value.trim() || undefined,
      },
    });
    toast(data.message, "success", "Adjustment applied");
    e.target.reset();
    loadAdminUsers();
    loadAdminTransactions();
  } catch (err) {
    toast(err.message, "error", "Adjustment failed");
  } finally {
    setButtonLoading(button, false);
  }
}

async function loadAdminUsers() {
  const container = $("#admin-users");
  container.innerHTML = `<div class="empty">Loading...</div>`;
  try {
    const { users } = await api("/admin/users");
    if (!users.length) {
      container.innerHTML = `<div class="empty">No users.</div>`;
      return;
    }
    container.innerHTML = `<table>
      <thead><tr><th>ID</th><th>Name</th><th>Account</th><th>Role</th><th>Balance</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>${users
        .map(
          (u) => `<tr>
            <td>${u.id}</td>
            <td>${escapeHtml(u.name)}<div class="tx-sub">${escapeHtml(u.email || "")}</div></td>
            <td><code>${escapeHtml(u.accNo || "-")}</code></td>
            <td>${escapeHtml(u.role)}</td>
            <td>${u.balance === null ? "-" : formatMoney(u.balance, u.currency)}</td>
            <td><span class="tag ${u.status}">${escapeHtml(u.status)}</span></td>
            <td class="actions">
              ${u.status === "active"
                ? `<button class="btn small" data-status="${u.id}" data-value="frozen">Freeze</button>`
                : `<button class="btn small success" data-status="${u.id}" data-value="active">Activate</button>`}
            </td>
          </tr>`
        )
        .join("")}</tbody></table>`;
  } catch (err) {
    container.innerHTML = `<div class="empty">${escapeHtml(err.message)}</div>`;
  }
}

async function loadAdminTransactions() {
  const container = $("#admin-tx");
  container.innerHTML = `<div class="empty">Loading...</div>`;
  try {
    const { transactions } = await api("/admin/transactions?limit=100");
    container.innerHTML = transactionsTable(transactions, "USD", true);
  } catch (err) {
    container.innerHTML = `<div class="empty">${escapeHtml(err.message)}</div>`;
  }
}

/* ---------------- Wiring ---------------- */

document.addEventListener("DOMContentLoaded", () => {
  // Auth tabs
  $$(".tab").forEach((tab) =>
    tab.addEventListener("click", () => {
      $$(".tab").forEach((t) => t.classList.toggle("active", t === tab));
      const isLogin = tab.dataset.authTab === "login";
      $("#login-form").classList.toggle("hidden", !isLogin);
      $("#register-form").classList.toggle("hidden", isLogin);
    })
  );

  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const button = e.submitter || e.target.querySelector("button");
    const f = e.target;
    try {
      setButtonLoading(button, true);
      await handleLogin(f.name.value.trim(), f.password.value, f.role.value);
      toast("Welcome back!", "success", "Signed in");
    } catch (err) {
      toast(err.message, "error", "Sign in failed");
    } finally {
      setButtonLoading(button, false);
    }
  });

  $("#register-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const button = e.submitter || e.target.querySelector("button");
    const f = e.target;
    try {
      setButtonLoading(button, true);
      await api("/user/register", {
        method: "POST",
        auth: false,
        body: {
          name: f.name.value.trim(),
          password: f.password.value,
          role: f.role.value,
          email: f.email.value.trim() || undefined,
          phone: f.phone.value.trim() || undefined,
          pin: f.pin.value.trim() || undefined,
        },
      });
      toast("Account created. Signing you in...", "success");
      await handleLogin(f.name.value.trim(), f.password.value, f.role.value);
    } catch (err) {
      toast(err.message, "error", "Registration failed");
    } finally {
      setButtonLoading(button, false);
    }
  });

  // Navigation
  $$(".nav-item").forEach((btn) => btn.addEventListener("click", () => setView(btn.dataset.view)));
  $$("[data-goto]").forEach((btn) => btn.addEventListener("click", () => setView(btn.dataset.goto)));
  $("#logout-btn").addEventListener("click", () => handleLogout(false));

  // Forms
  $("#transfer-form").addEventListener("submit", submitTransfer);
  $("#paystack-test-transfer-form").addEventListener("submit", submitPaystackTestTransfer);
  $("#paystack-otp-form").addEventListener("submit", submitPaystackOtp);
  $("#deposit-form").addEventListener("submit", (e) => submitCash(e, "deposit"));
  $("#withdraw-form").addEventListener("submit", (e) => submitCash(e, "withdraw"));
  $("#beneficiary-form").addEventListener("submit", submitBeneficiary);
  $("#profile-form").addEventListener("submit", submitProfile);
  $("#password-form").addEventListener("submit", submitPassword);
  $("#pin-create-form").addEventListener("submit", (e) => submitPin(e, false));
  $("#pin-update-form").addEventListener("submit", (e) => submitPin(e, true));
  $("#admin-adjust-form").addEventListener("submit", submitAdminAdjust);

  setupAccountLookup("transfer-acc", "transfer-lookup");
  setupAccountLookup("ben-acc", "ben-lookup");

  $("#transfer-beneficiary").addEventListener("change", (e) => {
    if (e.target.value) {
      const accInput = $("#transfer-acc");
      accInput.value = e.target.value;
      accInput.dispatchEvent(new Event("input"));
    }
  });

  // Transactions
  $("#tx-refresh").addEventListener("click", loadTransactions);
  $("#tx-apply").addEventListener("click", loadTransactions);
  $("#tx-type").addEventListener("change", loadTransactions);
  $("#tx-direction").addEventListener("change", loadTransactions);

  // Admin
  $("#admin-users-refresh").addEventListener("click", loadAdminUsers);
  $("#admin-tx-refresh").addEventListener("click", loadAdminTransactions);

  // Delegated actions
  document.addEventListener("click", async (e) => {
    const removeBen = e.target.closest("[data-remove-beneficiary]");
    if (removeBen) {
      try {
        await api(`/user/beneficiaries/${removeBen.dataset.removeBeneficiary}`, { method: "DELETE" });
        toast("Beneficiary removed", "success");
        loadBeneficiaries();
        loadBeneficiaryOptions();
      } catch (err) {
        toast(err.message, "error", "Could not remove");
      }
    }

    const statusBtn = e.target.closest("[data-status]");
    if (statusBtn) {
      try {
        const data = await api(`/admin/users/${statusBtn.dataset.status}/status`, {
          method: "PUT",
          body: { status: statusBtn.dataset.value },
        });
        toast(data.message, "success");
        loadAdminUsers();
      } catch (err) {
        toast(err.message, "error", "Could not update status");
      }
    }
  });

  // Boot
  if (state.token) {
    loadSession().catch(() => handleLogout(true));
  } else {
    showAuth();
  }
});
