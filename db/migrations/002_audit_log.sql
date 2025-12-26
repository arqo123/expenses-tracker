-- Audit log table
CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    akcja VARCHAR(50) NOT NULL,
    szczegoly JSONB,
    user_id VARCHAR(50),
    expense_id VARCHAR(50)
);

CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_akcja ON audit_log(akcja);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
