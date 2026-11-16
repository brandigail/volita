import { describe, expect, it } from 'vitest'
import { classifyApproval } from './approval'

describe('classifyApproval', () => {
  it('hears plain agreement to send, however it is phrased', () => {
    for (const said of ['Send it', 'send', 'Yes, send it.', 'yes send it please', 'Go ahead', 'Okay, go ahead!', 'Please send that off', 'yeah send the email', 'Do it', 'Send the reply now']) {
      expect(classifyApproval(said, false)).toBe('send')
      expect(classifyApproval(said, true)).toBe('send')
    }
  })

  it('counts a bare "yes" only straight after the email was announced', () => {
    for (const said of ['Yes', 'yeah', 'Yes please.', 'looks good', "That's fine", 'okay']) {
      expect(classifyApproval(said, true)).toBe('send')
      expect(classifyApproval(said, false)).toBeNull()
    }
  })

  it('hears a clear cancel, and a plain "no" only straight after the announcement', () => {
    for (const said of ['Cancel', 'cancel that', "Don't send it", 'do not send', 'scrap it', 'Discard that']) {
      expect(classifyApproval(said, false)).toBe('cancel')
    }
    for (const said of ['No', 'nope', 'Never mind.', 'stop']) {
      expect(classifyApproval(said, true)).toBe('cancel')
      expect(classifyApproval(said, false)).toBeNull()
    }
  })

  it('treats anything else as a normal question, including requests for changes and mumbles', () => {
    for (const said of [
      '',
      '   ',
      'Thank you.',
      'hmm',
      'Change the price to R13 000 and send it',
      'make it shorter',
      'Send it to Sam as well',
      'Send Jan a message about the deck',
      'Should I send it?',
      'Send me my agenda',
      'What did the supplier say?',
      'I will send it later',
    ]) {
      expect(classifyApproval(said, true)).toBeNull()
      expect(classifyApproval(said, false)).toBeNull()
    }
  })
})
