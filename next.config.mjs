import { withPayload } from '@payloadcms/next/withPayload'

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // jsdom (isomorphic-dompurify) nesmi byt zabaleny bundlerem: (1) cte sve
  // soubory relativne k __dirname (ENOENT na default-stylesheet.css),
  // (2) zabaleny v dev rezimu je extremne pomaly - stranky s rich textem
  // pak trvaji desitky sekund. Externalizovany bezi nativne z node_modules.
  serverExternalPackages: [
    'jsdom',
    'isomorphic-dompurify',
    // Databázová/serverová vrstva Payloadu MUSÍ běžet nativně z node_modules.
    // Zabalená Turbopackem v dev je extrémně pomalá (dotaz 222 ms → 29 s v RSC).
    'payload',
    '@payloadcms/db-postgres',
    'drizzle-orm',
    'pg',
    // GA4 sync endpoint (gRPC/protobuf) — zabalené bundlerem stejně extrémně
    // pomalé/zamrzávající jako jsdom výše.
    '@google-analytics/data',
  ],
  experimental: {
    serverActions: {
      // Avatar smí mít 2 MB (viz kolekce Avatars). Výchozí strop server akcí je
      // 1 MB, takže by se větší fotka utnula dřív, než by se dostala k validaci.
      // POZOR: platí pro VŠECHNY server akce, ne jen pro nahrávání fotky —
      // Next to jinak nastavit neumí. Vlastní meze (délky textů, velikost
      // souboru) proto musí hlídat každá akce sama, viz src/lib/profile-limits.ts.
      bodySizeLimit: '3mb',
    },
  },
  images: {
    // Zmenšování obrázků dělá Cloudinary (viz loader), ne Next server —
    // funguje to tak i se standalone outputem bez další zátěže.
    loader: 'custom',
    loaderFile: './src/lib/cloudinary-loader.ts',
    // Výchozí sada Next.js obsahuje i 2048 a 3840 px — 4K varianty dělaly
    // většinu přenosů z Cloudinary. Strop 1920 px drží i loader
    // (MAX_IMAGE_WIDTH v cloudinary-loader.ts), tady jen srcset větší
    // varianty vůbec nenabízí.
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
  },
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }

    return webpackConfig
  },
  // SEO redirecty ze starého (Grails) webu na nový. Držet zde, ne v Payload
  // kolekci - jde o malou, stabilní sadu 301, ne o obsah editovaný v adminu.
  async redirects() {
    return [
      // Provizní redirecty /go/* NEJSOU tady — čtou cíle z adminu (globál
      // Homepage → Připrav se na cestu), takže běží jako route handlery
      // v src/app/(frontend)/go/. Statický redirect by cíl zapekl do buildu.
      // Starý web měl /kontakt jako statickou stránku s kontaktními údaji;
      // na novém webu ji nahrazuje /o-nas.
      {
        source: '/kontakt',
        destination: '/o-nas',
        permanent: true,
      },
      // Spolupráce a Pírka byly sekce redakčního systému starého webu (nábor
      // autorů, resp. bodování příspěvků). Na novém webu ten systém není a
      // nechystá se, takže tu nejsou náhradní stránky — jen nejbližší smysluplný
      // cíl. Obojí má Google zaindexované z odkazů v patičce starého webu.
      {
        // Nábor autorů: na novém webu o něm mluví „O nás" (kdo web píše).
        source: '/spoluprace',
        destination: '/o-nas',
        permanent: true,
      },
      {
        // Pírka byla bodovací hra pro přispěvatele — nemá nic, co by ji
        // nahradilo, takže domů.
        source: '/pirka',
        destination: '/',
        permanent: true,
      },
      {
        // Rozbitý duplikát z migrace: norský text o jídle omylem pod
        // Portugalskem (časové razítko ve slugu = automatické přejmenování při
        // srážce). Smazaný 17. 8. 2026 skriptem cleanup-currency-timezone.sql;
        // správnou stránku má Norsko, tak tam posíláme i zaindexované odkazy.
        source: '/portugalsko/jidlo1726123756332',
        destination: '/norsko/jidlo',
        permanent: true,
      },
      // Kalifornie jako mezistupeň v adrese - stará i nová hierarchie ji
      // z URL schovávají (viz Pages.includeInChildUrlPaths), ale konkrétně
      // tyhle staré odkazy ji ještě obsahují (ověřeno proti aktuálním fullSlug
      // v DB). MUSÍ být před obecnými pravidly níže, jinak "clanky*" pravidlo
      // shodí jen kategorii a "kalifornie" zůstane v URL (viz odkaz na
      // průvodce San Franciskem, který má oba problémy najednou).
      {
        source: '/usa/kalifornie/san-francisco',
        destination: '/usa/san-francisco',
        permanent: true,
      },
      {
        source: '/usa/kalifornie/narodni-park-yosemite',
        destination: '/usa/narodni-park-yosemite',
        permanent: true,
      },
      {
        source: '/usa/kalifornie/los-angeles',
        destination: '/usa/los-angeles',
        permanent: true,
      },
      {
        source:
          '/usa/kalifornie/san-francisco/:category(clanky|clanky-cestopisy|clanky-a-cestopisy)/:slug',
        destination: '/usa/san-francisco/:slug',
        permanent: true,
      },
      // Legacy podstránka profilu (/profil/<user>/clanky/...) NENÍ článek -
      // "clanky" tu značí sekci profilu, řeší ji už
      // src/app/(frontend)/profil/[username]/[...rest]/page.tsx (přesměruje
      // na /profil/<user>#clanky). MUSÍ být před obecným pravidlem níže,
      // jinak by ho to obecné pravidlo předběhlo a smazalo kotvu na sekci.
      {
        source: '/profil/:username/clanky/:rest*',
        destination: '/profil/:username#clanky',
        permanent: true,
      },
      // Staré URL článků měly vždy segment "clanky" mezi rodičovskou stránkou
      // a slugem článku (`{rodic}/clanky/{slug}`), nový web ho v URL nemá
      // (`{rodic}/{slug}`) - viz src/app/(frontend)/[...slug]. Zahrnuje i
      // starší varianty téhož segmentu, které Grails postupně nahrazoval
      // jednotným "clanky" (a část odkazů ještě používá).
      {
        source: '/:path+/:category(clanky|clanky-cestopisy|clanky-a-cestopisy)/:slug',
        destination: '/:path+/:slug',
        permanent: true,
      },
      // Staré VÝPISOVÉ podstránky míst. V Grails to byly samostatné stránky
      // (`{rodic}/mista` = DESTINATION_LIST, `{rodic}/clanky` = ARTICLE_LIST);
      // na novém webu jsou to sekce na stránce rodiče, takže míříme na kotvu.
      // Ověřeno proti staré DB: 495x `%/mista`, 673x `%/clanky` - a v aktuální
      // sitemapě (3155 URL) nekončí na tyhle segmenty ANI JEDNA stránka, takže
      // pravidlo nemá co zastínit. POZOR: `prakticke-informace` a `ubytovani`
      // sem nepatří - to jsou na novém webu skutečné podstránky (71, resp. 8).
      // MUSÍ být až za pravidlem pro články výše: tohle chytá jen adresu, která
      // segmentem končí, takže `{rodic}/clanky/{slug}` propadne správně tam.
      {
        source: '/:path+/:section(mista|clanky)',
        destination: '/:path+#:section',
        permanent: true,
      },
      // Pozn.: segmenty `turisticke-cile` / `zajimavosti` / `aktivity` / `zabava`
      // tu SCHVÁLNĚ nejsou. Grails je z adresy sám vyhazoval (Page.groovy:
      // `uniqueUrl - "turisticke-cile/" - "zajimavosti/" ...`), takže ve staré
      // DB nemají ani jednu stránku - existovaly jen v pár prastarých URL, které
      // si starý web řešil třemi ručními redirecty. Na tři adresy nemá smysl
      // držet obecná pravidla. (A pokud by se sem někdy vracely: segment byl
      // v MNOŽNÉM čísle, tvary `turisticky-cil`/`zajimavost` nikdy neexistovaly.)
    ]
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
