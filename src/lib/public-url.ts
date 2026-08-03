/**
 * Veřejná adresa webu — JEDNO místo, které o ní rozhoduje.
 *
 * Používá ji `serverURL` v konfiguraci Payloadu (kontrola původu požadavků)
 * i odkazy v e-mailech (potvrzení účtu, obnova hesla). Dřív si každé z těch
 * míst řešilo chybějící proměnnou po svém: e-maily spadly, `serverURL` tiše
 * sklouzl na localhost. Ten rozpor byl horší než obojí zvlášť — v produkci by
 * web fungoval, ale odkazy v dopisech by vedly na localhost.
 *
 * Čisté funkce bez závislostí: soubor načítá i `payload.config.ts`, který běží
 * i mimo požadavek prohlížeče (skripty, generování typů).
 */

const LOCAL_FALLBACK = 'http://localhost:3000'

/**
 * Adresa bez koncového lomítka.
 *
 * V produkci NESMÍ chybět: bez ní by odkazy v e-mailech vedly na localhost
 * a nikdo by si toho nevšiml, dokud by se lidé nezačali ozývat. Proto radši
 * spadne rovnou. V dev režimu je localhost správná odpověď.
 */
export function publicBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_PAYLOAD_BASE_URL?.trim()
  if (raw) return raw.replace(/\/$/, '')
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Chybí NEXT_PUBLIC_PAYLOAD_BASE_URL — bez ní by odkazy v e-mailech vedly na localhost a kontrola původu požadavků by běžela naslepo.',
    )
  }
  return LOCAL_FALLBACK
}

/**
 * Totéž, ale bez vyhazování chyby — vrací `undefined`, když adresa není.
 *
 * Pro `serverURL` v konfiguraci Payloadu: ta se vyhodnocuje při NAČTENÍ
 * konfigurace, tedy i během `next build`, kde `NODE_ENV` je „production". Tvrdá
 * chyba by tam znamenala, že build spadne každému, kdo proměnnou nemá v `.env`
 * (ověřeno — spadl mi). Když adresa chybí, Payload si původ požadavku odvodí
 * sám, což je stav před touhle změnou; nic se nezhorší.
 *
 * Odkazy v e-mailech naopak MUSÍ spadnout (`publicBaseUrl` výš) — tam by tichý
 * localhost znamenal, že dopisy vedou do prázdna.
 */
export function publicBaseUrlOptional(): string | undefined {
  const raw = process.env.NEXT_PUBLIC_PAYLOAD_BASE_URL?.trim()
  return raw ? raw.replace(/\/$/, '') : undefined
}
