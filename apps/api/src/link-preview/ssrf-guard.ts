import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfBlockedError';
  }
}

/**
 * §29A.1 rule 3 — reject loopback, private, and link-local ranges, and any
 * scheme other than http/https. Resolves the hostname itself (not just the
 * literal string) so `http://evil.example` that DNS-resolves to 127.0.0.1
 * is still blocked, not just `http://localhost`.
 */
export async function assertPublicHttpUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfBlockedError('Invalid URL');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SsrfBlockedError(`Scheme not allowed: ${url.protocol}`);
  }

  const hostname = url.hostname;
  const addresses: string[] = [];

  if (isIP(hostname)) {
    addresses.push(hostname);
  } else {
    if (hostname === 'localhost') throw new SsrfBlockedError('Loopback host not allowed');
    const results = await lookup(hostname, { all: true });
    addresses.push(...results.map((r) => r.address));
  }

  if (addresses.length === 0) throw new SsrfBlockedError('Could not resolve host');
  for (const address of addresses) {
    if (isPrivateOrLoopback(address)) {
      throw new SsrfBlockedError(`Address not allowed: ${address}`);
    }
  }
}

function isPrivateOrLoopback(address: string): boolean {
  if (isIP(address) === 6) return isPrivateIpv6(address);
  return isPrivateIpv4(address);
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) return true; // malformed → treat as blocked
  const [a, b] = parts;
  if (a === 127) return true; // loopback
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 169 && b === 254) return true; // link-local
  if (a === 0) return true; // "this" network
  return false;
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === '::1') return true; // loopback
  if (normalized.startsWith('fe80:')) return true; // link-local
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // unique local
  if (normalized.startsWith('::ffff:')) {
    return isPrivateIpv4(normalized.slice('::ffff:'.length));
  }
  return false;
}
