PRAGMA foreign_keys = ON;

-- KAWVO TRACE V1 · Invitaciones seguras de equipo
-- El enlace usa un token opaco de un solo uso; solo se persiste su hash.
-- El código de verificación también se persiste únicamente como hash.

ALTER TABLE trace_project_team_invitations
ADD COLUMN phone_e164 TEXT;

ALTER TABLE trace_project_team_invitations
ADD COLUMN expires_at TEXT;

CREATE TABLE IF NOT EXISTS trace_project_team_invitation_claims (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  invitation_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  verification_channel TEXT NOT NULL DEFAULT 'manual'
    CHECK(verification_channel IN ('manual','email','whatsapp','sms')),
  phone_e164 TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','verified','consumed','revoked','expired','blocked')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK(max_attempts > 0),
  expires_at TEXT NOT NULL,
  verified_at TEXT,
  consumed_at TEXT,
  revoked_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (tenant_id) REFERENCES users(id),
  FOREIGN KEY (project_id) REFERENCES trace_assets(id) ON DELETE CASCADE,
  FOREIGN KEY (invitation_id) REFERENCES trace_project_team_invitations(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id),
  UNIQUE(invitation_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_trace_team_invite_claim_token
  ON trace_project_team_invitation_claims(token_hash);

CREATE INDEX IF NOT EXISTS idx_trace_team_invite_claim_project
  ON trace_project_team_invitation_claims(tenant_id, project_id, status, expires_at);

CREATE INDEX IF NOT EXISTS idx_trace_team_invite_claim_expiry
  ON trace_project_team_invitation_claims(status, expires_at);
