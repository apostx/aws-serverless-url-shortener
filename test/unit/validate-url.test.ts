import { validateUrl } from '../../lib/lambda/shared/validate-url';

describe('validateUrl', () => {
  it.each([
    'https://aws.amazon.com/lambda',
    'http://example.com',
    'https://example.com:8443/path?q=1#frag',
    'https://sub.domain.example.co.uk/',
  ])('accepts %s', (url) => {
    expect(validateUrl(url)).toEqual({ valid: true });
  });

  it.each([
    ['empty string', ''],
    ['malformed', 'not a url'],
    ['ftp scheme', 'ftp://example.com'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['data scheme', 'data:text/html,hi'],
    ['file scheme', 'file:///etc/passwd'],
    ['localhost', 'http://localhost/admin'],
    ['loopback v4', 'http://127.0.0.1'],
    ['private 10/8', 'http://10.0.0.5'],
    ['private 192.168', 'http://192.168.1.1'],
    ['private 172.16', 'http://172.16.0.1'],
    ['cgnat 100.64', 'http://100.100.0.1'],
    ['cloud metadata', 'http://169.254.169.254/latest/meta-data'],
    ['ipv6 loopback', 'http://[::1]/'],
    ['internal tld', 'http://service.internal'],
    ['.local mdns', 'http://printer.local'],
  ])('rejects %s', (_label, url) => {
    expect(validateUrl(url).valid).toBe(false);
  });

  it('rejects non-string input', () => {
    expect(validateUrl(undefined).valid).toBe(false);
    expect(validateUrl(123).valid).toBe(false);
    expect(validateUrl(null).valid).toBe(false);
  });

  it('rejects URLs longer than the maximum', () => {
    const long = `https://example.com/${'a'.repeat(3000)}`;
    expect(validateUrl(long).valid).toBe(false);
  });
});
