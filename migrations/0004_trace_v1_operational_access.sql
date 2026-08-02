-- INTAP Trace V1
-- Identidad, OTP, recuperación, sesiones y acceso operativo de emergencia.
-- Esta migración amplía la autenticación existente sin sustituir
-- el login actual por correo y contraseña.

ALTER TABLE users
ADD COLUMN phone_e164 TEXT;

ALTER TABLE users
ADD COLUMN phone_verified_at TEXT;

ALTER TABLE users
ADD COLUMN email_verified_at TEXT;

ALTER TABLE users
ADD COLUMN identity_last4_hash TEXT;

ALTER TABLE users
ADD COLUMN identity_last4_configured_at TEXT;

ALTER TABLE users
ADD COLUMN operational_access_enabled INTEGER NOT NULL DEFAULT 1
  CHECK(operational_access_enabled IN (0, 1));

ALTER TABLE users
ADD COLUMN credentials_support_required INTEGER NOT NULL DEFAULT 0
  CHECK(credentials_support_required IN (0, 1));


CREATE UNIQUE INDEX idx_users_phone_e164_unique
ON users(phone_e164)
WHERE phone_e164 IS NOT NULL
  AND trim(phone_e164) <> '';


CREATE TABLE trace_auth_challenges (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT,
  purpose TEXT NOT NULL
    CHECK(purpose IN (
      'login',
      'password_reset',
      'channel_verification',
      'emergency_access'
    )),
  channel TEXT NOT NULL
    CHECK(channel IN (
      'email',
      'whatsapp',
      'sms',
      'security_questions',
      'emergency_identity'
    )),
  destination_hash TEXT,
  destination_hint TEXT,
  code_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN (
      'pending',
      'verified',
      'consumed',
      'expired',
      'blocked',
      'cancelled'
    )),
  attempt_count INTEGER NOT NULL DEFAULT 0
    CHECK(attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 5
    CHECK(max_attempts > 0),
  request_ip_hash TEXT,
  request_device_hash TEXT,
  request_user_agent TEXT,
  project_id TEXT,
  execution_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  expires_at TEXT NOT NULL,
  verified_at TEXT,
  consumed_at TEXT,
  blocked_until TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (tenant_id)
    REFERENCES users(id),

  FOREIGN KEY (user_id)
    REFERENCES users(id),

  FOREIGN KEY (project_id)
    REFERENCES trace_projects(id),

  FOREIGN KEY (execution_id)
    REFERENCES trace_executions(id)
);


CREATE INDEX idx_trace_auth_challenges_tenant
ON trace_auth_challenges(
  tenant_id,
  created_at
);


CREATE INDEX idx_trace_auth_challenges_user
ON trace_auth_challenges(
  user_id,
  purpose,
  status
);


CREATE INDEX idx_trace_auth_challenges_expiry
ON trace_auth_challenges(
  status,
  expires_at
);


CREATE TABLE trace_auth_sessions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  session_type TEXT NOT NULL
    CHECK(session_type IN (
      'standard',
      'operational',
      'emergency'
    )),
  authentication_method TEXT NOT NULL
    CHECK(authentication_method IN (
      'password',
      'email_otp',
      'whatsapp_otp',
      'sms_otp',
      'security_questions',
      'emergency_identity'
    )),
  challenge_id TEXT,
  project_id TEXT,
  execution_id TEXT,
  permissions_json TEXT NOT NULL DEFAULT '{}',
  session_token_hash TEXT NOT NULL,
  refresh_token_hash TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN (
      'active',
      'expired',
      'revoked',
      'completed'
    )),
  emergency_reason TEXT,
  support_ticket_id TEXT,
  request_ip_hash TEXT,
  request_device_hash TEXT,
  request_user_agent TEXT,
  last_activity_at TEXT,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  revoked_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (tenant_id)
    REFERENCES users(id),

  FOREIGN KEY (user_id)
    REFERENCES users(id),

  FOREIGN KEY (challenge_id)
    REFERENCES trace_auth_challenges(id),

  FOREIGN KEY (project_id)
    REFERENCES trace_projects(id),

  FOREIGN KEY (execution_id)
    REFERENCES trace_executions(id),

  FOREIGN KEY (revoked_by)
    REFERENCES users(id)
);


CREATE UNIQUE INDEX idx_trace_auth_sessions_token
ON trace_auth_sessions(session_token_hash);


CREATE INDEX idx_trace_auth_sessions_user_active
ON trace_auth_sessions(
  user_id,
  status,
  expires_at
);


CREATE INDEX idx_trace_auth_sessions_execution
ON trace_auth_sessions(
  execution_id,
  status
);


CREATE TABLE trace_security_questions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  question_code TEXT NOT NULL,
  question_prompt TEXT NOT NULL,
  answer_hash TEXT NOT NULL,
  position INTEGER NOT NULL
    CHECK(position BETWEEN 1 AND 3),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN (
      'active',
      'inactive',
      'revoked'
    )),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE,

  FOREIGN KEY (tenant_id)
    REFERENCES users(id),

  UNIQUE(user_id, position)
);


CREATE INDEX idx_trace_security_questions_user
ON trace_security_questions(
  user_id,
  status
);


CREATE TABLE trace_emergency_access_attempts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT,
  phone_hash TEXT NOT NULL,
  identity_last4_hash TEXT,
  selected_project_id TEXT,
  expected_project_id TEXT,
  result TEXT NOT NULL
    CHECK(result IN (
      'approved',
      'denied',
      'blocked',
      'expired'
    )),
  failure_reason TEXT,
  request_ip_hash TEXT,
  request_device_hash TEXT,
  request_user_agent TEXT,
  session_id TEXT,
  support_required INTEGER NOT NULL DEFAULT 1
    CHECK(support_required IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (tenant_id)
    REFERENCES users(id),

  FOREIGN KEY (user_id)
    REFERENCES users(id),

  FOREIGN KEY (selected_project_id)
    REFERENCES trace_projects(id),

  FOREIGN KEY (expected_project_id)
    REFERENCES trace_projects(id),

  FOREIGN KEY (session_id)
    REFERENCES trace_auth_sessions(id)
);


CREATE INDEX idx_trace_emergency_attempts_phone
ON trace_emergency_access_attempts(
  phone_hash,
  created_at
);


CREATE INDEX idx_trace_emergency_attempts_user
ON trace_emergency_access_attempts(
  user_id,
  result,
  created_at
);


CREATE TABLE trace_auth_rate_limits (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  scope_type TEXT NOT NULL
    CHECK(scope_type IN (
      'email',
      'phone',
      'ip',
      'device',
      'user',
      'project'
    )),
  scope_hash TEXT NOT NULL,
  action_type TEXT NOT NULL
    CHECK(action_type IN (
      'login',
      'request_otp',
      'verify_otp',
      'password_reset',
      'emergency_access'
    )),
  attempt_count INTEGER NOT NULL DEFAULT 0
    CHECK(attempt_count >= 0),
  window_started_at TEXT NOT NULL,
  blocked_until TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (tenant_id)
    REFERENCES users(id),

  UNIQUE(
    tenant_id,
    scope_type,
    scope_hash,
    action_type
  )
);


CREATE INDEX idx_trace_auth_rate_limits_blocked
ON trace_auth_rate_limits(
  blocked_until,
  action_type
);


CREATE TABLE trace_auth_audit_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT,
  session_id TEXT,
  challenge_id TEXT,
  event_type TEXT NOT NULL,
  result TEXT NOT NULL
    CHECK(result IN (
      'success',
      'failure',
      'blocked',
      'expired',
      'revoked'
    )),
  project_id TEXT,
  execution_id TEXT,
  request_ip_hash TEXT,
  request_device_hash TEXT,
  request_user_agent TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (tenant_id)
    REFERENCES users(id),

  FOREIGN KEY (user_id)
    REFERENCES users(id),

  FOREIGN KEY (session_id)
    REFERENCES trace_auth_sessions(id),

  FOREIGN KEY (challenge_id)
    REFERENCES trace_auth_challenges(id),

  FOREIGN KEY (project_id)
    REFERENCES trace_projects(id),

  FOREIGN KEY (execution_id)
    REFERENCES trace_executions(id)
);


CREATE INDEX idx_trace_auth_audit_tenant
ON trace_auth_audit_log(
  tenant_id,
  created_at
);


CREATE INDEX idx_trace_auth_audit_user
ON trace_auth_audit_log(
  user_id,
  event_type,
  created_at
);
