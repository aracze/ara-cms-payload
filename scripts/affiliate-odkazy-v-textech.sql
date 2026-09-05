-- Mrtvé a chybné partnerské odkazy v textech stránek a článků (audit 4. 9. 2026,
-- rozhodnutí uživatele „vše opravit"). Přepisuje jen URL uvnitř odkazů (fields.url
-- Lexical uzlu link), texty se jinak nemění:
--   1. rentalcars.com (program ukončen, provize 0; u Egypta/Švýcarska navíc špatná
--      země) → /go/auta[/země] — cesta z DiscoverCars adresy rodiče (pole „Půjčení
--      auta" místa), bez ní obecné /go/auta.
--   2. ara.cz/go/epojisteni (záměrně 404 od 28. 8. 2026) → /go/pojisteni (Klik.cz přes CJ).
--   3. revolut.ngih.net/… (Impact odkaz, 404) → https://www.revolut.com/cz/ (bez provize;
--      nový partnerský odkaz lze dosadit stejným způsobem).
--   4. Invia: Černá Hora, Kypr a Lotyšsko vedly omylem na /dovolena/belorusko/.
--   5. booking.com (staré aid=1328457 ve článku o Sri Lance, jinde bez provize)
--      → /go/ubytovani[/cesta na booking.com] (CJ). Stránky kategorie Ubytování se
--      vynechávají — ty řeší scripts/ubytovani-booking-odkazy.sql (vč. mazání zbytků
--      widgetu), takže na pořadí spuštění obou skriptů nezáleží.
-- Idempotentní; původní texty do zaloha.texts_affiliate_odkazy_2026_09_04. Z verzí
-- stránek jen poslední PUBLIKOVANÁ (draft editora a historie zůstávají); články verze nemají.
-- Spuštění (dev):  docker compose exec -T postgres psql -U postgres -d aracze < scripts/affiliate-odkazy-v-textech.sql
-- Prod: stejně proti produkční DB (služba `postgres`), potom `docker compose up -d --force-recreate cms` (cache).
BEGIN;
CREATE SCHEMA IF NOT EXISTS zaloha;

-- Poslední PUBLIKOVANÁ verze každé stránky — řádek v `pages` může být rozpracovaný
-- draft s jiným textem, než web ukazuje; přepisuje se obojí, takže se odkazy sbírají
-- z obou zdrojů (viz CodeRabbit k PR #100).
CREATE TEMP TABLE pubv ON COMMIT DROP AS
SELECT DISTINCT ON (v.parent_id) v.id AS version_id, v.parent_id AS page_id, v.version_text
FROM _pages_v v
WHERE v.version__status = 'published' AND v.version_text IS NOT NULL
ORDER BY v.parent_id, v.updated_at DESC, v.id DESC;

-- Všechny odkazy v textech (stránky FOR UPDATE — souběžná editace v adminu se nepřepíše).
CREATE TEMP TABLE links ON COMMIT DROP AS
SELECT 'page' AS scope, p.id AS doc_id, p.full_slug AS slug, p.parent_id, p.category::text AS category,
       l->'fields'->>'url' AS url
FROM pages p, jsonb_path_query(p.text, 'strict $.**.children[*] ? (@.type == "link")') l
UNION ALL
SELECT 'page', p.id, p.full_slug, p.parent_id, p.category::text, l->'fields'->>'url'
FROM pubv v JOIN pages p ON p.id = v.page_id,
     jsonb_path_query(v.version_text, 'strict $.**.children[*] ? (@.type == "link")') l
UNION ALL
SELECT 'article', a.id, a.slug, NULL, NULL, l->'fields'->>'url'
FROM articles a, jsonb_path_query(a.text, 'strict $.**.children[*] ? (@.type == "link")') l;

CREATE TEMP TABLE m (
  rule text, scope text, doc_id int, old_url text, new_url text,
  PRIMARY KEY (scope, doc_id, old_url)
) ON COMMIT DROP;

-- 1) Rentalcars → /go/auta[/země]
INSERT INTO m
SELECT DISTINCT '1 rentalcars', l.scope, l.doc_id, l.url,
  '/go/auta' || COALESCE((
    SELECT regexp_replace(regexp_replace(regexp_replace(regexp_replace(
      par.affiliate_car_rental_url, '^https?://[^/]+', ''), '[?#].*$', ''), '^/cz(?=/|$)', ''), '/+$', '')
    FROM pages par
    WHERE par.id = l.parent_id AND par.affiliate_car_rental_url ~ '^https?://(www\.)?discovercars\.com/'
  ), '')
FROM links l WHERE l.url ~* '^https?://(www\.)?rentalcars\.com/'
ON CONFLICT DO NOTHING;

-- 2) /go/epojisteni → /go/pojisteni
INSERT INTO m
SELECT DISTINCT '2 epojisteni', scope, doc_id, url, '/go/pojisteni'
FROM links WHERE url ~* '^(https?://(www\.)?ara\.cz)?/go/epojisteni/?$'
ON CONFLICT DO NOTHING;

-- 3) Revolut (Impact) → revolut.com
INSERT INTO m
SELECT DISTINCT '3 revolut', scope, doc_id, url, 'https://www.revolut.com/cz/'
FROM links WHERE url ~* '^https?://revolut\.ngih\.net/'
ON CONFLICT DO NOTHING;

-- 4) Invia: chybná země (copy-paste z Běloruska)
INSERT INTO m
SELECT DISTINCT '4 invia zeme', scope, doc_id, url,
  replace(url, '/dovolena/belorusko/', '/dovolena/' || regexp_replace(slug, '^/([^/]+)/.*$', '\1') || '/')
FROM links
WHERE scope = 'page' AND slug IN ('/cerna-hora/doprava', '/kypr/doprava', '/lotyssko/doprava')
  AND url LIKE 'https://www.invia.cz/dovolena/belorusko/%'
ON CONFLICT DO NOTHING;

-- 5) Booking → /go/ubytovani[/cesta] — mimo stránky Ubytování (viz hlavička)
INSERT INTO m
SELECT DISTINCT '5 booking', scope, doc_id, url,
  '/go/ubytovani' || regexp_replace(regexp_replace(regexp_replace(url, '^https?://[^/]+', ''), '[?#;].*$', ''), '/+$', '')
FROM links
WHERE url ~* '^https?://(www\.)?booking\.com(/|$)' AND category IS DISTINCT FROM 'Ubytování'
ON CONFLICT DO NOTHING;

-- Náhrada v serializovaném jsonb: přesná dvojice `"url": "<stará>"` (jsonb::text
-- píše mezeru za dvojtečkou; to_json ošetří escapování).
CREATE FUNCTION pg_temp.fix_links(sc text, did int, t jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE r record; s text := t::text;
BEGIN
  FOR r IN SELECT * FROM m WHERE m.scope = sc AND m.doc_id = did LOOP
    s := replace(s, '"url": ' || to_json(r.old_url)::text, '"url": ' || to_json(r.new_url)::text);
  END LOOP;
  RETURN s::jsonb;
END $$;

CREATE TEMP TABLE src_pages ON COMMIT DROP AS
SELECT p.id, p.text AS old_text, pg_temp.fix_links('page', p.id, p.text) AS new_text
FROM pages p WHERE p.id IN (SELECT doc_id FROM m WHERE scope = 'page') FOR UPDATE OF p;
DELETE FROM src_pages WHERE old_text = new_text;

CREATE TEMP TABLE src_versions ON COMMIT DROP AS
SELECT v.version_id, v.page_id, v.version_text AS old_text,
       pg_temp.fix_links('page', v.page_id, v.version_text) AS new_text
FROM pubv v WHERE v.page_id IN (SELECT doc_id FROM m WHERE scope = 'page');
DELETE FROM src_versions WHERE old_text = new_text;

CREATE TEMP TABLE src_articles ON COMMIT DROP AS
SELECT a.id, a.text AS old_text, pg_temp.fix_links('article', a.id, a.text) AS new_text
FROM articles a WHERE a.id IN (SELECT doc_id FROM m WHERE scope = 'article') FOR UPDATE OF a;
DELETE FROM src_articles WHERE old_text = new_text;

CREATE TABLE IF NOT EXISTS zaloha.texts_affiliate_odkazy_2026_09_04 (
  scope text, doc_id int, version_id int, old_text jsonb, zalohovano timestamptz DEFAULT now()
);
INSERT INTO zaloha.texts_affiliate_odkazy_2026_09_04 (scope, doc_id, version_id, old_text)
SELECT 'page', id, NULL, old_text FROM src_pages
UNION ALL SELECT 'page', page_id, version_id, old_text FROM src_versions
UNION ALL SELECT 'article', id, NULL, old_text FROM src_articles;

UPDATE pages p SET text = s.new_text FROM src_pages s WHERE p.id = s.id;
UPDATE _pages_v v SET version_text = s.new_text FROM src_versions s WHERE v.id = s.version_id;
UPDATE articles a SET text = s.new_text FROM src_articles s WHERE a.id = s.id;

-- Kontrola
SELECT rule, count(*) AS odkazu, count(DISTINCT (scope, doc_id)) AS dokumentu FROM m GROUP BY rule ORDER BY rule;
SELECT 'pages' AS tabulka, count(*) AS zmeneno FROM src_pages
UNION ALL SELECT '_pages_v', count(*) FROM src_versions
UNION ALL SELECT 'articles', count(*) FROM src_articles;
SELECT rule, new_url, count(*) FROM m GROUP BY 1, 2 ORDER BY 1, 3 DESC, 2 LIMIT 40;
COMMIT;
