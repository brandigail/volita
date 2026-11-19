import { describe, expect, it } from 'vitest'
import { findPromises } from './promises'

// Thursday 19 November 2026.
const now = new Date(2026, 10, 19, 10, 0)
const due = (text: string) => findPromises(text, now).map((promise) => promise.dueOn)

describe('findPromises', () => {
  it('finds a promise for tomorrow', () => {
    expect(due("Hi Mrs Naidoo, I'll send the quote tomorrow.")).toEqual(['2026-11-20'])
  })

  it('finds a promise for a weekday and counts to the next one', () => {
    expect(due('We will be there on Monday morning.')).toEqual(['2026-11-23'])
    expect(due("I'll call you on Thursday.")).toEqual(['2026-11-26'])
  })

  it('understands today, next week and in a few days', () => {
    expect(due("I'll drop it off this afternoon.")).toEqual(['2026-11-19'])
    expect(due('We can start next week.')).toEqual(['2026-11-26'])
    expect(due("I'll get back to you in 3 days.")).toEqual(['2026-11-22'])
    expect(due("I'll come in two weeks.")).toEqual(['2026-12-03'])
  })

  it('reads the date correctly across a month end', () => {
    expect(findPromises("I'll send it tomorrow.", new Date(2026, 10, 30))).toEqual([{ sentence: "I'll send it tomorrow.", dueOn: '2026-12-01' }])
  })

  it('ignores a commitment with no time, and a time with no commitment', () => {
    expect(due("I'll send the quote soon.")).toEqual([])
    expect(due('The geyser costs R4 800 and is on special until Friday.')).toEqual([])
    expect(due('Thank you for your message.')).toEqual([])
  })

  it('finds each promise in a longer message, earliest first, and gives at most three', () => {
    const text = "I'll call you tomorrow. We will come on Monday. I'll send the invoice on Friday. I'll bring the part next week."
    expect(due(text)).toEqual(['2026-11-20', '2026-11-20', '2026-11-23'])
  })

  it('keeps the sentence as written', () => {
    expect(findPromises("Thanks!\nI'll be there on Friday at 9.", now)[0]).toEqual({ sentence: "I'll be there on Friday at 9.", dueOn: '2026-11-20' })
  })
})
