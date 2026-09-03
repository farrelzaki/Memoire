import { describe, expect, it } from 'vitest';
import { assertPublicHttpUrl, SsrfBlockedError } from './ssrf-guard';

describe('assertPublicHttpUrl', () => {
  it('rejects loopback by literal IP', async () => {
    await expect(assertPublicHttpUrl('http://127.0.0.1/')).rejects.toThrow(SsrfBlockedError);
  });

  it('rejects the "localhost" hostname', async () => {
    await expect(assertPublicHttpUrl('http://localhost:3000/')).rejects.toThrow(SsrfBlockedError);
  });

  it('rejects IPv6 loopback', async () => {
    await expect(assertPublicHttpUrl('http://[::1]/')).rejects.toThrow(SsrfBlockedError);
  });

  it('rejects 10.x private range', async () => {
    await expect(assertPublicHttpUrl('http://10.0.0.5/')).rejects.toThrow(SsrfBlockedError);
  });

  it('rejects 172.16-31.x private range', async () => {
    await expect(assertPublicHttpUrl('http://172.20.3.1/')).rejects.toThrow(SsrfBlockedError);
    await expect(assertPublicHttpUrl('http://172.15.3.1/')).resolves.toBeUndefined();
    await expect(assertPublicHttpUrl('http://172.32.3.1/')).resolves.toBeUndefined();
  });

  it('rejects 192.168.x private range', async () => {
    await expect(assertPublicHttpUrl('http://192.168.1.1/')).rejects.toThrow(SsrfBlockedError);
  });

  it('rejects 169.254.x link-local', async () => {
    await expect(assertPublicHttpUrl('http://169.254.169.254/')).rejects.toThrow(SsrfBlockedError);
  });

  it('rejects non-http(s) schemes', async () => {
    await expect(assertPublicHttpUrl('file:///etc/passwd')).rejects.toThrow(SsrfBlockedError);
    await expect(assertPublicHttpUrl('ftp://example.com/')).rejects.toThrow(SsrfBlockedError);
  });

  it('rejects malformed URLs', async () => {
    await expect(assertPublicHttpUrl('not a url')).rejects.toThrow(SsrfBlockedError);
  });

  it('allows a public IPv4 literal', async () => {
    await expect(assertPublicHttpUrl('http://93.184.216.34/')).resolves.toBeUndefined();
  });
});
