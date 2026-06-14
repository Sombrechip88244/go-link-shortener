// Shared validation logic used by middleware, create handler, and tests.
// Pure functions, no D1/Workers dependencies — safe to import in any runtime.

import reservedWords from '../reserved.json';

export const CODE_REGEX = /^[A-Za-z0-9_-]{1,32}$/;
export const CHARSET = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
export const BLOCKED_PROTOCOLS = ['javascript', 'data', 'file', 'vbscript'];
export const BLOCKED_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]'];
export const RESERVED_WORDS: string[] = reservedWords;

// Static lowercase-keyed lookup for reserved words — used by isReservedCode.
const RESERVED_MAP: Record<string, true> = Object.create(null);
for (const word of RESERVED_WORDS) {
  RESERVED_MAP[word.toLowerCase()] = true;
}

export function validateUrl(input: string | null | undefined): string | null {
  if (input === null || input === undefined) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.length > 2048) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    // Allow bare domains: prepend https:// and try again.
    try {
      url = new URL('https://' + trimmed);
    } catch {
      return null;
    }
  }

  const protocol = url.protocol.replace(':', '').toLowerCase();
  if (BLOCKED_PROTOCOLS.includes(protocol)) return null;
  if (protocol !== 'http' && protocol !== 'https') return null;

  const hostname = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.includes(hostname)) return null;

  // Strip any userinfo (defense in depth — `https://x@y` should never reach D1).
  url.username = '';
  url.password = '';

  return url.href;
}

export function validateCode(input: string | null | undefined): string | null {
  if (input === null || input === undefined) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (!CODE_REGEX.test(trimmed)) return null;
  return trimmed;
}

export function generateCode(): string {
  const buf = new Uint32Array(6);
  crypto.getRandomValues(buf);
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += CHARSET[buf[i] % CHARSET.length];
  }
  return out;
}

export function isReservedCode(code: string | null | undefined): boolean {
  if (typeof code !== 'string' || !code) return true;
  if (code.includes('.')) return true;
  if (code.startsWith('_')) return true;
  if (RESERVED_MAP[code.toLowerCase()]) return true;
  return false;
}
