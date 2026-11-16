export type ExampleChannel = 'Quote' | 'WhatsApp' | 'Email'

export interface ExampleJob {
  id: string
  trade: string
  /** What the person says out loud, as they would say it on site. */
  say: string
  /** What Volita writes for each channel. Made-up people, prices and businesses. */
  drafts: Partial<Record<ExampleChannel, string>>
}

/** Ready-made examples for the "try it" section. Every number adds up, and every name is made up. */
export const EXAMPLES: readonly ExampleJob[] = [
  {
    id: 'plumber',
    trade: 'Plumber',
    say: 'Quote for Mrs Jones, 12 Oak Street. New 150 litre geyser, four thousand eight hundred. A pressure valve, three fifty. Two hours labour at four fifty an hour. Add VAT.',
    drafts: {
      Quote: `Quote: geyser replacement, 12 Oak Street

Hi Mrs Jones,

Thank you for having me look at your geyser. Here is my quote:

150 litre geyser            R4 800.00
Pressure valve                R350.00
Labour, 2 hours at R450       R900.00
Subtotal                    R6 050.00
VAT (15%)                     R907.50
Total                       R6 957.50

This quote is valid for 14 days. Let me know and I will book you in.

Kind regards,
Sam Dube
Dube Plumbing
082 000 0000`,
      WhatsApp: `Hi Mrs Jones, it's Sam from Dube Plumbing. Your geyser job comes to R6 957.50 including VAT: geyser R4 800, valve R350 and 2 hours labour R900. The quote is valid for 14 days. Shall I book you in for Thursday?`,
    },
  },
  {
    id: 'electrician',
    trade: 'Electrician',
    say: "Tell Pieter I can come Thursday at nine to fix the distribution board, it'll take about three hours, and ask if someone will be home to let me in.",
    drafts: {
      WhatsApp: `Hi Pieter, it's Lerato from Bright Sparks Electrical. I can come on Thursday at 9:00 to fix your distribution board. It should take about three hours. Will someone be home to let me in? Thanks!`,
      Email: `Subject: Thursday 9:00, distribution board repair

Hi Pieter,

I can be at your house on Thursday at 9:00 to repair the distribution board. The work should take about three hours.

Please let me know if someone will be home to let me in.

Kind regards,
Lerato Mokoena
Bright Sparks Electrical
083 000 0000`,
    },
  },
  {
    id: 'landscaper',
    trade: 'Landscaper',
    say: 'Quote for Mr Naidoo, garden clean-up six and a half thousand, sixty square metres of lawn at a hundred and twenty, topsoil and compost twenty eight hundred, two days laying labour two thousand. No VAT.',
    drafts: {
      Quote: `Quote: garden clean-up and new lawn

Hi Mr Naidoo,

Here is my quote for your garden:

Garden clean-up                   R6 500.00
Lawn, 60 m² at R120               R7 200.00
Topsoil and compost               R2 800.00
Laying, 2 days labour             R2 000.00
Total (no VAT charged)           R18 500.00

A 50% deposit of R9 250.00 secures the date. I can start on the 3rd.

Kind regards,
Themba Khumalo
Green Edge Gardens
084 000 0000`,
      Email: `Subject: Your garden quote

Hi Mr Naidoo,

Thank you for asking me to quote. The garden clean-up and new lawn comes to R18 500, over two days, starting on the 3rd. I ask for a 50% deposit to secure the date.

Let me know if you would like me to go ahead.

Kind regards,
Themba Khumalo
Green Edge Gardens`,
    },
  },
]

/** The channels an example offers, in a steady order. */
export function channelsOf(job: ExampleJob): ExampleChannel[] {
  return (['Quote', 'WhatsApp', 'Email'] as const).filter((channel) => job.drafts[channel] !== undefined)
}
