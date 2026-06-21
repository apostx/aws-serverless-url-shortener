import {
  DEFAULT_CODE_LENGTH,
  generateCode,
  isReserved,
  isValidCustomCode,
} from '../../lib/lambda/shared/code';

describe('generateCode', () => {
  it('produces a code of default length from the unambiguous alphabet', () => {
    const code = generateCode();
    expect(code).toHaveLength(DEFAULT_CODE_LENGTH);
    expect(code).not.toMatch(/[01OIl]/);
  });

  it('honours a custom length', () => {
    expect(generateCode(12)).toHaveLength(12);
  });

  it('is practically unique across many draws', () => {
    const codes = new Set(Array.from({ length: 2000 }, () => generateCode()));
    expect(codes.size).toBe(2000);
  });
});

describe('isValidCustomCode', () => {
  it.each(['abc', 'My_Code-1', 'a'.repeat(32)])('accepts %s', (code) => {
    expect(isValidCustomCode(code)).toBe(true);
  });

  it.each(['ab', 'a'.repeat(33), 'has space', 'bad/slash', 'shorten', 'STATS'])(
    'rejects %s',
    (code) => {
      expect(isValidCustomCode(code)).toBe(false);
    },
  );
});

describe('isReserved', () => {
  it('matches reserved words case-insensitively', () => {
    expect(isReserved('Shorten')).toBe(true);
    expect(isReserved('stats')).toBe(true);
    expect(isReserved('anything-else')).toBe(false);
  });
});
