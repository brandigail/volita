import { afterEach, describe, expect, it, vi } from 'vitest'
import { describeMediaProblem } from './mediaProblem'

const answer = (status: number, type: string) => vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status, headers: { 'content-type': type } })))

afterEach(() => vi.unstubAllGlobals())

describe('describeMediaProblem', () => {
  it('names the error status when the file is missing', async () => {
    answer(404, 'text/html')
    expect(await describeMediaProblem('/voice/x.wav')).toBe('The server answered 404 for /voice/x.wav.')
  })

  it('says so when a web page was sent instead of the file', async () => {
    answer(200, 'text/html; charset=utf-8')
    expect(await describeMediaProblem('/tour/a.webm')).toBe('The server sent a web page instead of the file /tour/a.webm.')
  })

  it('says the browser could not play a file that was found', async () => {
    answer(200, 'audio/wav')
    expect(await describeMediaProblem('/voice/x.wav')).toContain('could not play it')
  })

  it('says the server cannot be reached when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('network'))))
    expect(await describeMediaProblem('/voice/x.wav')).toContain('could not be reached')
  })
})
