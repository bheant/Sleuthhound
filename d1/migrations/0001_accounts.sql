-- Accounts: identity and sign-in only. No business data, API keys or files
-- are ever stored here. The wrapped keys are the data key sealed by the
-- user's vault key and recovery code in their browser; the server can't open
-- either.

CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  company TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  disabled INTEGER NOT NULL DEFAULT 0,
  -- SHA-256 of salt and the auth key the browser derives. Null after an
  -- admin reset, until the user sets a new password with the reset link.
  auth_salt TEXT,
  auth_hash TEXT,
  wrapped_by_password TEXT,
  wrapped_by_recovery TEXT NOT NULL,
  -- SHA-256 of a one-time reset token, and when it stops working.
  reset_token_hash TEXT UNIQUE,
  reset_expires_at TEXT,
  created_at TEXT NOT NULL,
  last_seen_at TEXT
);

CREATE TABLE logins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  at TEXT NOT NULL,
  country TEXT
);
CREATE INDEX logins_user_idx ON logins (user_id, at);

-- The id is the SHA-256 of the random token in the cookie, so a copy of the
-- database can't be used to sign in.
CREATE TABLE sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

-- Attempts per hashed IP address or email, in fixed windows.
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY NOT NULL,
  count INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
