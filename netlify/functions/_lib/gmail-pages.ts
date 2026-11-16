import { GMAIL_RETURN_PARAM } from '../../../src/types/gmail.ts'

const RESULT_TEXT: Record<string, { title: string; text: string }> = {
  connected: { title: 'Gmail is connected', text: 'You can go back to Volita now.' },
  denied: { title: 'Nothing was connected', text: 'You said no on the Google screen, so Volita did not get access.' },
  scopes: { title: 'Gmail was not connected', text: 'Volita needs both permissions (read and send) to work. Please try again and leave both ticked.' },
  failed: { title: 'That did not work', text: 'The connection could not be finished. Go back to Volita and try again.' },
}

/**
 * The page the person lands on after Google. It is a plain page, not the app, because the browser that comes back from
 * Google may not be the one Volita is open in (the Android app opens Google in the phone's browser). It has one button
 * that goes back to the app, and it never shows anything that came from the address.
 */
export function resultPage(requestUrl: string, code: string): Response {
  const { title, text } = RESULT_TEXT[code] ?? RESULT_TEXT.failed
  const link = new URL('/', requestUrl)
  link.searchParams.set(GMAIL_RETURN_PARAM, RESULT_TEXT[code] ? code : 'failed')
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Volita</title>
<style>body{font-family:system-ui,sans-serif;background:#fffaf5;color:#2b1a12;margin:0;display:grid;place-items:center;min-height:100vh;padding:24px}main{max-width:420px;text-align:center}h1{font-size:1.4rem}a{display:inline-block;margin-top:16px;padding:12px 22px;border-radius:12px;background:#c2410c;color:#fff;text-decoration:none;font-weight:600}</style></head>
<body><main><h1>${title}</h1><p>${text}</p><a href="${link.pathname}${link.search}">Back to Volita</a></main></body></html>`
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })
}
