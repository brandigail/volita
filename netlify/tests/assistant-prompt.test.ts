import { describe, expect, it } from 'vitest'
import type { Profile } from '../../src/types/profile.ts'
import { assistantSystemPrompt } from '../functions/_lib/assistant-prompt.ts'

const profile: Profile = { name: 'Sam', businessName: 'Dube Plumbing', role: '', phone: '', signature: '', calendarUrl: '', nickname: '', businessAbout: '' }

describe('assistantSystemPrompt: WhatsApp reading', () => {
  it('tells the assistant it cannot read WhatsApp by itself where the app cannot', () => {
    const prompt = assistantSystemPrompt(profile, 'Africa/Johannesburg', '', 'full', false, { inboxAvailable: false })
    expect(prompt).toContain('This device cannot read WhatsApp by itself')
  })

  it('leaves that out in the Android app, which can', () => {
    const prompt = assistantSystemPrompt(profile, 'Africa/Johannesburg', '', 'full', false, { inboxAvailable: true })
    expect(prompt).not.toContain('This device cannot read WhatsApp by itself')
  })
})
