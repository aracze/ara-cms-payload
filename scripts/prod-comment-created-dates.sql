-- Sjednocení data komentářů: created_at přebírá datum vložení z commented_at
-- a duplicitní sloupec se ruší (viz PR — komentáře nemají redakční důvod pro
-- vlastní datum; stejný model jako u stránek). Idempotentní; spustit
-- (ON_ERROR_STOP: při chybě skončit s nenulovým kódem, ne tiše pokračovat):
--   docker compose exec -T postgres psql -U postgres -d aracze \
--     -v ON_ERROR_STOP=1 < tento-soubor
BEGIN;
-- Celý krok běží jen dokud sloupec existuje — po prvním průchodu se přeskočí
-- (holý UPDATE by na smazaném sloupci spadl už při parsování a „idempotence"
-- by byla jen na papíře).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'comments'::regclass
      AND attname = 'commented_at'
      AND NOT attisdropped
  ) THEN
    UPDATE comments SET created_at = commented_at
      WHERE commented_at IS NOT NULL AND created_at IS DISTINCT FROM commented_at;
    ALTER TABLE comments DROP COLUMN commented_at;
  END IF;
END $$;
COMMIT;
