import { describe, expect, test } from 'bun:test';
import { extractUrls } from '../../src/utils/url.js';

describe('extractUrls', () => {
  test('returns empty array for text with no URLs', () => {
    expect(extractUrls('just some plain text')).toEqual([]);
  });

  test('returns empty array for empty string', () => {
    expect(extractUrls('')).toEqual([]);
  });

  test('extracts a single http URL', () => {
    expect(extractUrls('check out http://example.com')).toEqual([
      'http://example.com',
    ]);
  });

  test('extracts a single https URL', () => {
    expect(extractUrls('visit https://example.com')).toEqual([
      'https://example.com',
    ]);
  });

  test('extracts multiple URLs', () => {
    const text = 'see https://foo.com and http://bar.org for details';
    expect(extractUrls(text)).toEqual([
      'https://foo.com',
      'http://bar.org',
    ]);
  });

  test('deduplicates repeated URLs', () => {
    const text = 'https://example.com is great, visit https://example.com again';
    expect(extractUrls(text)).toEqual(['https://example.com']);
  });

  test('extracts URLs with paths, query params, and fragments', () => {
    const url = 'https://example.com/path/to/page?foo=bar&baz=1#section';
    expect(extractUrls(`here: ${url}`)).toEqual([url]);
  });

  test('ignores non-http protocols like ftp or mailto', () => {
    expect(extractUrls('ftp://files.example.com mailto:user@example.com')).toEqual([]);
  });

  test('extracts URLs surrounded by text', () => {
    const text = 'Start https://a.com middle http://b.com end';
    expect(extractUrls(text)).toEqual(['https://a.com', 'http://b.com']);
  });

  test('handles YouTube URLs', () => {
    const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    expect(extractUrls(url)).toEqual([url]);
  });
});
