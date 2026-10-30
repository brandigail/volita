import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { UpgradeNote } from '../../components/UpgradeNote'
import { ApiRequestError } from '../../lib/api'
import { addService, addTemplate, deleteService, deleteTemplate, fetchServices, fetchTemplates } from '../../lib/plan-api'
import { usePlan } from '../../providers/usePlan'
import { PRICE_LIMITS, TEMPLATE_LIMITS, type Service, type Template } from '../../types/pricing'

const messageFrom = (err: unknown) => (err instanceof ApiRequestError ? err.message : 'Something went wrong. Please try again.')
const seePlans = () => document.getElementById('plans')?.scrollIntoView({ behavior: 'smooth' })

function PriceList({ canAdd }: { canAdd: boolean }) {
  const [services, setServices] = useState<Service[] | null>(null)
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchServices()
      .then((list) => !cancelled && setServices(list))
      .catch((err: unknown) => !cancelled && setError(messageFrom(err)))
    return () => {
      cancelled = true
    }
  }, [])

  const add = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    try {
      const saved = await addService({ name, price, note: '' })
      setServices((current) => [saved, ...(current ?? [])])
      setName('')
      setPrice('')
    } catch (err) {
      setError(messageFrom(err))
    }
  }

  const remove = async (id: string) => {
    try {
      await deleteService(id)
      setServices((current) => current?.filter((s) => s.id !== id) ?? null)
    } catch (err) {
      setError(messageFrom(err))
    }
  }

  return (
    <div>
      <h3 className="mb-1 text-sm font-bold">Price list</h3>
      <p className="muted mb-2 text-xs">Quotes use these prices. If an item is missing, the assistant asks you for the price.</p>
      {canAdd && (
        <form onSubmit={(e) => void add(e)} className="flex flex-col gap-2 sm:flex-row">
          <input value={name} maxLength={PRICE_LIMITS.name} onChange={(e) => setName(e.target.value)} placeholder="Service, e.g. Retiling per m2" aria-label="Service" className="field flex-1" required />
          <input value={price} maxLength={PRICE_LIMITS.price} onChange={(e) => setPrice(e.target.value)} placeholder="Price, e.g. R450" aria-label="Price" className="field sm:w-40" required />
          <button type="submit" disabled={!name.trim() || !price.trim()} className="btn btn-primary">
            <Plus className="size-4" aria-hidden="true" />
            Add
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
      {services && services.length > 0 && (
        <ul className="mt-3 divide-y divide-(--line) rounded-xl border border-(--line)">
          {services.map((service) => (
            <li key={service.id} className="flex items-center gap-3 p-3 text-sm">
              <span className="min-w-0 flex-1 truncate">{service.name}</span>
              <span className="font-semibold">{service.price}</span>
              <button type="button" onClick={() => void remove(service.id)} className="btn btn-ghost text-red-600 dark:text-red-400" aria-label={`Delete ${service.name}`}>
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function TemplateList({ canAdd }: { canAdd: boolean }) {
  const [templates, setTemplates] = useState<Template[] | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchTemplates()
      .then((list) => !cancelled && setTemplates(list))
      .catch((err: unknown) => !cancelled && setError(messageFrom(err)))
    return () => {
      cancelled = true
    }
  }, [])

  const add = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    try {
      const saved = await addTemplate({ title, content })
      setTemplates((current) => [saved, ...(current ?? [])])
      setTitle('')
      setContent('')
    } catch (err) {
      setError(messageFrom(err))
    }
  }

  const remove = async (id: string) => {
    try {
      await deleteTemplate(id)
      setTemplates((current) => current?.filter((t) => t.id !== id) ?? null)
    } catch (err) {
      setError(messageFrom(err))
    }
  }

  return (
    <div>
      <h3 className="mb-1 text-sm font-bold">Saved phrases and templates</h3>
      <p className="muted mb-2 text-xs">Payment terms, a standard greeting, directions to your shop. Add them to any draft with one tap.</p>
      {canAdd && (
        <form onSubmit={(e) => void add(e)} className="flex flex-col gap-2">
          <input value={title} maxLength={TEMPLATE_LIMITS.title} onChange={(e) => setTitle(e.target.value)} placeholder="Name, e.g. Payment terms" aria-label="Template name" className="field" required />
          <textarea value={content} maxLength={TEMPLATE_LIMITS.content} onChange={(e) => setContent(e.target.value)} rows={3} placeholder="The text to add" aria-label="Template text" className="field resize-y" required />
          <button type="submit" disabled={!title.trim() || !content.trim()} className="btn btn-primary self-start">
            <Plus className="size-4" aria-hidden="true" />
            Save template
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
      {templates && templates.length > 0 && (
        <ul className="mt-3 divide-y divide-(--line) rounded-xl border border-(--line)">
          {templates.map((template) => (
            <li key={template.id} className="flex items-start gap-3 p-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{template.title}</p>
                <p className="muted line-clamp-2 text-xs">{template.content}</p>
              </div>
              <button type="button" onClick={() => void remove(template.id)} className="btn btn-ghost text-red-600 dark:text-red-400" aria-label={`Delete ${template.title}`}>
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** The price list and saved phrases. Both are Basic features; on Free anything already saved can still be read and deleted. */
export function LibrarySection() {
  const { limits } = usePlan()
  const locked = !limits.priceList && !limits.templates

  return (
    <section aria-labelledby="library-heading" className="mt-10">
      <h2 id="library-heading" className="text-2xl font-extrabold tracking-tight">
        Prices and phrases
      </h2>
      {locked && (
        <div className="mt-3">
          <UpgradeNote message="A price list for quotes and saved phrases are part of the Basic plan." needs="basic" onSeePlans={seePlans} />
        </div>
      )}
      <div className="surface mt-4 flex flex-col gap-6 p-5">
        <PriceList canAdd={limits.priceList} />
        <TemplateList canAdd={limits.templates} />
      </div>
    </section>
  )
}
