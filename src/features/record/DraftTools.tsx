import { FileText, Loader2, Wand2 } from 'lucide-react'
import { useState } from 'react'
import { UpgradeNote } from '../../components/UpgradeNote'
import { ApiRequestError, generateDraft } from '../../lib/api'
import { authClient } from '../../lib/auth-client'
import { profileFromUser } from '../../lib/profile'
import { addTemplate, fetchTemplates } from '../../lib/plan-api'
import { buildQuotePdf, deliverPdf } from '../../lib/quote-pdf'
import { usePlan } from '../../providers/usePlan'
import type { GeneratedDraft } from '../../types/draft'
import type { Template } from '../../types/pricing'
import { TONES } from '../../types/tones'
import { effectiveSpoken, effectiveWrite } from '../language/languageSettings'

interface DraftToolsProps {
  draft: GeneratedDraft
  transcript: string
  onChange: (patch: Partial<GeneratedDraft>) => void
  onSeePlans: () => void
}

/** Extras under the draft text: rewrite in another tone (Pro), saved phrases (Basic) and a quote PDF (Basic). */
export function DraftTools({ draft, transcript, onChange, onSeePlans }: DraftToolsProps) {
  const { limits, refresh } = usePlan()
  const { data: session } = authClient.useSession()
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; upgrade?: 'basic' | 'pro' } | null>(null)
  const [templates, setTemplates] = useState<Template[] | null>(null)

  const run = async (name: string, work: () => Promise<void>) => {
    setBusy(name)
    setMessage(null)
    try {
      await work()
    } catch (err) {
      const upgrade = err instanceof ApiRequestError && err.upgrade && err.upgrade !== 'free' ? err.upgrade : undefined
      setMessage({ text: err instanceof ApiRequestError ? err.message : 'That did not work. Please try again.', upgrade })
    } finally {
      setBusy(null)
    }
  }

  const rewrite = (tone: string) =>
    run(tone, async () => {
      const next = await generateDraft(transcript, draft.category, effectiveWrite(limits.anyLanguage), effectiveSpoken(limits.anyLanguage), tone)
      onChange({ subject: next.subject, body: next.body })
      refresh()
    })

  const openTemplates = () =>
    run('templates', async () => {
      if (templates === null) setTemplates(await fetchTemplates())
    })

  const saveAsTemplate = () =>
    run('save-template', async () => {
      const title = (draft.subject || draft.body).slice(0, 60).trim() || 'Saved message'
      const saved = await addTemplate({ title, content: draft.body.slice(0, 1_500) })
      setTemplates((current) => [saved, ...(current ?? [])])
      setMessage({ text: 'Saved. You can insert it into any draft.' })
    })

  const makePdf = () =>
    run('pdf', async () => {
      if (!session) return
      await deliverPdf(await buildQuotePdf(draft, profileFromUser(session.user)))
    })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <Wand2 className="size-4 text-ember-400" aria-hidden="true" />
          Rewrite
        </span>
        {TONES.map((tone) => (
          <button
            key={tone.id}
            type="button"
            disabled={busy !== null}
            onClick={() => (limits.toneRewrite ? void rewrite(tone.id) : setMessage({ text: 'Rewriting in a different tone is part of the Pro plan.', upgrade: 'pro' }))}
            className={`rounded-full border px-3 py-1 text-xs font-semibold hover:border-brand-500 ${limits.toneRewrite ? 'border-(--line) bg-(--surface)' : 'border-(--line) bg-(--surface) opacity-60'}`}
          >
            {busy === tone.id ? <Loader2 className="inline size-3 animate-spin" aria-label="Rewriting" /> : tone.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => (limits.templates ? void openTemplates() : setMessage({ text: 'Saved templates are part of the Basic plan.', upgrade: 'basic' }))}
          className="btn btn-ghost"
        >
          <FileText className="size-4" aria-hidden="true" />
          Templates
        </button>
        {draft.category === 'QUOTE' && (
          <button
            type="button"
            disabled={busy !== null || draft.body.trim() === ''}
            onClick={() => (limits.quotePdf ? void makePdf() : setMessage({ text: 'Quote PDFs are part of the Basic plan.', upgrade: 'basic' }))}
            className="btn btn-ghost"
          >
            {busy === 'pdf' ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <FileText className="size-4" aria-hidden="true" />}
            Quote as PDF
          </button>
        )}
      </div>

      {templates !== null && (
        <div className="rounded-2xl border border-(--line) p-3">
          {templates.length === 0 && <p className="muted text-sm">No templates yet. Save this message to reuse it.</p>}
          <ul className="space-y-2">
            {templates.map((template) => (
              <li key={template.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate font-semibold">{template.title}</span>
                <button type="button" className="btn btn-ghost px-3 py-1 text-xs" onClick={() => onChange({ body: `${draft.body.trimEnd()}\n\n${template.content}` })}>
                  Add to draft
                </button>
              </li>
            ))}
          </ul>
          <button type="button" disabled={busy !== null || draft.body.trim() === ''} onClick={() => void saveAsTemplate()} className="btn btn-ghost mt-3 text-xs">
            Save this message as a template
          </button>
        </div>
      )}

      {message &&
        (message.upgrade ? (
          <UpgradeNote message={message.text} needs={message.upgrade} onSeePlans={onSeePlans} />
        ) : (
          <p role="status" className="muted text-sm">
            {message.text}
          </p>
        ))}
    </div>
  )
}
