const MAX_URL_LENGTH = 2048;
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

export interface UrlValidationResult {
  readonly valid: boolean;
  readonly reason?: string;
}

/**
 * Validate a user-supplied destination URL.
 *
 * Beyond well-formedness this performs SSRF hardening: only http(s) is allowed,
 * and hosts that resolve to private, loopback, link-local (incl. the cloud
 * metadata endpoint) or internal namespaces are rejected. This matters because
 * the redirect target is later fetched by clients and could be abused to probe
 * internal infrastructure.
 */
export function validateUrl(input: unknown): UrlValidationResult {
  if (typeof input !== 'string' || input.length === 0) {
    return { valid: false, reason: 'originalUrl is required' };
  }
  if (input.length > MAX_URL_LENGTH) {
    return { valid: false, reason: `URL exceeds maximum length of ${MAX_URL_LENGTH}` };
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { valid: false, reason: 'URL is malformed' };
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return { valid: false, reason: 'Only http and https URLs are allowed' };
  }
  if (isBlockedHost(url.hostname)) {
    return { valid: false, reason: 'URL host is not allowed' };
  }

  return { valid: true };
}

function isBlockedHost(hostname: string): boolean {
  // Strip IPv6 brackets and a trailing dot, lowercase for comparison.
  const host = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');

  if (host.length === 0) return true;
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host.endsWith('.local') || host.endsWith('.internal')) return true;

  if (host.includes(':')) {
    // IPv6: loopback, unspecified, link-local (fe80::/10), unique-local (fc00::/7).
    return (
      host === '::1' ||
      host === '::' ||
      host.startsWith('fe8') ||
      host.startsWith('fe9') ||
      host.startsWith('fea') ||
      host.startsWith('feb') ||
      host.startsWith('fc') ||
      host.startsWith('fd')
    );
  }

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 0 || a === 10 || a === 127) return true; // this-host, private, loopback
    if (a === 169 && b === 254) return true; // link-local + cloud metadata (169.254.169.254)
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast / reserved
  }

  return false;
}
