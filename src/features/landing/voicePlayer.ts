/** One audio player for the voice samples, so starting a voice always stops the one before it. */
let current: HTMLAudioElement | null = null

export function stopVoice(): void {
  current?.pause()
  current = null
}

interface Handlers {
  /** Every clip has finished. */
  onEnd: () => void
  /** A clip could not be loaded or played. */
  onError: () => void
}

/** Plays the clips one after another. Rejects if the browser refuses to start the first one (it needs a tap). */
export function playVoice(urls: readonly string[], handlers: Handlers): Promise<void> {
  stopVoice()
  const player = new Audio()
  current = player
  let index = 0
  const next = () => {
    player.src = urls[index] ?? ''
    return player.play()
  }
  player.addEventListener('ended', () => {
    index += 1
    if (index < urls.length) {
      next().catch(handlers.onError)
      return
    }
    if (current === player) current = null
    handlers.onEnd()
  })
  player.addEventListener('error', handlers.onError)
  return next()
}
