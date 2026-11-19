import { describe, expect, it } from 'vitest'
import { beepWav, describeDevice, deviceLine, headline, reportText, summarise, type CheckResult } from './report'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14; SM-A566B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'
const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1'

const results: CheckResult[] = [
  { id: 'a', label: 'Secure connection', status: 'pass', detail: 'Yes.' },
  { id: 'b', label: 'Microphone', status: 'fail', detail: 'Access was refused.' },
  { id: 'c', label: 'Screen stays awake', status: 'warn', detail: 'Not available.' },
  { id: 'd', label: 'Notifications', status: 'info', detail: 'Only in the app.' },
]

describe('describeDevice', () => {
  it('recognises an iPhone in Safari and a phone in Chrome', () => {
    expect(describeDevice(IPHONE, false)).toEqual({ phone: 'iPhone', system: 'iOS 17.5', browser: 'Safari', installed: false })
    expect(describeDevice(ANDROID_CHROME, true)).toEqual({ phone: 'Android phone', system: 'Android 14', browser: 'Chrome', installed: true })
  })

  it('tells Chrome on an iPhone from Safari, because it behaves differently', () => {
    expect(describeDevice(IPHONE_CHROME, false).browser).toBe('Chrome')
  })

  it('says it plainly in one line', () => {
    expect(deviceLine(describeDevice(IPHONE, true))).toBe('iPhone, iOS 17.5, Safari (opened from the Home Screen icon)')
  })
})

describe('summary and report', () => {
  it('counts what worked, what needs a look and what failed, ignoring plain facts', () => {
    expect(summarise(results)).toEqual({ passed: 1, warnings: 1, failed: 1 })
  })

  it('words the headline for each outcome', () => {
    expect(headline({ passed: 5, warnings: 0, failed: 0 })).toBe('Everything works on this phone.')
    expect(headline({ passed: 5, warnings: 2, failed: 0 })).toContain('2 things to look at')
    expect(headline({ passed: 5, warnings: 0, failed: 1 })).toContain('1 thing did not work')
  })

  it('writes a plain-text report with every result and no personal details', () => {
    const text = reportText(describeDevice(IPHONE, false), '393x852', results, new Date(2026, 10, 19, 11, 40))
    expect(text).toContain('Phone: iPhone, iOS 17.5, Safari (opened in the browser)')
    expect(text).toContain('Screen: 393x852')
    expect(text).toContain('[FAIL] Microphone: Access was refused.')
    expect(text).toContain('[OK]   Secure connection: Yes.')
    expect(text).toContain('Result: 1 worked, 1 to look at, 1 did not work.')
  })
})

describe('beepWav', () => {
  it('makes a valid mono 16-bit WAV of the right length', () => {
    const wav = beepWav(0.5, 880, 8_000)
    const view = new DataView(wav.buffer)
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe('RIFF')
    expect(String.fromCharCode(...wav.slice(8, 12))).toBe('WAVE')
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint32(24, true)).toBe(8_000)
    expect(view.getUint32(40, true)).toBe(4_000 * 2)
    expect(wav.length).toBe(44 + 4_000 * 2)
  })

  it('is audible but not loud, and starts and ends quietly', () => {
    const wav = beepWav(0.5, 880, 8_000)
    const view = new DataView(wav.buffer)
    let peak = 0
    for (let i = 44; i < wav.length; i += 2) peak = Math.max(peak, Math.abs(view.getInt16(i, true)))
    expect(peak).toBeGreaterThan(5_000)
    expect(peak).toBeLessThan(16_000)
    expect(Math.abs(view.getInt16(44, true))).toBeLessThan(200)
  })
})
