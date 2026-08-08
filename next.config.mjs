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
    ]
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
