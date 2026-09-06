-- Odkazy na Booking v textech stránek „Ubytování" → provizní přesměrování webu
-- (review 4. 9. 2026). Přímý partnerský program Booking skončil, takže staré odkazy
-- s `aid=` (vlastní 1328457, aid mapových widgetů, u USA dokonce cizí 334356/319918
-- vč. gclid) nic nevydělají; web má /go/ubytovani/<cesta na booking.com> přes síť CJ.
-- Dál maže osamocené odstavce „Booking.com" — zbytek legacy mapového widgetu
-- (<ins class="bookingaff">), ze kterého migrace vzala jen záložní odkaz.
-- Idempotentní; původní texty ukládá do zaloha.pages_text_ubytovani_2026_09_04.
-- Mění jen kategorii „Ubytování" a z verzí jen poslední PUBLIKOVANOU (draft editora
-- a historie zůstávají). Stránky drží FOR UPDATE po celou transakci.
-- Spuštění (dev):  docker compose exec -T postgres psql -U postgres -d aracze < scripts/ubytovani-booking-odkazy.sql
-- Prod: stejně proti produkční DB (služba `postgres`), potom `docker compose up -d --force-recreate cms` (cache).
BEGIN;
CREATE SCHEMA IF NOT EXISTS zaloha;

-- Přepis adres: stará adresa (přesná hodnota fields.url odkazu) → nová.
CREATE TEMP TABLE m (old_url text PRIMARY KEY, new_url text) ON COMMIT DROP;
INSERT INTO m VALUES
  ('https://www.booking.com/region/gr/zakynthos.cs.html?aid=1328457&no_rooms=1&group_adults=1',
   '/go/ubytovani/region/gr/zakynthos.cs.html'),
  ('https://www.booking.com/country/kg.cs.html?aid=1328457&label=kg',
   '/go/ubytovani/country/kg.cs.html'),
  ('https://www.booking.com/region/us/grand-teton-national-park.cs.html?aid=334356;label=Amerika7168',
   '/go/ubytovani/region/us/grand-teton-national-park.cs.html'),
  ('https://www.booking.com/region/us/yellowstone-national-park.cs.html?aid=334356;label=Amerika4153',
   '/go/ubytovani/region/us/yellowstone-national-park.cs.html');
-- Wyoming: odkaz zkopírovaný z Google reklamy (searchresults + gclid + sid) — cíl je
-- „ubytování ve Wyomingu", ne konkrétní dotaz, proto stránka regionu.
-- Adresa se sbírá z aktuálního textu I z poslední publikované verze — řádek v `pages`
-- může být draft s jiným textem, než web ukazuje (CodeRabbit k PR #100).
INSERT INTO m
SELECT DISTINCT l->'fields'->>'url', '/go/ubytovani/region/us/wyoming.cs.html'
FROM (
  SELECT p.text FROM pages p WHERE p.category = 'Ubytování' AND p.full_slug = '/usa/wyoming/ubytovani'
  UNION ALL
  SELECT v.version_text FROM pages p
  JOIN LATERAL (
    SELECT version_text FROM _pages_v v WHERE v.parent_id = p.id AND v.version__status = 'published'
    ORDER BY v.updated_at DESC, v.id DESC LIMIT 1
  ) v ON true
  WHERE p.category = 'Ubytování' AND p.full_slug = '/usa/wyoming/ubytovani'
) t, jsonb_path_query(t.text, 'strict $.**.children[*] ? (@.type == "link")') l
WHERE l->'fields'->>'url' LIKE 'https://www.booking.com/searchresults.cs.html?aid=319918%'
ON CONFLICT DO NOTHING;

-- Náhrada url v serializovaném jsonb: hledá se přesná dvojice `"url": "<stará>"`
-- (jsonb::text píše klíče s mezerou za dvojtečkou; to_json ošetří escapování).
CREATE FUNCTION pg_temp.replace_urls(t jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE r record; s text := t::text;
BEGIN
  FOR r IN SELECT * FROM m LOOP
    s := replace(s, '"url": ' || to_json(r.old_url)::text, '"url": ' || to_json(r.new_url)::text);
  END LOOP;
  RETURN s::jsonb;
END $$;

-- Odstranění odstavců, které jsou JEN záložní odkaz widgetu (jediný potomek typu link
-- s url `//www.booking.com?aid=…`, `https://www.booking.com/?aid=…`, nebo už přepsané
-- holé `/go/ubytovani` — kdyby dřív běžel scripts/affiliate-odkazy-v-textech.sql).
CREATE FUNCTION pg_temp.drop_widget_paragraphs(t jsonb) RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN t->'root'->'children' IS NULL THEN t ELSE
    jsonb_set(t, '{root,children}', COALESCE((
      SELECT jsonb_agg(c ORDER BY ord)
      FROM jsonb_array_elements(t->'root'->'children') WITH ORDINALITY AS e(c, ord)
      WHERE NOT (
        c->>'type' = 'paragraph'
        AND jsonb_array_length(COALESCE(c->'children', '[]'::jsonb)) = 1
        AND c->'children'->0->>'type' = 'link'
        AND c->'children'->0->'fields'->>'url' ~ '^((https?:)?//www\.booking\.com/?\?aid=\d+|/go/ubytovani/?)$'
        AND c->'children'->0->'children'->0->>'text' ~* '^\s*booking\.com\s*$'
      )
    ), '[]'::jsonb))
  END
$$;

CREATE FUNCTION pg_temp.fix_text(t jsonb) RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT pg_temp.replace_urls(pg_temp.drop_widget_paragraphs(t))
$$;

-- Hlavní řádky
CREATE TEMP TABLE src ON COMMIT DROP AS
SELECT p.id, p.full_slug, p.text AS old_text, pg_temp.fix_text(p.text) AS new_text
FROM pages p
WHERE p.category = 'Ubytování' AND p.text IS NOT NULL
  AND (p.text::text LIKE '%booking.com%' OR p.text::text LIKE '%/go/ubytovani%')
FOR UPDATE OF p;
DELETE FROM src WHERE old_text = new_text;

-- Poslední PUBLIKOVANÁ verze každé dotčené stránky
CREATE TEMP TABLE srcv ON COMMIT DROP AS
SELECT v.id AS version_id, v.parent_id AS page_id, v.version_text AS old_text,
       pg_temp.fix_text(v.version_text) AS new_text
FROM (
  SELECT DISTINCT ON (v.parent_id) v.*
  FROM _pages_v v
  JOIN pages p ON p.id = v.parent_id
  WHERE p.category = 'Ubytování' AND v.version__status = 'published'
  ORDER BY v.parent_id, v.updated_at DESC, v.id DESC
) v
WHERE v.version_text IS NOT NULL
  AND (v.version_text::text LIKE '%booking.com%' OR v.version_text::text LIKE '%/go/ubytovani%');
DELETE FROM srcv WHERE old_text = new_text;

CREATE TABLE IF NOT EXISTS zaloha.pages_text_ubytovani_2026_09_04 (
  id int, version_id int, full_slug text, old_text jsonb, zalohovano timestamptz DEFAULT now()
);
INSERT INTO zaloha.pages_text_ubytovani_2026_09_04 (id, version_id, full_slug, old_text)
SELECT id, NULL, full_slug, old_text FROM src
UNION ALL
SELECT page_id, version_id, NULL, old_text FROM srcv;

UPDATE pages p SET text = s.new_text FROM src s WHERE p.id = s.id;
UPDATE _pages_v v SET version_text = s.new_text FROM srcv s WHERE v.id = s.version_id;

-- Kontrola
SELECT 'pages' AS tabulka, count(*) AS zmeneno FROM src
UNION ALL SELECT '_pages_v', count(*) FROM srcv;
SELECT p.full_slug, l->'fields'->>'url' AS url
FROM pages p, jsonb_path_query(p.text, 'strict $.**.children[*] ? (@.type == "link")') l
WHERE p.category = 'Ubytování' AND (l->'fields'->>'url') ~ 'booking|/go/'
ORDER BY 1, 2;
COMMIT;
