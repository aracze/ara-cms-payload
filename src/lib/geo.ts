/**
 * Souřadnice z CMS jsou textová pole bez validace (`detail.latitude`/`longitude`).
 * MapLibre při |lat| > 90 nebo |lng| > 180 vyhazuje chybu už v konstruktoru
 * LngLat, takže by jeden překlep v adminu shodil celou mapu. Tady se hodnota
 * převede a zkontroluje na jednom místě — vrací `null` pro prázdné, nečíselné
 * nebo mimorozsahové hodnoty.
 */
export function parseLatLng(
  latitude: string | number | null | undefined,
  longitude: string | number | null | undefined,
): { lat: number; lng: number } | null {
  const lat = typeof latitude === 'number' ? latitude : Number.parseFloat(latitude ?? '')
  const lng = typeof longitude === 'number' ? longitude : Number.parseFloat(longitude ?? '')
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat, lng }
}
