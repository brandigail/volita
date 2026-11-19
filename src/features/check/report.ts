/** How one check turned out: it works, it works but needs a word, it does not work, or it is only a fact about the phone. */
export type CheckStatus = 'pass' | 'warn' | 'fail' | 'info'

export interface CheckResult {
  id: string
  label: string
  status: CheckStatus
  /** One plain sentence: what was found, and what to do if it did not work. */
  detail: string
}

export interface DeviceFacts {
  phone: string
  system: string
  browser: string
  /** Opened from the Home Screen icon, rather than in a browser tab. */
  installed: boolean
}

/** Works out the phone, system and browser from the browser's own description of itself. */
export function describeDevice(userAgent: string, installed: boolean): DeviceFacts {
  const iphone = /iPhone|iPod/.test(userAgent)
  const ipad = /iPad/.test(userAgent) || (/Macintosh/.test(userAgent) && /Mobile/.test(userAgent))
  const android = /Android/.test(userAgent)
  const iosVersion = /OS (\d+)[_.](\d+)/.exec(userAgent)
  const androidVersion = /Android (\d+(?:\.\d+)?)/.exec(userAgent)

  let browser = 'a browser'
  if (/EdgA|EdgiOS|Edg\//.test(userAgent)) browser = 'Edge'
  else if (/CriOS|Chrome\//.test(userAgent)) browser = 'Chrome'
  else if (/FxiOS|Firefox\//.test(userAgent)) browser = 'Firefox'
  else if (/SamsungBrowser/.test(userAgent)) browser = 'Samsung Internet'
  else if (/Safari\//.test(userAgent)) browser = 'Safari'
  // The Android app is a web view, which says "; wv)" in its description.
  if (android && /; wv\)/.test(userAgent)) browser = 'the Volita app'

  return {
    phone: iphone ? 'iPhone' : ipad ? 'iPad' : android ? 'Android phone' : 'Computer',
    system: iphone || ipad ? (iosVersion ? `iOS ${iosVersion[1]}.${iosVersion[2]}` : 'iOS') : android ? (androidVersion ? `Android ${androidVersion[1]}` : 'Android') : 'desktop',
    browser,
    installed,
  }
}

export function deviceLine(facts: DeviceFacts): string {
  return `${facts.phone}, ${facts.system}, ${facts.browser} (${facts.installed ? 'opened from the Home Screen icon' : 'opened in the browser'})`
}

export interface Summary {
  passed: number
  warnings: number
  failed: number
}

export function summarise(results: CheckResult[]): Summary {
  return {
    passed: results.filter((r) => r.status === 'pass').length,
    warnings: results.filter((r) => r.status === 'warn').length,
    failed: results.filter((r) => r.status === 'fail').length,
  }
}

/** One sentence for the top of the results. */
export function headline(summary: Summary): string {
  if (summary.failed > 0) return `${summary.failed} thing${summary.failed === 1 ? '' : 's'} did not work. Send the report below.`
  if (summary.warnings > 0) return `Everything works, with ${summary.warnings} thing${summary.warnings === 1 ? '' : 's'} to look at.`
  return 'Everything works on this phone.'
}

const MARK: Record<CheckStatus, string> = { pass: '[OK]  ', warn: '[CHECK]', fail: '[FAIL]', info: '[info]' }

/** The results as plain text a person can paste into a message. It holds no name, email or account detail. */
export function reportText(device: DeviceFacts, screen: string, results: CheckResult[], when: Date): string {
  const summary = summarise(results)
  const lines = [
    `Volita phone check, ${when.toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })}`,
    `Phone: ${deviceLine(device)}`,
    `Screen: ${screen}`,
    '',
    ...results.map((result) => `${MARK[result.status]} ${result.label}: ${result.detail}`),
    '',
    `Result: ${summary.passed} worked, ${summary.warnings} to look at, ${summary.failed} did not work.`,
  ]
  return lines.join('\n')
}

/**
 * A short, gentle beep as a WAV file (16-bit, mono). The check plays it through an audio element, the same way Volita plays the
 * assistant's voice, so a silent switch or a blocked sound shows up here first.
 */
export function beepWav(seconds = 0.6, frequency = 880, sampleRate = 22_050): Uint8Array {
  const samples = Math.floor(seconds * sampleRate)
  const bytes = new Uint8Array(44 + samples * 2)
  const view = new DataView(bytes.buffer)
  const text = (offset: number, value: string) => [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)))
  text(0, 'RIFF')
  view.setUint32(4, 36 + samples * 2, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, samples * 2, true)
  for (let i = 0; i < samples; i++) {
    // Fade in and out so the beep does not click.
    const envelope = Math.min(1, i / (sampleRate * 0.03), (samples - i) / (sampleRate * 0.05))
    view.setInt16(44 + i * 2, Math.round(Math.sin((2 * Math.PI * frequency * i) / sampleRate) * 0.35 * envelope * 32_767), true)
  }
  return bytes
}
