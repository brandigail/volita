import { z } from 'zod'

// Shared by the client and the Netlify Functions. Keep this file free of DOM and Node APIs.

/** One item in the user's price list, used when writing quotes. */
export interface Service {
  id: string
  name: string
  price: string
  note: string
}

/** A saved phrase or message the user reuses, such as a standard quote introduction or payment terms. */
export interface Template {
  id: string
  title: string
  content: string
}

export const PRICE_LIMITS = { name: 120, price: 60, note: 200, items: 100 } as const
export const TEMPLATE_LIMITS = { title: 80, content: 1_500, items: 50 } as const

export const serviceInputSchema = z.object({
  name: z.string().trim().min(1).max(PRICE_LIMITS.name),
  price: z.string().trim().min(1).max(PRICE_LIMITS.price),
  note: z.string().trim().max(PRICE_LIMITS.note).default(''),
})
export type ServiceInput = z.infer<typeof serviceInputSchema>

export const templateInputSchema = z.object({
  title: z.string().trim().min(1).max(TEMPLATE_LIMITS.title),
  content: z.string().trim().min(1).max(TEMPLATE_LIMITS.content),
})
export type TemplateInput = z.infer<typeof templateInputSchema>
