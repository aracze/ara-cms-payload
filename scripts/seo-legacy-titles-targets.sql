-- Titulky turistických cílů po starém webu → šablona (rozhodnutí uživatele 4. 9. 2026).
-- Vynuluje meta_title u publikovaných cílů, kde je legacy titulek „X: Cestovní průvodce Y"
-- rozbitý (bez města), delší než 60 znaků včetně „ • Ara.cz", nebo má město nesklonované
-- (nominativ, přitom místo má vyplněný 6. pád, který se liší). Web pak použije šablonu
-- ze `src/lib/seo-templates.ts`. Místa a správně skloněné titulky se nemění.
-- Idempotentní; původní hodnoty ukládá do zaloha.pages_meta_title_2026_09_04.
-- Spuštění (dev):  docker compose exec -T postgres psql -U postgres -d aracze < scripts/seo-legacy-titles-targets.sql
-- Prod: stejně proti produkční DB (služba `postgres`), potom `docker compose up -d --force-recreate cms` (cache).
BEGIN;
CREATE SCHEMA IF NOT EXISTS zaloha;
CREATE TEMP TABLE t AS
WITH RECURSIVE up AS (
  SELECT p.id root, p.id cur, p.parent_id, p.category, p.title, p.detail_locative, 0 d
  FROM pages p WHERE p._status = 'published' AND p.category = 'Turistický cíl'
  UNION ALL
  SELECT up.root, q.id, q.parent_id, q.category, q.title, q.detail_locative, up.d + 1
  FROM up JOIN pages q ON q.id = up.parent_id
  WHERE up.category <> 'Místo k navštívení' AND up.d < 8
)
SELECT DISTINCT ON (root) root, title place_title, COALESCE(detail_locative, '') place_loc
FROM up WHERE category = 'Místo k navštívení' ORDER BY root, d;

CREATE TEMP TABLE l AS
SELECT p.id, p.meta_title,
  regexp_replace(regexp_replace(p.meta_title,
    '(\s*[•|–—-]\s*(cestovní\s+(průvodce|inspirace)\s+)?|\s+cestovní\s+(průvodce|inspirace)\s+|\s*•\s*v)Ara\.cz\s*$', '', 'i'),
    '[\s:•|–—-]+$', '') bare,
  t.place_title, t.place_loc,
  (p.meta_title ~ ': Cestovní průvodce\s*(•\s*Ara\.cz)?\s*$') broken
FROM pages p LEFT JOIN t ON t.root = p.id
WHERE p._status = 'published' AND p.category = 'Turistický cíl'
  AND p.meta_title ~ '(: Cestovní průvodce|: cestovní průvodce| - cestovní průvodce)';
ALTER TABLE l ADD COLUMN tail text, ADD COLUMN duvod text;
UPDATE l SET tail = trim(regexp_replace(bare, '^.*Cestovní průvodce\s*', '', 'i'));
UPDATE l SET duvod = CASE
  WHEN broken THEN 'rozbity'
  WHEN length(bare) + 9 > 60 THEN 'dlouhy'
  WHEN tail = place_title AND place_loc <> ''
       AND lower(place_loc) IN (lower('v ' || place_title), lower('ve ' || place_title), lower('na ' || place_title)) THEN NULL -- nesklonné město, OK
  WHEN tail = place_title THEN 'nesklonovano'
  ELSE NULL END;

CREATE TABLE IF NOT EXISTS zaloha.pages_meta_title_2026_09_04 AS
  SELECT id, meta_title, duvod, now() AS zalohovano FROM l WHERE false;
INSERT INTO zaloha.pages_meta_title_2026_09_04 (id, meta_title, duvod, zalohovano)
  SELECT id, meta_title, duvod, now() FROM l WHERE duvod IS NOT NULL;

UPDATE pages SET meta_title = NULL WHERE id IN (SELECT id FROM l WHERE duvod IS NOT NULL);
UPDATE _pages_v SET version_meta_title = NULL
  WHERE latest AND parent_id IN (SELECT id FROM l WHERE duvod IS NOT NULL);

SELECT duvod, count(*) FROM l WHERE duvod IS NOT NULL GROUP BY duvod ORDER BY duvod;
COMMIT;
