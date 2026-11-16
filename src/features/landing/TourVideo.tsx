import { useState } from 'react'

/** A short silent tour of the app with captions. If the file cannot play, the section says so instead of showing a broken player. */
export function TourVideo() {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return <p className="muted surface p-5 text-sm">The tour video could not be loaded. You can still try the examples above, or start free and look around.</p>
  }

  return (
    <div className="mx-auto w-full max-w-xs" data-testid="tour-video">
      <video
        controls
        playsInline
        preload="metadata"
        poster="/tour/poster.jpg"
        onError={() => setFailed(true)}
        className="w-full rounded-[2rem] border border-(--line) bg-black shadow-2xl shadow-ember-600/20"
        aria-label="A one minute tour of Volita: choose what to write, say it, check the draft, send it, and ask the assistant about your day"
      >
        <source src="/tour/volita-tour.webm" type="video/webm" />
        Your browser cannot play this video.
      </video>
    </div>
  )
}
