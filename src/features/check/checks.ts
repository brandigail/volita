import { pickMimeType } from '../record/recorder-utils'
import { beepWav, type CheckResult } from './report'

/** Each check is one small question put to the phone itself. None of them sends anything anywhere except the one that asks the server hello. */

const result = (id: string, label: string, status: CheckResult['status'], detail: string): CheckResult => ({ id, label, status, detail })

const isIphone = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && /Mobile/.test(navigator.userAgent))

/** The checks that need no tap and no permission. */
export async function quickChecks(installed: boolean): Promise<CheckResult[]> {
  const out: CheckResult[] = []

  out.push(
    window.isSecureContext
      ? result('secure', 'Secure connection', 'pass', 'Yes. The microphone is only allowed on a secure page.')
      : result('secure', 'Secure connection', 'fail', 'No. Open Volita from its https address; the microphone will not work here.'),
  )

  try {
    // The assistant answers this marked request with a quiet "no content" at once, so it shows nothing in the browser's error log.
    const response = await fetch('/api/assistant', { headers: { 'x-volita-warmup': '1' }, signal: AbortSignal.timeout(10_000) })
    out.push(
      response.status === 204 || response.ok
        ? result('server', 'Reaching Volita', 'pass', 'The Volita server answered.')
        : result('server', 'Reaching Volita', 'fail', `The server answered with an error (${response.status}). Try again in a minute.`),
    )
  } catch {
    out.push(result('server', 'Reaching Volita', 'fail', navigator.onLine ? 'The Volita server did not answer. Check the connection and try again.' : 'The phone is offline. Connect to Wi-Fi or mobile data.'))
  }

  try {
    localStorage.setItem('volita:check', '1')
    localStorage.removeItem('volita:check')
    out.push(
      navigator.cookieEnabled
        ? result('storage', 'Remembering your settings and sign-in', 'pass', 'Storage and cookies are allowed.')
        : result('storage', 'Remembering your settings and sign-in', 'fail', 'Cookies are blocked, so you cannot stay signed in. Allow cookies for this site.'),
    )
  } catch {
    out.push(result('storage', 'Remembering your settings and sign-in', 'fail', 'Storage is blocked (private browsing?). Open Volita in a normal tab.'))
  }

  if (isIphone() && !installed) {
    out.push(result('installed', 'On the Home Screen', 'warn', 'Not yet. In Safari tap Share, then Add to Home Screen, and open Volita from that icon for the best results.'))
  } else {
    out.push(result('installed', 'On the Home Screen', 'info', installed ? 'Opened from the Home Screen icon.' : 'Opened in the browser.'))
  }

  const recorder = typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
  const mime = recorder ? pickMimeType() : undefined
  out.push(
    recorder
      ? result('recording-support', 'Recording is supported', 'pass', `This phone records as ${mime ?? 'its own default format'}.`)
      : result('recording-support', 'Recording is supported', 'fail', 'This browser cannot record audio. On an iPhone, use Safari; on Android, use Chrome.'),
  )

  out.push(
    'wakeLock' in navigator
      ? result('wake-lock-support', 'Can keep the screen on', 'pass', 'Supported.')
      : result('wake-lock-support', 'Can keep the screen on', 'warn', 'Not supported here, so the screen may lock during a long conversation.'),
  )
  out.push(
    'speechSynthesis' in window
      ? result('voice-support', 'Phone voice available', 'pass', "This phone has its own voice as a back-up to Volita's voice.")
      : result('voice-support', 'Phone voice available', 'info', 'No built-in voice here. Volita uses its own voice instead.'),
  )
  out.push(
    'Notification' in window
      ? result('notifications', 'Notifications', 'info', `Permission is: ${Notification.permission}.`)
      : result('notifications', 'Notifications', 'info', 'Not available in this browser. On an iPhone they work only from the Home Screen icon.'),
  )
  out.push(
    typeof navigator.clipboard?.writeText === 'function'
      ? result('clipboard', 'Copy to clipboard', 'pass', 'Supported.')
      : result('clipboard', 'Copy to clipboard', 'warn', 'Not supported here, so copy buttons may not work.'),
  )
  return out
}

export interface MicOutcome {
  results: CheckResult[]
}

/** How loud the quietest sound counts as speech, on a scale of 0 to 1. */
const SPEECH_LEVEL = 0.03
const LISTEN_MS = 2_500

function micFailure(err: unknown): string {
  const name = err instanceof DOMException ? err.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return isIphone()
      ? 'Microphone access was refused. In Settings, Safari, Microphone, choose Ask or Allow, then reload this page and try again.'
      : 'Microphone access was refused. Tap the lock icon by the address, allow the microphone, then try again.'
  }
  if (name === 'NotFoundError') return 'No microphone was found on this phone.'
  if (name === 'NotReadableError') return 'Another app is using the microphone. Close it and try again.'
  return 'The microphone could not be started.'
}

/**
 * Asks for the microphone, then records a few seconds while measuring how loud it is. Must be called straight from a tap, because
 * Safari only lets the page start audio after one. The recording is looked at here and thrown away; it is never sent anywhere.
 */
export async function micChecks(onListening: () => void): Promise<MicOutcome> {
  // Made now, while the tap is fresh: Safari keeps an audio context that is created later silent.
  const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  const context = AudioContextClass ? new AudioContextClass() : null
  const out: CheckResult[] = []
  if (!navigator.mediaDevices?.getUserMedia) {
    void context?.close()
    return { results: [result('mic', 'Microphone', 'fail', 'This browser has no way to reach the microphone. On an iPhone use Safari; on Android use Chrome.')] }
  }
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch (err) {
    void context?.close()
    return { results: [result('mic', 'Microphone', 'fail', micFailure(err))] }
  }
  out.push(result('mic', 'Microphone', 'pass', 'Access was allowed.'))

  try {
    await context?.resume().catch(() => undefined)
    const mime = pickMimeType()
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
    const chunks: Blob[] = []
    recorder.ondataavailable = (event) => event.data.size > 0 && chunks.push(event.data)
    const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()))

    let peak = 0
    let sampler: number | undefined
    if (context) {
      const analyser = context.createAnalyser()
      analyser.fftSize = 1024
      context.createMediaStreamSource(stream).connect(analyser)
      const data = new Float32Array(analyser.fftSize)
      sampler = window.setInterval(() => {
        analyser.getFloatTimeDomainData(data)
        for (const value of data) peak = Math.max(peak, Math.abs(value))
      }, 60)
    }

    recorder.start()
    onListening()
    await new Promise((resolve) => setTimeout(resolve, LISTEN_MS))
    recorder.stop()
    await stopped
    window.clearInterval(sampler)

    const bytes = chunks.reduce((total, chunk) => total + chunk.size, 0)
    out.push(
      bytes > 0
        ? result('recording', 'Recording works', 'pass', `Recorded ${Math.round(bytes / 1024)} KB as ${recorder.mimeType || mime || 'audio'}.`)
        : result('recording', 'Recording works', 'fail', 'The recording came out empty. Close other apps that use the microphone, reload, and try again.'),
    )
    if (context && context.state === 'running') {
      out.push(
        peak >= SPEECH_LEVEL
          ? result('level', 'Hearing your voice', 'pass', 'Volita heard sound from the microphone.')
          : result('level', 'Hearing your voice', 'warn', 'The recording was silent or very quiet. Say a few words close to the phone and run the check again.'),
      )
    } else {
      out.push(result('level', 'Hearing your voice', 'info', 'The loudness could not be measured on this phone.'))
    }
  } catch {
    out.push(result('recording', 'Recording works', 'fail', 'Recording could not start on this phone.'))
  } finally {
    stream.getTracks().forEach((track) => track.stop())
    void context?.close()
  }
  return { results: out }
}

/** Plays a beep through an audio element, which is how Volita plays its voice. Resolves true if the phone allowed it to start. */
export async function playBeep(): Promise<{ started: boolean; stop: () => void }> {
  const url = URL.createObjectURL(new Blob([beepWav() as BlobPart], { type: 'audio/wav' }))
  const audio = new Audio(url)
  const stop = () => {
    audio.pause()
    URL.revokeObjectURL(url)
  }
  try {
    await audio.play()
    return { started: true, stop }
  } catch {
    stop()
    return { started: false, stop }
  }
}

/** Speaks a short phrase with the phone's own voice. False when there is no voice or it would not start. */
export function speakWithPhone(text: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) return resolve(false)
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.onend = () => resolve(true)
    utterance.onerror = () => resolve(false)
    speechSynthesis.cancel()
    speechSynthesis.speak(utterance)
    // Some phones never report the end of a short phrase.
    window.setTimeout(() => resolve(true), 4_000)
  })
}

/** Asks the phone to keep the screen on, then lets go. */
export async function wakeLockCheck(): Promise<CheckResult> {
  if (!('wakeLock' in navigator)) return result('wake-lock', 'Screen stays on', 'warn', 'This phone would not keep the screen on, so it may lock during a long conversation.')
  try {
    const lock = await navigator.wakeLock.request('screen')
    await lock.release()
    return result('wake-lock', 'Screen stays on', 'pass', 'The phone agreed to keep the screen on.')
  } catch {
    return result('wake-lock', 'Screen stays on', 'warn', 'The phone refused (low battery or power saving?), so the screen may lock during a long conversation.')
  }
}

export const yesNo = {
  beepHeard: (heard: boolean): CheckResult =>
    heard
      ? result('sound', 'Sound plays', 'pass', 'You heard the beep.')
      : result('sound', 'Sound plays', 'fail', 'You did not hear the beep. Turn the volume up and, on an iPhone, flip the silent switch (on the side) so no orange shows, then run the check again.'),
  beepBlocked: (): CheckResult => result('sound', 'Sound plays', 'fail', 'The phone would not play a sound. Tap the page once and run the check again.'),
  voiceHeard: (heard: boolean): CheckResult =>
    heard ? result('voice', "Phone's own voice", 'pass', 'You heard it speak.') : result('voice', "Phone's own voice", 'warn', 'You did not hear it. Volita uses its own voice first, so this only matters when that is busy.'),
}
