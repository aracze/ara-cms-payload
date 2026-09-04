// Vite `?raw` import (vitest) — soubor jako řetězec.
declare module '*?raw' {
  const source: string
  export default source
}
