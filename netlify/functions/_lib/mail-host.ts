import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

/**
 * Checks a mail server name someone typed before Volita connects to it. Only public servers are allowed: a name that
 * leads to a private, local or reserved address is refused, so the form cannot be used to reach machines that are not
 * meant to be reachable. Volita then connects to the exact address it checked, naming the server for the encryption
 * certificate, so the name cannot be switched to another address in between.
 */

const HOST_NAME = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i

function ipv4Blocked(address: string): boolean {
  const [a, b] = address.split('.').map(Number)
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || // shared address space
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19))
  )
}

function ipv6Blocked(address: string): boolean {
  const lower = address.toLowerCase()
  if (lower === '::' || lower === '::1') return true
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower)
  if (mapped) return ipv4Blocked(mapped[1])
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(lower)
}

export function isPublicAddress(address: string): boolean {
  const version = isIP(address)
  if (version === 4) return !ipv4Blocked(address)
  if (version === 6) return !ipv6Blocked(address)
  return false
}

export type HostCheck = { ok: true; address: string; servername: string } | { ok: false; message: string }

/** For tests only: lets the test servers on this computer through. Never set in production. */
const allowLocal = () => process.env.MAIL_TEST_ALLOW_LOCAL === 'true'

export async function checkMailHost(host: string): Promise<HostCheck> {
  const name = host.trim().toLowerCase().replace(/\.$/, '')
  if (allowLocal() && (name === 'localhost' || name === '127.0.0.1')) return { ok: true, address: '127.0.0.1', servername: 'localhost' }
  if (!HOST_NAME.test(name)) return { ok: false, message: `"${host}" is not a mail server name. It looks like mail.yourbusiness.co.za.` }
  try {
    const found = await lookup(name, { all: true })
    if (found.length === 0) return { ok: false, message: `Could not find the server ${name}. Check the spelling.` }
    if (!found.every((entry) => isPublicAddress(entry.address))) return { ok: false, message: `${name} is not a public mail server.` }
    return { ok: true, address: found[0].address, servername: name }
  } catch {
    return { ok: false, message: `Could not find the server ${name}. Check the spelling.` }
  }
}
