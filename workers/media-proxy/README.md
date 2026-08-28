# media-proxy — Cloudflare Worker pro media.ara.cz

Proxy před Cloudinary (cloud `ara`) s dlouhou edge keší + nouzový režim ze
zálohy v R2 (bucket `aracze`, plní ho hook v `src/collections/Media.ts`).
Frontend na proxy přepisuje adresy přes `toMediaProxy`
(`src/lib/cloudinary-loader.ts`), řízeno `NEXT_PUBLIC_MEDIA_BASE_URL`.

## Chování

1. **Normální provoz:** `media.ara.cz/<cesta>` → `res.cloudinary.com/ara/<cesta>`,
   odpověď se keší na edge ~1 rok (adresy jsou verzované). `f_auto` se před keší
   přepisuje na konkrétní formát podle `Accept` (Cloudflare keš ignoruje `Vary`).
2. **Výpadek Cloudinary** (ne-2xx / timeout 10 s): podá se záloha z R2 —
   zmenšená přes Cloudflare Image Transformations (zdroj `media-backup.ara.cz`
   = custom doména bucketu), při nedostupnosti transformací surový originál.
   Krátká keš (5 min), ať se po oživení rychle vrátí normál.
3. **Ochrany:** jen GET/HEAD; jen `/image/upload/` a `/raw/upload/`
   (`/image/fetch/` = 404); transformační segment musí projít whitelistem
   (jinak 400 — nikdo přes nás nerazí varianty a nepálí kredity);
   query string se ignoruje; avataři v R2 nejsou → při výpadku 404.
4. **Podpis transformací (Strict transformations):** na Cloudinary účtu je
   zapnutý režim _Strict transformations_ — nepodepsanou transformaci odmítne
   (404), vyrobí se jen to, co podepíše proxy (`s--xxxxxxxx--/` před
   transformací, SHA-1 z `transformace/public_id.ext` + API secret, viz
   `signTransform`). Staré adresy `res.cloudinary.com/ara/.../w_3840/...`
   v indexech botů tak už negenerují nové odvozeniny (srpen 2026: po smazání
   odvozenin si je boti za 10 dní vyrobili znovu, ~11 GB). Originály bez
   transformace strict režim neblokuje (R2 záloha, og:image, admin upload).
   Secret: `npx wrangler secret put CLOUDINARY_API_SECRET` (hodnota
   = `CLOUDINARY_API_SECRET` z `/opt/aracze/.env` na serveru). Bez secretu
   Worker posílá adresy nepodepsané → funguje jen s vypnutým strict režimem.

## Nasazení

```sh
cd workers/media-proxy
pnpm install
npx wrangler login    # jednorázově, odklik v prohlížeči
npx wrangler deploy   # vytvoří Worker + DNS media.ara.cz + certifikát
npx wrangler secret put CLOUDINARY_API_SECRET   # podpis transformací (viz Chování 4)
```

Předpoklady v Cloudflare účtu (jednorázově, dashboard):

- R2 bucket `aracze` → Settings → Custom Domains → připojit `media-backup.ara.cz`.
- Zóna ara.cz → Images → Transformations → **Enable** (5 000 unikátních
  variant/měsíc zdarma; pro delší výpadek mít platební metodu — 0,50 $/1 000).
- Doporučeno: Caching → Tiered Cache → Smart Tiered Cache (zdarma) a Workers
  Paid (5 $/měs.) — free plán = 100 000 požadavků/den a po překročení Worker
  do půlnoci UTC nepodává nic.

## Testy

```sh
pnpm test        # unit testy čistých funkcí (media-path)
pnpm typecheck
```

Požární cvičení fallbacku (ověření zálohy z R2 bez čekání na skutečný výpadek):

```sh
npx wrangler deploy --var CLOUDINARY_ORIGIN:https://res.cloudinary.com/neexistujici-cloud
# ... curl ověření, pak vrátit:
npx wrangler deploy
```
