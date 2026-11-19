import { describe, expect, it } from 'vitest'
import { asksAboutPerson, chatsNamedIn, guessName, normalise, wantsCatchUp } from './match'

const chats = [
  { chat: 'Abigail Smith', count: 15, lastTime: 300 },
  { chat: 'Sipho Dlamini', count: 2, lastTime: 200 },
  { chat: 'Family 🏠', count: 40, lastTime: 100 },
  { chat: '+27 82 123 4567', count: 1, lastTime: 400 },
  { chat: 'Abigail (work)', count: 3, lastTime: 250 },
]

describe('inbox matching', () => {
  it('ignores accents, case and punctuation', () => {
    expect(normalise('Abigaïl!')).toBe('abigail')
  })

  it('finds the chat for a name said in a sentence, newest first', () => {
    const found = chatsNamedIn('Catch me up with Abigail', chats).map((c) => c.chat)
    expect(found).toEqual(['Abigail Smith', 'Abigail (work)'])
    expect(chatsNamedIn('what did sipho say', chats).map((c) => c.chat)).toEqual(['Sipho Dlamini'])
  })

  it('still finds a name the speech recogniser spelled slightly differently', () => {
    expect(chatsNamedIn('catch me up with Abigale', chats).map((c) => c.chat)).toContain('Abigail Smith')
    expect(chatsNamedIn('what did Sifo say', chats)).toEqual([])
  })

  it('does not match short words, numbers or unrelated names', () => {
    expect(chatsNamedIn('reply to the family', chats).map((c) => c.chat)).toEqual(['Family 🏠'])
    expect(chatsNamedIn('call 0821234567', chats)).toEqual([])
    expect(chatsNamedIn('what is on my agenda', chats)).toEqual([])
  })

  it('recognises a general catch-up request', () => {
    for (const phrase of ['Catch me up', 'what did I miss?', 'Who messaged me?', 'any new messages', 'anything new']) {
      expect(wantsCatchUp(phrase)).toBe(true)
    }
    expect(wantsCatchUp('add a meeting tomorrow at ten')).toBe(false)
  })
})

describe('asking about a person', () => {
  it('tells a named person from a general catch-up', () => {
    for (const phrase of ['Catch me up with Abigail.', 'What did Abigail say?', 'Any messages from Abigail', 'Has Abigail messaged me?', 'tell me what Sipho said']) {
      expect(asksAboutPerson(phrase)).toBe(true)
    }
    for (const phrase of ['Catch me up.', 'what did I miss?', 'add a meeting tomorrow at ten', 'any new messages']) {
      expect(asksAboutPerson(phrase)).toBe(false)
    }
  })

  it('picks out the name that was said', () => {
    expect(guessName('Catch me up with Abigail.')).toBe('Abigail')
    expect(guessName('What did Abigail say?')).toBe('Abigail')
    expect(guessName('any messages from Sipho')).toBe('Sipho')
    expect(guessName('has she messaged me')).toBeNull()
    expect(guessName('what did the supplier say')).toBeNull()
  })
});
