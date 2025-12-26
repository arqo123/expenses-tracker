-- Idempotency table (replaces NocoDB DLQ)
CREATE TABLE IF NOT EXISTS idempotency (
    id SERIAL PRIMARY KEY,
    message_id VARCHAR(50) NOT NULL,
    chat_id VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_message_chat UNIQUE (message_id, chat_id)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_created ON idempotency(created_at);

-- Function to cleanup old records (5 min TTL)
CREATE OR REPLACE FUNCTION cleanup_idempotency()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM idempotency
    WHERE created_at < NOW() - INTERVAL '5 minutes';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
