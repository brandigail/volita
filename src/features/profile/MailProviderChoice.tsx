import { Mail } from 'lucide-react'
import { GMAIL_CONNECT_URL, OUTLOOK_CONNECT_URL } from '../../lib/mail-api'
import { MAIL_PRESETS, type MailProviderId, type MailStatus } from '../../types/mail'

interface MailProviderChoiceProps {
  status: MailStatus
  /** For services connected with an app password: open the form for that one. */
  onChoose: (provider: MailProviderId) => void
}

/** One button per email service. Gmail and Outlook go to their own sign-in; the rest open the app password form. */
export function MailProviderChoice({ status, onChoose }: MailProviderChoiceProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold">Which email do you use?</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="list" aria-label="Email services">
        {MAIL_PRESETS.map((preset) => {
          const label = (
            <>
              <Mail className="size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 text-left leading-tight">{preset.label}</span>
            </>
          )
          // Long names ("Outlook or Hotmail") wrap onto two lines on a phone instead of being cut off.
          const shape = 'btn btn-ghost h-full justify-start py-2'
          if (preset.kind === 'password') {
            return (
              <button key={preset.id} role="listitem" type="button" className={shape} onClick={() => onChoose(preset.id)}>
                {label}
              </button>
            )
          }
          const ready = preset.kind === 'google' ? status.googleReady : status.microsoftReady
          const href = preset.kind === 'google' ? GMAIL_CONNECT_URL : OUTLOOK_CONNECT_URL
          return ready ? (
            <a key={preset.id} role="listitem" href={href} className={shape}>
              {label}
            </a>
          ) : (
            <span key={preset.id} role="listitem" aria-disabled="true" title="Not set up yet" className={`${shape} cursor-not-allowed opacity-50`}>
              {label}
              <span className="muted ml-auto text-[10px] font-semibold uppercase">Soon</span>
            </span>
          )
        })}
      </div>
      <p className="muted text-xs">
        Gmail and Outlook open their own sign-in page. For the others you make an app password in your email account, a separate password just for Volita that you can cancel there at any time.
      </p>
    </div>
  )
}
