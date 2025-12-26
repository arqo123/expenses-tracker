-- Merchants table (learned patterns)
CREATE TABLE IF NOT EXISTS merchants (
    id SERIAL PRIMARY KEY,
    skrot VARCHAR(100) NOT NULL UNIQUE,
    pelna_nazwa VARCHAR(255) NOT NULL,
    domyslna_kategoria VARCHAR(50) NOT NULL,
    learned_from VARCHAR(50) DEFAULT 'preset',
    correction_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchants_skrot ON merchants(skrot);
CREATE INDEX IF NOT EXISTS idx_merchants_kategoria ON merchants(domyslna_kategoria);

-- Seed preset merchants
INSERT INTO merchants (skrot, pelna_nazwa, domyslna_kategoria, learned_from) VALUES
    ('biedra', 'Biedronka', 'Zakupy spozywcze', 'preset'),
    ('biedronka', 'Biedronka', 'Zakupy spozywcze', 'preset'),
    ('lidl', 'Lidl', 'Zakupy spozywcze', 'preset'),
    ('zabka', 'Zabka', 'Zakupy spozywcze', 'preset'),
    ('zara', 'Zara', 'Ubrania', 'preset'),
    ('orlen', 'Orlen', 'Paliwo', 'preset'),
    ('bp', 'BP', 'Paliwo', 'preset'),
    ('shell', 'Shell', 'Paliwo', 'preset'),
    ('spotify', 'Spotify', 'Subskrypcje', 'preset'),
    ('netflix', 'Netflix', 'Subskrypcje', 'preset'),
    ('hbo', 'HBO Max', 'Subskrypcje', 'preset'),
    ('uber', 'Uber', 'Transport', 'preset'),
    ('bolt', 'Bolt', 'Transport', 'preset'),
    ('allegro', 'Allegro', 'Zakupy spozywcze', 'preset'),
    ('amazon', 'Amazon', 'Zakupy spozywcze', 'preset'),
    ('rossmann', 'Rossmann', 'Uroda', 'preset'),
    ('hebe', 'Hebe', 'Uroda', 'preset'),
    ('apteka', 'Apteka', 'Zdrowie', 'preset'),
    ('mcdonalds', 'McDonalds', 'Restauracje', 'preset'),
    ('kfc', 'KFC', 'Restauracje', 'preset'),
    ('starbucks', 'Starbucks', 'Kawiarnie', 'preset'),
    ('costa', 'Costa Coffee', 'Kawiarnie', 'preset'),
    ('ikea', 'IKEA', 'Dom', 'preset'),
    ('leroy', 'Leroy Merlin', 'Dom', 'preset'),
    ('castorama', 'Castorama', 'Dom', 'preset'),
    ('media', 'Media Expert', 'Elektronika', 'preset'),
    ('rtv', 'RTV Euro AGD', 'Elektronika', 'preset'),
    ('decathlon', 'Decathlon', 'Sport', 'preset'),
    ('empik', 'Empik', 'Rozrywka', 'preset'),
    ('cinema', 'Cinema City', 'Rozrywka', 'preset'),
    ('multikino', 'Multikino', 'Rozrywka', 'preset'),
    ('xtb', 'XTB', 'Inwestycje', 'preset'),
    ('revolut', 'Revolut', 'Przelewy', 'preset'),
    ('pyszne', 'Pyszne.pl', 'Delivery', 'preset'),
    ('glovo', 'Glovo', 'Delivery', 'preset'),
    ('wolt', 'Wolt', 'Delivery', 'preset'),
    ('ubereats', 'Uber Eats', 'Delivery', 'preset')
ON CONFLICT (skrot) DO NOTHING;
