// Shared by the client and the Netlify Functions. Keep this file free of DOM and Node APIs.

export interface Tone {
  id: string
  label: string
  /** Instruction given to the writing model. */
  instruction: string
}

/** Ways to rewrite a draft (Pro). The facts never change, only how the message sounds. */
export const TONES: readonly Tone[] = [
  { id: 'friendly', label: 'Friendlier', instruction: 'warm, friendly and approachable, like writing to someone you get on well with' },
  { id: 'formal', label: 'More formal', instruction: 'formal and professional, with polished wording and no slang or contractions' },
  { id: 'short', label: 'Shorter', instruction: 'as short and direct as possible while keeping every fact, price, date and name' },
  { id: 'firm', label: 'Firmer', instruction: 'polite but firm and clear, suitable for chasing a payment or a reply, never rude' },
  { id: 'casual', label: 'More casual', instruction: 'relaxed and casual, the way a friend would text' },
]

export const TONE_IDS: readonly string[] = TONES.map((tone) => tone.id)

export function toneInstruction(id: string | undefined): string | null {
  return TONES.find((tone) => tone.id === id)?.instruction ?? null
}
