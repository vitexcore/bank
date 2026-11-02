# Bank Backy

A small full-stack banking app with an Express API backed by **PostgreSQL** and a
vanilla JS single-page frontend. The API and frontend live in separate folders.

## Features

**Accounts & auth**
- Register / login with JWT sessions (bcrypt-hashed passwords)
- Account number derived from an 11-digit phone number (phone minus first digit)
- Live account-number lookup that reveals the matching account holder
- Roles: `user` and `admin`
- Account status: `active`, `frozen`, `closed`
- Profile: update email / phone, change password
- Transaction PIN (bcrypt-hashed): create, update, used to authorise transfers

**Money movement**
- Deposit, withdraw, and transfer between accounts
- Atomic transfers using SQL transactions and row locks (ACID safe)
- Insufficient-funds and self-transfer protection

**Ledger & banking extras**
- Full transaction history (per account and, for admins, globally)
- Every money movement records a double-entry ledger row (debit + credit)
- Filters by type, direction, and date range
- Saved beneficiaries (payees) with nicknames
- Formatted balances, money-in / money-out summary

**Admin**
- List all customers with balances and status
- Freeze / activate / close accounts
- Credit or debit any account
- View all transactions across the bank

## Database (PostgreSQL)

Schema lives in `backend/src/db/schema.sql` (tables: `users`, `accounts`,
`transactions`, `beneficiaries` with foreign keys, unique constraints and
indexes).

## Getting started

The project has two folders: `backend/` contains the API, database code, and
private environment settings; `frontend/` contains the browser app.

1. Install backend dependencies:
   ```
   cd backend && npm install
   ```
2. Make sure PostgreSQL is running and create the database:
   ```
   createdb bank_backy
   ```
   (or `CREATE DATABASE bank_backy;` in psql)
3. From the project root, open `backend/.env` and set `DATABASE_URL` / `JWT_SECRET`. Put the Paystack key on the `PAYSTACK_SECRET_KEY=` line in **`backend/.env`**. Use the test secret key that starts with `sk_test_`; live keys are rejected. Never put the secret key in `frontend/`.
4. Create tables and seed demo data:
   ```
   cd backend && npm run db:setup
   ```
5. Start the API:
   ```
   cd backend && npm run dev      # or: npm start
   ```
6. In another terminal opened at the project root, serve the frontend:
   ```
   python3 -m http.server 5500 --directory frontend
   ```
7. Open http://localhost:5500. The frontend API address is configured in
   `frontend/config.js` (default: `http://localhost:5700`).

> Registration requires an **11-digit phone number**. The account number is the
> phone number without its first digit (e.g. `08012345678` &rarr; `8012345678`).
> The seeded demo users are for local testing only - change or remove them
> before deploying.

## Scripts

Run these commands from `backend/`.

| Command            | Description                        |
| ------------------ | ---------------------------------- |
| `npm start`        | Run the API                        |
| `npm run dev`      | Run with file watching             |
| `npm run db:migrate` | Apply `src/db/schema.sql`         |
| `npm run db:seed`  | Seed demo users & history          |
| `npm run db:setup` | Migrate + seed                     |
| `npm test`         | Integration tests (needs the DB up) |

## API reference

All protected routes need `Authorization: Bearer <token>`.

### Auth & account
| Method | Path | Body / notes |
| --- | --- | --- |
| POST | `/user/register` | `{ name, phone (11 digits), password, role?, email?, pin? }` |
| POST | `/user/login` | `{ name, password, role? }` → `token` |
| GET | `/user/me` | current user + account |
| GET | `/user/balance` | balance summary |
| GET | `/user/lookup?accNo=` | resolve account number → account holder name |
| PUT | `/user/profile` | `{ email?, phone? }` |
| PUT | `/user/password` | `{ currentPassword, newPassword }` |
| POST | `/user/pin` | `{ pin }` |
| PUT | `/user/pin` | `{ currentPin, pin }` |

### Money
| Method | Path | Body |
| --- | --- | --- |
| POST | `/user/deposit` | `{ amount, description? }` |
| POST | `/user/withdraw` | `{ amount, description? }` |
| POST | `/user/transfer` | `{ receiverAccNo | receiverName, amount, pin, description? }` |
| GET | `/user/paystack/banks` | List Nigerian banks for test payouts |
| POST | `/user/paystack/test-transfer` | `{ accountName, accountNumber, bankCode, amount, reason? }` (NGN, Paystack test mode only) |
| POST | `/user/paystack/test-transfer/finalize` | `{ transferCode, otp }` (only when Paystack requests OTP) |
| GET | `/user/transactions` | query: `limit, type, direction, from, to` |

### Beneficiaries
| Method | Path | Body |
| --- | --- | --- |
| GET | `/user/beneficiaries` | - |
| POST | `/user/beneficiaries` | `{ accNo, nickname? }` |
| DELETE | `/user/beneficiaries/:id` | - |

### Admin (role: admin)
| Method | Path | Body |
| --- | --- | --- |
| GET | `/admin/users` | - |
| PUT | `/admin/users/:id/status` | `{ status }` |
| GET | `/admin/transactions` | query: `limit` |
| POST | `/admin/adjust` | `{ accNo, amount, direction: credit|debit, description? }` |
| POST | `/admin/transfer` | `{ receiverAccNo | receiverName, amount }` (credit-only) |
| GET | `/role/admin` | admin-only check |
| GET | `/role/user` | any authenticated user |
| GET | `/users` | list users |

Every route is also available under an `/api` prefix (e.g. `/api/user/login`).

## Notes for later deployment

- To host the frontend separately, set `window.BANK_API_BASE` in
  `frontend/config.js` to the deployed backend URL.
- Configure backend secrets such as `DATABASE_URL`, `JWT_SECRET`, and
  `PAYSTACK_SECRET_KEY` only in the backend host's environment settings.
- On Render set `DATABASE_URL` (hosted Postgres) and `PGSSL=true` for the backend.
