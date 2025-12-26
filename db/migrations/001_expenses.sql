-- Expenses table (main storage)
CREATE TABLE IF NOT EXISTS expenses (
    id SERIAL PRIMARY KEY,
    title VARCHAR(50) NOT NULL UNIQUE,
    data DATE NOT NULL,
    kwota DECIMAL(12, 2) NOT NULL,
    waluta VARCHAR(3) DEFAULT 'PLN',
    kategoria VARCHAR(50) NOT NULL,
    sprzedawca VARCHAR(255) NOT NULL,
    user_name VARCHAR(50) NOT NULL,
    opis TEXT DEFAULT '',
    zrodlo VARCHAR(50) NOT NULL,
    raw_input TEXT DEFAULT '',
    status VARCHAR(20) DEFAULT 'active',
    hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT unique_hash UNIQUE (hash)
);

CREATE INDEX IF NOT EXISTS idx_expenses_user ON expenses(user_name);
CREATE INDEX IF NOT EXISTS idx_expenses_data ON expenses(data);
CREATE INDEX IF NOT EXISTS idx_expenses_kategoria ON expenses(kategoria);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status);
CREATE INDEX IF NOT EXISTS idx_expenses_hash ON expenses(hash);
CREATE INDEX IF NOT EXISTS idx_expenses_created_at ON expenses(created_at);
