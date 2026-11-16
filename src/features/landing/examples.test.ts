import { describe, expect, it } from 'vitest'
import { channelsOf, EXAMPLES } from './examples'

/** Reads "R6 957.50" or "R4 800" as a number. */
const rand = (text: string) => Number(text.replace(/\s/g, '').replace('R', ''))

describe('example jobs', () => {
  it('each offers at least two channels and a draft for each', () => {
    for (const job of EXAMPLES) {
      expect(channelsOf(job).length).toBeGreaterThanOrEqual(2)
      for (const channel of channelsOf(job)) expect((job.drafts[channel] ?? '').length).toBeGreaterThan(40)
    }
  })

  it('the plumber quote adds up, including 15% VAT', () => {
    const quote = EXAMPLES.find((job) => job.id === 'plumber')?.drafts.Quote ?? ''
    const amount = (label: RegExp) => rand(new RegExp(`${label.source}\\s+(R[\\d ]+(?:\\.\\d\\d)?)`).exec(quote)?.[1] ?? 'R0')
    const subtotal = amount(/150 litre geyser/) + amount(/Pressure valve/) + amount(/Labour, 2 hours at R450/)
    expect(subtotal).toBe(amount(/Subtotal/))
    expect(Math.round(subtotal * 0.15 * 100) / 100).toBe(amount(/VAT \(15%\)/))
    expect(Math.round(subtotal * 1.15 * 100) / 100).toBe(amount(/Total/))
  })

  it('the landscaper quote adds up and the deposit is half', () => {
    const quote = EXAMPLES.find((job) => job.id === 'landscaper')?.drafts.Quote ?? ''
    const amount = (label: RegExp) => rand(new RegExp(`${label.source}\\s+(R[\\d ]+(?:\\.\\d\\d)?)`).exec(quote)?.[1] ?? 'R0')
    const total = amount(/Garden clean-up/) + amount(/Lawn, 60 m² at R120/) + amount(/Topsoil and compost/) + amount(/Laying, 2 days labour/)
    expect(total).toBe(amount(/Total \(no VAT charged\)/))
    expect(total / 2).toBe(9250)
    expect(60 * 120).toBe(amount(/Lawn, 60 m² at R120/))
  })
})
