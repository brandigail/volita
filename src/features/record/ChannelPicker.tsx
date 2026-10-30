import { Lock } from 'lucide-react'
import type { CSSProperties } from 'react'
import { ChannelIcon } from '../../components/ChannelIcon'
import { CHANNELS, channelFor } from '../../lib/channels'
import type { DraftCategory } from '../../types/draft'

interface ChannelPickerProps {
  value: DraftCategory
  onChange: (channel: DraftCategory) => void
  /** Channels the plan includes; the rest show a lock and ask to upgrade when tapped. */
  allowed: readonly DraftCategory[]
  onLocked: (channel: DraftCategory) => void
}

/** Choosing where the message is going before recording lets the AI write it in the right style. */
export function ChannelPicker({ value, onChange, allowed, onLocked }: ChannelPickerProps) {
  return (
    <div className="w-full" data-tour="channels">
      <div role="radiogroup" aria-label="Record for" className="grid grid-cols-4 gap-2 sm:gap-3">
        {CHANNELS.map((channel) => {
          const selected = channel.id === value
          const locked = !allowed.includes(channel.id)
          return (
            <button
              key={channel.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => (locked ? onLocked(channel.id) : onChange(channel.id))}
              style={{ '--c1': channel.from, '--c2': channel.to } as CSSProperties}
              className={`group relative flex flex-col items-center gap-2 rounded-2xl border px-1 py-3 text-xs font-semibold ${locked ? 'opacity-60 ' : ''}${
                selected
                  ? 'border-(--c1) bg-(--surface-strong) shadow-[0_0_0_1px_var(--c1),0_14px_34px_-14px_var(--c1)]'
                  : 'border-(--line) bg-(--surface) hover:-translate-y-0.5 hover:border-(--c1)'
              }`}
            >
              <span
                className={`flex size-11 items-center justify-center rounded-xl bg-linear-to-br from-(--c1) to-(--c2) text-white shadow-md transition-transform group-hover:scale-105 ${
                  selected ? 'scale-105' : 'opacity-90'
                }`}
              >
                <ChannelIcon category={channel.id} className="size-5" />
              </span>
              {channel.label}
              {locked && <Lock className="absolute top-1.5 right-1.5 size-3 text-violet-400" aria-label="Part of a paid plan" />}
            </button>
          )
        })}
      </div>
      <p className="muted mt-3 text-center text-sm" aria-live="polite">
        {channelFor(value).hint}
      </p>
    </div>
  )
}
