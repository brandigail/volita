/**
 * Says why a sound or video file would not play, in a sentence a person can pass on. The usual cause on a developer's
 * computer is that the server answered with a web page (or an error) instead of the file, which the player cannot read.
 */
export async function describeMediaProblem(url: string): Promise<string> {
  try {
    const response = await fetch(url, { method: 'HEAD', cache: 'no-store' })
    const type = response.headers.get('content-type') ?? 'no type'
    if (!response.ok) return `The server answered ${response.status} for ${url}.`
    if (type.startsWith('text/html')) return `The server sent a web page instead of the file ${url}.`
    return `The file ${url} was found (${type}) but this browser could not play it.`
  } catch {
    return `The file ${url} could not be reached. Check that the app is still running.`
  }
}
