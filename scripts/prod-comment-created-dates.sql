-- Sjednocení data komentářů: created_at přebírá datum vložení z commented_at
-- a duplicitní sloupec se ruší (viz PR — komentáře nemají redakční důvod pro
-- vlastní datum; stejný model jako u stránek). Idempotentní; spustit JEDNOU
-- (ON_ERROR_STOP: při chybě skončit s nenulovým kódem, ne tiše pokračovat):
--   docker compose exec -T postgres psql -U postgres -d aracze \
--     -v ON_ERROR_STOP=1 < tento-soubor
BEGIN;
UPDATE comments SET created_at = commented_at
  WHERE commented_at IS NOT NULL AND created_at IS DISTINCT FROM commented_at;
ALTER TABLE comments DROP COLUMN IF EXISTS commented_at;
COMMIT;
