import Script from 'next/script'

/**
 * Google Analytics 4 s režimem souhlasu v2 (Consent Mode v2).
 *
 * JAK TO SPOLU DRŽÍ:
 * Souhlas nesbíráme vlastní lištou — obstarává ji Google Funding Choices,
 * nastavená v AdSense konzoli, která se na stránku dostane spolu s AdSense
 * tagem. V AdSense je zapnutý „režim souhlasu", takže Google signál z té lišty
 * předá i Analytics. Vlastní cookie lišta by byla druhá lišta o tomtéž.
 *
 * KDY SE LIŠTA OBJEVÍ: AdSense tag se od srpna 2026 načítá až ve chvíli, kdy se
 * čtenář blíží ke konkrétní reklamě (viz `useLazyAd` v `article-ad.tsx`) —
 * jeho skripty totiž zabíraly hlavní vlákno na stovky milisekund a kazily
 * odezvu na ťuknutí (INP). Lišta souhlasu tedy přijde spolu s reklamou, ne
 * hned. Je to záměr: dokud se reklama nenačte, neuloží se do prohlížeče nic,
 * na co by byl souhlas potřeba. Důsledek pro měření je popsaný níže —
 * u návštěvníka, který se k reklamě nedostane, zůstane souhlas zamítnutý.
 *
 * POŘADÍ JE TU PODSTATNÉ. Výchozí stav souhlasu musí být na stránce dřív než
 * jakákoli značka Google, jinak by se první měření odeslalo, než se stihne
 * zeptat. Proto je výchozí souhlas OBYČEJNÝ inline `<script>`, ne `next/script`:
 * vykoná se už při parsování HTML, kdežto gtag přes `afterInteractive` Next
 * vkládá až po hydrataci. Pořadí je tím dané tvrdě, ne domluvou o strategiích.
 * (`beforeInteractive` by fungovalo taky, ale ESLint pravidlo psané pro starý
 * Pages Router na něj hlásí falešné varování.)
 *
 * PROČ SE ZNAČKA NAČÍTÁ, I KDYŽ JE SOUHLAS ZAMÍTNUTÝ:
 * Jde o „rozšířený" režim souhlasu. Bez souhlasu se do prohlížeče NIC neuloží
 * (to je to, co hlídá § 89 odst. 3 zákona č. 127/2005 Sb.) — Google jen dostane
 * anonymní ping bez identifikátorů, ze kterého dopočítá odhad návštěvnosti.
 * Konzervativnější alternativa je „základní" režim, kdy se gtag nenačte vůbec,
 * dokud uživatel neklikne; stálo by to ale všechna data o lidech, kteří souhlas
 * nedají, a vyžadovalo by to ruční odposlech CMP. Kdyby se to mělo změnit,
 * mění se to tady.
 */

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || 'G-EF70RXRLSE'

export function Analytics() {
  if (!GA_MEASUREMENT_ID) return null

  return (
    <>
      {/*
       * Výchozí souhlas = zamítnuto pro všechny čtyři parametry, které Consent
       * Mode v2 zná. `wait_for_update` dá liště 500 ms na odpověď, než značka
       * cokoli odešle — bez něj by se stihlo odeslat měření ještě před tím,
       * než CMP stačí načíst uložené rozhodnutí z minulé návštěvy.
       * `ads_data_redaction` navíc bez souhlasu ořízne identifikátory
       * z reklamních prokliků.
       */}
      <script
        dangerouslySetInnerHTML={{
          __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied',wait_for_update:500});gtag('set','ads_data_redaction',true);`,
        }}
      />

      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`gtag('js',new Date());gtag('config','${GA_MEASUREMENT_ID}');`}
      </Script>
    </>
  )
}
