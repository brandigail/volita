import { useCallback, useEffect, useState } from 'react'

/** Something another app handed to Apex Voice: a message to reply to, or a voice note to turn into text. */
export type SharedItem = { kind: 'text'; text: string } | { kind: 'audio'; mimeType: string; base64: string }

/** The Android app fires these when WhatsApp (or any app) shares a message or voice note into Apex. */
export const SHARED_AUDIO_EVENT = 'apex:shared-audio'
export const SHARED_TEXT_EVENT = 'apex:shared-text'

const MAX_TEXT = 4_000

interface AudioDetail {
  mimeType: string
  base64: string
}

interface ParkedWindow {
  __apexShared?: SharedItem
}

/** What was shared before the page finished loading: in the address (the installed web app's share target) or parked by the Android app. */
function readInitial(): SharedItem | null {
  const parked = (window as unknown as ParkedWindow).__apexShared
  if (parked) return parked
  const params = new URLSearchParams(window.location.search)
  if (!params.has('text') && !params.has('url') && !params.has('title')) return null
  const text = [params.get('title'), params.get('text'), params.get('url')].filter(Boolean).join('\n').trim()
  return text ? { kind: 'text', text: text.slice(0, MAX_TEXT) } : null
}

/** Collects shared content and hands it over once the person is signed in. */
export function useSharedContent(signedIn: boolean): { shared: SharedItem | null; clear: () => void } {
  const [shared, setShared] = useState<SharedItem | null>(readInitial)

  useEffect(() => {
    // The share is held in state now, so the address and the parked copy are no longer needed.
    delete (window as unknown as ParkedWindow).__apexShared
    const params = new URLSearchParams(window.location.search)
    if (['title', 'text', 'url'].some((key) => params.has(key))) {
      for (const key of ['title', 'text', 'url']) params.delete(key)
      const rest = params.toString()
      window.history.replaceState(null, '', rest ? `${window.location.pathname}?${rest}` : window.location.pathname)
    }
  }, [])

  useEffect(() => {
    const onText = (event: Event) => setShared({ kind: 'text', text: String((event as CustomEvent<string>).detail).slice(0, MAX_TEXT) })
    const onAudio = (event: Event) => {
      const detail = (event as CustomEvent<AudioDetail>).detail
      setShared({ kind: 'audio', mimeType: detail.mimeType, base64: detail.base64 })
    }
    window.addEventListener(SHARED_TEXT_EVENT, onText)
    window.addEventListener(SHARED_AUDIO_EVENT, onAudio)
    return () => {
      window.removeEventListener(SHARED_TEXT_EVENT, onText)
      window.removeEventListener(SHARED_AUDIO_EVENT, onAudio)
    }
  }, [])

  const clear = useCallback(() => setShared(null), [])
  return { shared: signedIn ? shared : null, clear }
}
