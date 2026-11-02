-- Bank Backy database schema

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(64)  NOT NULL,
  email         VARCHAR(120),
  phone         VARCHAR(20)  NOT NULL,
  password_hash TEXT         NOT NULL,
  role          VARCHAR(10)  NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  status        VARCHAR(10)  NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'frozen', 'closed')),
  pin_hash      TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT users_name_role_unique UNIQUE (name, role),
  CONSTRAINT users_phone_unique UNIQUE (phone)
);

CREATE TABLE IF NOT EXISTS accounts (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  acc_no     VARCHAR(12) NOT NULL UNIQUE,
  type       VARCHAR(12) NOT NULL DEFAULT 'savings' CHECK (type IN ('savings', 'current')),
  balance    NUMERIC(14, 2) NOT NULL DEFAULT 1000.00 CHECK (balance >= 0),
  currency   VARCHAR(3) NOT NULL DEFAULT 'USD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);

CREATE TABLE IF NOT EXISTS transactions (
  id                      SERIAL PRIMARY KEY,
  account_id              INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  type                    VARCHAR(20) NOT NULL,
  direction               VARCHAR(6)  NOT NULL CHECK (direction IN ('credit', 'debit')),
  amount                  NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  balance_after           NUMERIC(14, 2) NOT NULL,
  counterparty_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  counterparty_name       VARCHAR(64),
  reference               VARCHAR(48) NOT NULL UNIQUE,
  description             TEXT,
  status                  VARCHAR(12) NOT NULL DEFAULT 'completed',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);

CREATE TABLE IF NOT EXISTS beneficiaries (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  nickname   VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT beneficiaries_unique UNIQUE (user_id, account_id)
);
