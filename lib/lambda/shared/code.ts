import { randomInt } from 'crypto';

// Unambiguous alphabet: no 0/O/1/I/l to avoid transcription errors (55 chars).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

export const DEFAULT_CODE_LENGTH = 7;
const CUSTOM_CODE_PATTERN = /^[A-Za-z0-9_-]{3,32}$/;

// Paths that are real API routes and must never be claimed as a short code.
const RESERVED_CODES = new Set(['shorten', 'stats', 'health', 'favicon.ico', 'robots.txt']);

/** Generate a collision-resistant random short code using a CSPRNG. */
export function generateCode(length: number = DEFAULT_CODE_LENGTH): string {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}

/** Whether a caller-supplied custom code is well-formed and not reserved. */
export function isValidCustomCode(code: string): boolean {
  return CUSTOM_CODE_PATTERN.test(code) && !isReserved(code);
}

/** Whether a code collides with a reserved API path. */
export function isReserved(code: string): boolean {
  return RESERVED_CODES.has(code.toLowerCase());
}
