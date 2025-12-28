# Propozycje ulepszeń - Expense Tracker Bot

*Analiza z perspektywy codziennego użytkownika*

---

## Co aplikacja już robi świetnie

- Wielokanałowe dodawanie wydatków (tekst, głos, zdjęcia paragonów, import CSV)
- OCR paragonów z AI kategoryzacją i proporcjonalną korektą cen
- Lista zakupów z inteligentnymi sugestiami (przeterminowane, popularne, korelacje koszyka)
- Rozbudowane statystyki (raporty czasowe, kategorie, sklepy, porównanie użytkowników, trendy)
- Uczenie się kategorii z korekt użytkownika
- Obsługa wielu użytkowników (budżet domowy)

---

## 🔥 Quick Wins (wysoki wpływ, niski nakład)

### 1. Tygodniowe podsumowanie (automatyczne)

**Problem:** Muszę sam sprawdzać statystyki. Brak proaktywnych podsumowań.

**Rozwiązanie:** Zaimplementować TODO w `src/index.ts` - niedzielne podsumowanie o 21:00:
> "Ten tydzień: 1,234 zł | Najwięcej: Restauracje (400 zł) | vs ubiegły tydzień: +15%"

**Wpływ:** WYSOKI | **Nakład:** NISKI (cron już istnieje w kodzie!)

---

### 2. Szybkie dodawanie do listy zakupów

**Problem:** Dodaję te same produkty co tydzień. Wielokrotne pisanie "mleko, chleb, jajka".

**Rozwiązanie:** W menu listy zakupów przyciski dla top 10 produktów:
```
📋 Najczęściej kupowane:
[🥛 Mleko] [🍞 Chleb] [🥚 Jajka] [🧈 Masło]
```
Jedno kliknięcie = produkt na liście.

**Wpływ:** WYSOKI | **Nakład:** NISKI

---

### 3. Przypomnienie "Kończą się"

**Problem:** Zapominam kupić papier toaletowy, bo nie wiedziałem, że się kończy.

**Rozwiązanie:** Na podstawie `avg_interval_days` w `shopping_stats`:
> "🔔 Papier toaletowy - ostatni zakup 20 dni temu (zwykle kupujesz co 21 dni). Dodać do listy?"

**Wpływ:** WYSOKI | **Nakład:** NISKI (dane już są w bazie!)

---

### 4. Eksport do CSV/Excel

**Problem:** Chcę przeanalizować dane w arkuszu. Brak eksportu.

**Rozwiązanie:**
- `/eksport` - eksportuje bieżący miesiąc
- `/eksport 2024-12` - eksportuje grudzień 2024
- Wysyła plik CSV jako dokument Telegram

**Wpływ:** WYSOKI | **Nakład:** NISKI

---

### 5. Skróty klawiszowe

**Problem:** Głęboka nawigacja przez menu. Za dużo kliknięć.

**Rozwiązanie:**
- `/d` lub `/dziś` - szybkie podsumowanie dnia
- `/t` lub `/tydzień` - podsumowanie tygodnia
- `/m` lub `/miesiąc` - podsumowanie miesiąca
- `/l` - lista zakupów (skrót)

**Wpływ:** WYSOKI | **Nakład:** NISKI

---

## 💡 Duże funkcje (średni nakład, transformacyjny wpływ)

### 6. Limity budżetowe na kategorie

**Problem:** Nie mam żadnych ograniczeń. Widzę ile wydałem dopiero po fakcie.

**Rozwiązanie:**
- `/budzet Restauracje 800` - ustawia limit miesięczny
- Przy dodaniu wydatku: "⚠️ Restauracje: 750/800 zł (94%)"
- W statystykach: pasek postępu dla każdej kategorii

**Wpływ:** WYSOKI | **Nakład:** ŚREDNI

**Wymaga:**
- Nowa tabela `budgets` (category, amount, period, user_name)
- Sprawdzanie przy tworzeniu wydatku
- Rozszerzenie widoku statystyk

---

### 7. Szybkie szablony wydatków

**Problem:** Codziennie kupuję kawę w tym samym miejscu za tę samą kwotę.

**Rozwiązanie:**
- `/szablon "Poranna kawa" 18 Starbucks Kawiarnie`
- W menu: przyciski szybkiego dodawania: [☕ Kawa] [🥐 Śniadanie] [🚌 Bilet]
- Jedno kliknięcie = wydatek dodany

**Wpływ:** WYSOKI | **Nakład:** ŚREDNI

**Wymaga:**
- Nowa tabela `expense_templates` (name, amount, shop, category, user)
- Klawiatura w głównym menu

---

### 8. Powiadomienia o budżecie

**Problem:** Dowiaduję się, że przekroczyłem budżet dopiero gdy sam sprawdzę.

**Rozwiązanie:**
- Alert przy 80% budżetu: "Zbliżasz się do limitu Restauracje (640/800 zł)"
- Alert przy przekroczeniu: "Przekroczono budżet Restauracje o 50 zł!"
- Alert przy nietypowym wydatku: "Dzisiejszy wydatek na Kawiarnie (300 zł) to 5x więcej niż zwykle"

**Wpływ:** WYSOKI | **Nakład:** ŚREDNI

---

### 9. Edycja starych wydatków

**Problem:** 5-minutowe okno korekty to za mało. Zauważam błąd następnego dnia.

**Rozwiązanie:** W menu: "Ostatnie 10 wydatków" → kliknij → edytuj kategorię/kwotę/sklep.

**Wpływ:** ŚREDNI | **Nakład:** NISKI

---

### 10. Wykrywanie anomalii

**Problem:** Jeśli wydam 500 zł na kawę jednego dnia, nie wiem, że to nietypowe.

**Rozwiązanie:** Automatyczne powiadomienie:
> "⚡ Niezwykły wydatek: 500 zł na Kawiarnie - to 10x więcej niż średnia dzienna!"

**Wpływ:** WYSOKI | **Nakład:** ŚREDNI

---

## 📊 Matryca priorytetów

| # | Funkcja | Wpływ | Nakład | Priorytet |
|---|---------|-------|--------|-----------|
| 1 | Tygodniowe podsumowanie | WYSOKI | NISKI | 🔥 KRYTYCZNY |
| 2 | Szybkie dodawanie produktów | WYSOKI | NISKI | 🔥 KRYTYCZNY |
| 3 | Przypomnienia "Kończą się" | WYSOKI | NISKI | 🔥 KRYTYCZNY |
| 4 | Eksport CSV | WYSOKI | NISKI | 🔥 KRYTYCZNY |
| 5 | Skróty klawiszowe | WYSOKI | NISKI | 🔥 KRYTYCZNY |
| 9 | Edycja starych wydatków | ŚREDNI | NISKI | ✅ WYSOKI |
| 6 | Limity budżetowe | WYSOKI | ŚREDNI | ✅ WYSOKI |
| 7 | Szablony wydatków | WYSOKI | ŚREDNI | ✅ WYSOKI |
| 8 | Powiadomienia budżet | WYSOKI | ŚREDNI | ⏳ ŚREDNI |
| 10 | Wykrywanie anomalii | WYSOKI | ŚREDNI | ⏳ ŚREDNI |

---

## 🎁 Dodatkowe pomysły na przyszłość

### Dla listy zakupów:
- **Udostępnianie listy przez link** - dla osób spoza gospodarstwa
- **Pamiętanie typowych ilości** - "Zwykle kupujesz 2L mleka"
- **Układy sklepów** - inna kolejność dla Biedronki vs Lidl

### Dla wydatków:
- **Obsługa dat** - "wczoraj kawa 15" (parsowanie dat względnych)
- **Kalkulator inline** - "=15.99+12.50 biedronka" = 28.49 zł
- **Dzielenie wydatków** - "200 restauracja / 4" = 50 zł
- **Wielowalutowość** - "50 eur hotel" z przeliczeniem

### Dla współpracy:
- **"Tylko moje wydatki"** w statystykach
- **Powiadomienie o dużych wydatkach** partnera
- **Oznaczenie** wydatki wspólne vs osobiste

### Dla danych:
- **Backup JSON** co tydzień
- **Historia cen produktów** (już masz avg_price!)
- **Porównanie rok do roku**

---

## 🔧 Kluczowe pliki do modyfikacji

| Plik | Co zmienić |
|------|------------|
| `src/index.ts` | Cron tygodniowego raportu (linia ~43) |
| `src/handlers/command.handler.ts` | Nowe komendy i skróty |
| `src/services/stats.service.ts` | Logika budżetów, wykrywanie anomalii |
| `src/services/database.service.ts` | Nowe tabele (budgets, templates) |
| `src/keyboards/shopping.keyboard.ts` | Przyciski szybkiego dodawania |
| `src/handlers/menu.handler.ts` | Edycja wydatków, eksport |

---

## Następne kroki

Gdy będziesz gotowy wdrożyć którąś funkcję, powiedz np.:
- "Zaimplementuj tygodniowe raporty"
- "Dodaj limity budżetowe"
- "Zrób quick wins 1-5"
- "Zacznij od przypomnienia o produktach"
