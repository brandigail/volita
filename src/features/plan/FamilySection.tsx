import { useEffect, useState } from 'react'
import { ApiRequestError } from '../../lib/api'
import { addInvites, fetchAdminUsers, fetchInvites, removeInvite, setUserPlan, type PlanInvite } from '../../lib/plan-api'
import { usePlan } from '../../providers/usePlan'
import type { AdminUser } from '../../types/plan-state'

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

function Row({ user, busy, onChange }: { user: AdminUser; busy: boolean; onChange: (plan: 'free' | 'basic' | 'pro') => void }) {
  const locked = user.source === 'owner'
  return (
    <li className="surface flex flex-wrap items-center gap-3 p-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{user.name || user.email}</p>
        <p className="muted truncate text-xs">{user.email}</p>
        <p className="muted text-xs">
          {user.drafts} drafts · {user.lastActive ? `last used ${dateFormat.format(new Date(user.lastActive))}` : 'never used'}
          {user.source === 'subscription' && ' · paying'}
        </p>
      </div>
      <label className="sr-only" htmlFor={`plan-${user.id}`}>
        Plan for {user.email}
      </label>
      <select
        id={`plan-${user.id}`}
        value={user.plan}
        disabled={busy || locked || user.source === 'subscription'}
        onChange={(e) => onChange(e.target.value as 'free' | 'basic' | 'pro')}
        className="field w-auto"
      >
        <option value="free">Free</option>
        <option value="basic">Basic (free for them)</option>
        <option value="pro">Pro (free for them)</option>
      </select>
    </li>
  )
}

/** Paste emails once; each person gets the plan the moment they sign up with that address. */
function InviteBox() {
  const [text, setText] = useState('')
  const [plan, setPlan] = useState<'basic' | 'pro'>('pro')
  const [invites, setInvites] = useState<PlanInvite[]>([])
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchInvites()
      .then((list) => !cancelled && setInvites(list))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const add = async () => {
    setBusy(true)
    setNote(null)
    try {
      const result = await addInvites(text, plan)
      setNote(`Added ${result.added}.${result.invalid.length > 0 ? ` Not valid emails: ${result.invalid.join(', ')}` : ''}`)
      setText('')
      setInvites(await fetchInvites())
    } catch (err) {
      setNote(err instanceof ApiRequestError ? err.message : 'Could not add those.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (email: string) => {
    await removeInvite(email).catch(() => undefined)
    setInvites((current) => current.filter((invite) => invite.email !== email))
  }

  return (
    <div className="surface mb-4 p-4">
      <label htmlFor="invite-emails" className="mb-1.5 block text-sm font-semibold">
        Give a plan to people by email
      </label>
      <textarea id="invite-emails" value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Paste emails, one per line or separated by commas" className="field resize-y" />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select aria-label="Plan to give" value={plan} onChange={(e) => setPlan(e.target.value as 'basic' | 'pro')} className="field w-auto">
          <option value="pro">Pro (free for them)</option>
          <option value="basic">Basic (free for them)</option>
        </select>
        <button type="button" onClick={() => void add()} disabled={busy || !text.trim()} className="btn btn-primary">
          {busy ? 'Adding…' : 'Add'}
        </button>
      </div>
      {note && (
        <p role="status" className="muted mt-2 text-sm">
          {note}
        </p>
      )}
      {invites.length > 0 && (
        <ul className="mt-3 divide-y divide-(--line) text-sm">
          {invites.map((invite) => (
            <li key={invite.email} className="flex items-center gap-2 py-2">
              <span className="min-w-0 flex-1 truncate">{invite.email}</span>
              <span className="muted text-xs">{invite.plan === 'pro' ? 'Pro' : 'Basic'} · {invite.signedUp ? 'signed up' : 'waiting'}</span>
              <button type="button" onClick={() => void remove(invite.email)} className="btn btn-ghost px-3 py-1 text-xs">
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Owner only: every account, and who gets Basic or Pro for free. The change applies at once, on the server. */
export function FamilySection() {
  const { state } = usePlan()
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const isOwner = state?.isOwner === true

  useEffect(() => {
    if (!isOwner) return
    let cancelled = false
    fetchAdminUsers()
      .then((list) => !cancelled && setUsers(list))
      .catch((err: unknown) => !cancelled && setError(err instanceof ApiRequestError ? err.message : 'Could not load the accounts.'))
    return () => {
      cancelled = true
    }
  }, [isOwner])

  if (!isOwner) return null

  const change = async (user: AdminUser, plan: 'free' | 'basic' | 'pro') => {
    setBusyId(user.id)
    setError(null)
    try {
      const updated = await setUserPlan(user.id, plan)
      setUsers((current) => current?.map((u) => (u.id === updated.id ? updated : u)) ?? null)
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not change that plan.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section aria-labelledby="family-heading" className="mt-10" data-tour="family">
      <h2 id="family-heading" className="text-2xl font-extrabold tracking-tight">
        Family and friends
      </h2>
      <p className="muted mt-1 mb-4 text-sm">Choose who gets a plan for free. New sign-ups start on Free. Only you can see this.</p>
      {error && (
        <p role="alert" className="mb-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
      <InviteBox />
      {users === null && !error && <p className="muted text-sm">Loading…</p>}
      <ul className="space-y-2">
        {users?.map((user) => (
          <Row key={user.id} user={user} busy={busyId === user.id} onChange={(plan) => void change(user, plan)} />
        ))}
      </ul>
    </section>
  )
}
