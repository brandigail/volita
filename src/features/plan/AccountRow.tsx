import { Ban, RotateCcw, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import type { AdminUser } from '../../types/plan-state'

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

type PlanChoice = 'free' | 'basic' | 'pro'

interface AccountRowProps {
  user: AdminUser
  busy: boolean
  onPlan: (plan: PlanChoice) => void
  onClosed: (closed: boolean, reason?: string) => void
}

/** What the safety checks stopped for this person in the last 30 days, if anything. */
function SafetyBadges({ user }: { user: AdminUser }) {
  const { sensitive, limit, spam } = user.safety
  if (sensitive + limit + spam === 0) return null
  const parts = [sensitive > 0 && `${sensitive} blocked private details`, limit > 0 && `${limit} limit refusals`, spam > 0 && `${spam} spam blocks`].filter(Boolean)
  return (
    <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-amber-800 dark:text-amber-200">
      <ShieldAlert className="size-3.5 shrink-0" aria-hidden="true" />
      {parts.join(' · ')} in 30 days
    </p>
  )
}

/** One account on the owner's list: its plan, its safety record, and closing or reopening it. */
export function AccountRow({ user, busy, onPlan, onClosed }: AccountRowProps) {
  const [confirming, setConfirming] = useState(false)
  const [reason, setReason] = useState('')
  const owner = user.source === 'owner'
  const closed = user.suspendedAt !== null

  return (
    <li className={`surface p-3 ${closed ? 'opacity-80' : ''}`}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{user.name || user.email}</p>
          <p className="muted truncate text-xs">{user.email}</p>
          <p className="muted text-xs">
            {user.drafts} drafts · {user.lastActive ? `last used ${dateFormat.format(new Date(user.lastActive))}` : 'never used'}
            {user.source === 'subscription' && ' · paying'}
          </p>
          {closed && user.suspendedAt && <p className="mt-1 text-xs font-semibold text-red-700 dark:text-red-300">Closed on {dateFormat.format(new Date(user.suspendedAt))}</p>}
          <SafetyBadges user={user} />
        </div>
        <label className="sr-only" htmlFor={`plan-${user.id}`}>
          Plan for {user.email}
        </label>
        <select
          id={`plan-${user.id}`}
          value={user.plan}
          disabled={busy || owner || user.source === 'subscription'}
          onChange={(e) => onPlan(e.target.value as PlanChoice)}
          className="field w-auto"
        >
          <option value="free">Free</option>
          <option value="basic">Basic (free for them)</option>
          <option value="pro">Pro (free for them)</option>
        </select>
        {!owner && closed && (
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => onClosed(false)}>
            <RotateCcw className="size-4" aria-hidden="true" />
            Reopen
          </button>
        )}
        {!owner && !closed && !confirming && (
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setConfirming(true)}>
            <Ban className="size-4" aria-hidden="true" />
            Close account
          </button>
        )}
      </div>
      {confirming && (
        <div role="alertdialog" aria-label={`Close ${user.email}`} className="mt-3 space-y-2 rounded-xl border border-red-500/50 bg-red-500/10 p-3">
          <p className="text-sm">They are signed out at once and cannot sign in again until you reopen the account. Their drafts are kept.</p>
          <label htmlFor={`reason-${user.id}`} className="block text-xs font-semibold">
            Reason (only you see it)
          </label>
          <input id={`reason-${user.id}`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="For example: kept sending card numbers" className="field" />
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => {
                onClosed(true, reason.trim() || undefined)
                setConfirming(false)
              }}
            >
              Close the account
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirming(false)}>
              Keep it open
            </button>
          </div>
        </div>
      )}
    </li>
  )
}
