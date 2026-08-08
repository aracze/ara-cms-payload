import { publicBaseUrl } from './public-url'

/**
 * Sdílená šablona HTML e-mailů webu (vzhled „B1“ odsouhlasený 8. 8. 2026):
 * logo nad bílou kartou, v kartě kresba papouška, titulek, text, jedno velké
 * tlačítko, rámeček s náhradním odkazem a šedá patička s vysvětlením, proč
 * e-mail přišel.
 *
 * Proč tabulky a inline styly: poštovní klienti neumí moderní CSS — Gmail
 * zahazuje <style> bloky, Outlook vykresluje přes Word. Tabulkové rozvržení
 * s inline styly je jediné, co spolehlivě drží ve všech. Ze stejného důvodu
 * je písmo systémové (webové fonty se v poště nenačtou) a logo s papouškem
 * jsou PNG načítané z webu — generuje je `node scripts/build-email-assets.mjs`
 * do `public/assets/email/`.
 */

export type AraEmailContent = {
  /** Titulek pod papouškem, např. „Vítej na Ara.cz!“. Prostý text. */
  title: string
  /**
   * Hlavní text nad tlačítkem — HTML. Dynamické vstupy (uživatelské jméno)
   * si volající ošetří sám, stejně jako dosud.
   */
  bodyHtml: string
  /** Nápis na tlačítku. Prostý text. */
  buttonLabel: string
  /** Cíl tlačítka; stejná adresa se vypíše i do rámečku pod ním. */
  buttonUrl: string
  /** Šedá poznámka pod rámečkem („Když jsi o účet nežádal…“). Prostý text. */
  note: string
  /** Patička: „Tenhle e-mail poslal web Ara.cz, protože “ + tahle věta. Prostý text. */
  reason: string
}

/** Systémové písmo — jediné, na které se dá v poště spolehnout. */
const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

export function renderAraEmail(content: AraEmailContent): string {
  const base = publicBaseUrl()
  const { title, bodyHtml, buttonLabel, buttonUrl, note, reason } = content

  return `<!DOCTYPE html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#ecf1f7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#ecf1f7;">
<tr>
<td align="center" style="padding:26px 16px 22px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;">

<tr>
<td align="center" style="padding:4px 0 18px;">
<a href="${base}" style="text-decoration:none;"><img src="${base}/assets/email/logo.png" width="84" height="17" alt="Ara.cz" style="display:block;border:0;"></a>
</td>
</tr>

<tr>
<td style="background-color:#ffffff;border:1px solid #e2e9f1;border-radius:10px;padding:30px 44px 36px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td align="center" style="padding-bottom:14px;">
<img src="${base}/assets/email/ara.png" width="170" alt="" style="display:block;border:0;">
</td>
</tr>
<tr>
<td align="center" style="font-family:${FONT};font-size:21px;line-height:1.3;font-weight:bold;color:#1a3f6c;padding-bottom:12px;">${title}</td>
</tr>
<tr>
<td align="center" style="padding-bottom:16px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="30" height="2" style="background-color:#d7e1ef;border-radius:2px;font-size:0;line-height:0;">&nbsp;</td></tr></table>
</td>
</tr>
<tr>
<td align="center" style="font-family:${FONT};font-size:15px;line-height:1.65;color:#5b666e;padding:0 30px 16px;">${bodyHtml}</td>
</tr>
<tr>
<td align="center" style="padding-bottom:26px;">
<a href="${buttonUrl}" style="display:inline-block;background-color:#215491;color:#ffffff;font-family:${FONT};font-size:13px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;text-decoration:none;border-radius:999px;padding:13px 34px;">${buttonLabel}</a>
</td>
</tr>
<tr>
<td style="background-color:#eef3fb;border-radius:10px;padding:12px 16px;font-family:${FONT};font-size:13px;line-height:1.55;color:#5b666e;text-align:left;">
Tlačítko nefunguje? Zkopíruj si do prohlížeče tuhle adresu:<br>
<a href="${buttonUrl}" style="color:#215491;word-break:break-all;">${buttonUrl}</a>
</td>
</tr>
<tr>
<td align="center" style="font-family:${FONT};font-size:13px;line-height:1.6;color:#9aa4ad;padding-top:18px;">${note}</td>
</tr>
</table>
</td>
</tr>

<tr>
<td align="center" style="padding:16px 24px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:#9aa4ad;">
Tenhle e-mail poslal web <a href="${base}" style="color:#7d8fa5;">Ara.cz</a>, protože ${reason}
</td>
</tr>

</table>
</td>
</tr>
</table>
</body>
</html>`
}
