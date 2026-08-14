import { fetchRootPages } from './payload'
import { AFFILIATE_FALLBACKS, type AffiliateTargets } from './affiliate-defaults'

export { AFFILIATE_FALLBACKS, type AffiliateTargets }

/**
 * Obecné partnerské odkazy pro karty „Připrav se na cestu" / „Příprava do …".
 * Zdroj pravdy je globál Homepage → skupina „Připrav se na cestu" (editovatelné
 * z adminu bez nasazení); prázdné pole padá na výchozí hodnoty v kódu
 * (`affiliate-defaults.ts`). Čtou je VÝHRADNĚ redirecty /go/pojisteni,
 * /go/zajezdy, /go/ubytovani a /go/auta — na stránkách webu jsou jen /go/
 * adresy (důvěryhodné, na vlastní doméně) a případné deep-linky destinací
 * z polí Affiliate u stránek míst.
 *
 * fetchRootPages je cachovaný (tag root_pages, invalidace při uložení globálu)
 * a při nedostupné DB vrací prázdno — pak platí výchozí hodnoty.
 */
export async function getAffiliateTargets(): Promise<AffiliateTargets> {
  const res = await fetchRootPages()
  const fromAdmin = res.data.homepage?.affiliate
  return {
    insuranceUrl: fromAdmin?.insuranceUrl?.trim() || AFFILIATE_FALLBACKS.insuranceUrl,
    toursUrl: fromAdmin?.toursUrl?.trim() || AFFILIATE_FALLBACKS.toursUrl,
    accommodationUrl: fromAdmin?.accommodationUrl?.trim() || AFFILIATE_FALLBACKS.accommodationUrl,
    carRentalUrl: fromAdmin?.carRentalUrl?.trim() || AFFILIATE_FALLBACKS.carRentalUrl,
  }
}
