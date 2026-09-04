-- Titulky turistických cílů po starém webu → šablona (rozhodnutí uživatele 4. 9. 2026).
-- Vynuluje meta_title u publikovaných cílů, kde je legacy titulek „X: Cestovní průvodce Y"
-- rozbitý (bez města), delší než 60 znaků včetně „ • Ara.cz", nebo má město nesklonované
-- (nominativ, přitom místo má vyplněný 6. pád, který se liší). Web pak použije šablonu
-- ze `src/lib/seo-templates.ts`. Místa a správně skloněné titulky se nemění.
-- Idempotentní; původní hodnoty ukládá do zaloha.pages_meta_title_2026_09_04.
-- Běží proti živému CMS: řádky cílů drží FOR UPDATE po celou transakci a maže se jen
-- hodnota, která byla klasifikovaná (souběžná editace v adminu se nepřepíše); z verzí jen
-- poslední PUBLIKOVANÁ (rozpracovaný draft editora zůstává, historie taky).
-- Spuštění (dev):  docker compose exec -T postgres psql -U postgres -d aracze < scripts/seo-legacy-titles-targets.sql
-- Prod: stejně proti produkční DB (služba `postgres`), potom `docker compose up -d --force-recreate cms` (cache).
BEGIN;
CREATE SCHEMA IF NOT EXISTS zaloha;
-- Předci (město, země…) z poslední PUBLIKOVANÉ verze: řádek v `pages` nese poslední
-- uloženou verzi, což může být rozpracovaný draft s jiným názvem/pádem než to, co web
-- ukazuje. Stránky bez publikované verze (nemělo by nastat) padají na řádek v `pages`.
CREATE TEMP TABLE anc AS
SELECT p.id,
  COALESCE(v.version_parent_id, p.parent_id) parent_id,
  COALESCE(v.version_category::text, p.category::text) category,
  COALESCE(v.version_title, p.title) title,
  COALESCE(v.version_detail_locative, p.detail_locative) detail_locative
FROM pages p
LEFT JOIN LATERAL (
  SELECT * FROM _pages_v v
  WHERE v.parent_id = p.id AND v.version__status = 'published'
  ORDER BY v.updated_at DESC, v.id DESC LIMIT 1
) v ON true;

CREATE TEMP TABLE t AS
WITH RECURSIVE up AS (
  -- Cíl sám: `_status = 'published'` na hlavním řádku = žádný novější draft, takže
  -- jeho meta_title níž je ten publikovaný.
  SELECT p.id root, p.id cur, p.parent_id, p.category::text category, p.title, p.detail_locative, 0 d
  FROM pages p WHERE p._status = 'published' AND p.category = 'Turistický cíl'
  UNION ALL
  SELECT up.root, q.id, q.parent_id, q.category, q.title, q.detail_locative, up.d + 1
  FROM up JOIN anc q ON q.id = up.parent_id
  WHERE up.category <> 'Místo k navštívení' AND up.d < 8
)
SELECT DISTINCT ON (root) root, title place_title, COALESCE(detail_locative, '') place_loc
FROM up WHERE category = 'Místo k navštívení' ORDER BY root, d;

-- `bare` = titulek bez přípony webu (stejná pravidla jako stripSiteSuffix v src/lib/seo.ts:
-- „• Ara.cz", „| Ara.cz", „- cestovní průvodce Ara.cz", překlep „•vAra.cz"). „Rozbitý"
-- se pozná až na normalizované hodnotě, aby prošla i varianta s „| Ara.cz".
CREATE TEMP TABLE l AS
SELECT s.*, (s.bare ~* ': cestovní průvodce$') broken
FROM (
  SELECT p.id, p.meta_title,
    regexp_replace(regexp_replace(p.meta_title,
      '(\s*[•|–—-]\s*(cestovní\s+(průvodce|inspirace)\s+)?|\s+cestovní\s+(průvodce|inspirace)\s+|\s*•\s*v)Ara\.cz\s*$', '', 'i'),
      '[\s:•|–—-]+$', '') bare,
    t.place_title, t.place_loc
  FROM pages p LEFT JOIN t ON t.root = p.id
  WHERE p._status = 'published' AND p.category = 'Turistický cíl'
    AND p.meta_title ~* '(: cestovní průvodce| - cestovní průvodce)'
  FOR UPDATE OF p
) s;
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

-- Maže se jen hodnota, kterou skript klasifikoval (pojistka k zámku výše).
UPDATE pages p SET meta_title = NULL
  FROM l WHERE p.id = l.id AND l.duvod IS NOT NULL AND p.meta_title = l.meta_title;
UPDATE _pages_v v SET version_meta_title = NULL
  FROM l WHERE v.parent_id = l.id AND l.duvod IS NOT NULL
    AND v.latest AND v.version__status = 'published'
    AND v.version_meta_title = l.meta_title;

SELECT duvod, count(*) FROM l WHERE duvod IS NOT NULL GROUP BY duvod ORDER BY duvod;
COMMIT;
