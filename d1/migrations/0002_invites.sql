-- Invites: sign-up needs one. Only the SHA-256 of each token is stored; the
-- link is shown once, to the admin who made it.

CREATE TABLE invites (
  id TEXT PRIMARY KEY NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  -- When set, only this email can sign up with it.
  email TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  used_by TEXT REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX invites_created_idx ON invites (created_at);
