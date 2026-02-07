import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { fetchArticleText } from '../../src/utils/html-text.js';

// Helper to create a mock fetch Response
function mockFetchResponse(body: string, options: { status?: number; contentType?: string } = {}) {
  const { status = 200, contentType = 'text/html; charset=utf-8' } = options;
  return Promise.resolve(new Response(body, {
    status,
    headers: { 'content-type': contentType },
  }));
}

// Long enough text to pass the 200-char minimum
const LONG_TEXT = 'A'.repeat(250);
const ARTICLE_HTML = `<html><head><title>Test</title></head><body><p>${LONG_TEXT}</p></body></html>`;

describe('fetchArticleText', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  test('extracts text from HTML response', async () => {
    globalThis.fetch = mock(() => mockFetchResponse(ARTICLE_HTML));
    try {
      const result = await fetchArticleText('https://example.com/article');
      expect(result).not.toBeNull();
      expect(result!).toContain('A'.repeat(50));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('returns null for non-HTML content-type', async () => {
    globalThis.fetch = mock(() => mockFetchResponse('{"data": 1}', { contentType: 'application/json' }));
    try {
      const result = await fetchArticleText('https://example.com/api');
      expect(result).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('returns null for HTTP error status', async () => {
    globalThis.fetch = mock(() => mockFetchResponse('Not Found', { status: 404 }));
    try {
      const result = await fetchArticleText('https://example.com/missing');
      expect(result).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('returns null when fetch throws', async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('Network error')));
    try {
      const result = await fetchArticleText('https://example.com/fail');
      expect(result).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('returns null for short content (< 200 chars)', async () => {
    const shortHtml = '<html><body><p>Short text.</p></body></html>';
    globalThis.fetch = mock(() => mockFetchResponse(shortHtml));
    try {
      const result = await fetchArticleText('https://example.com/short');
      expect(result).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('strips script and style tags entirely', async () => {
    const html = `<html><body><script>alert("xss")</script><style>.foo{color:red}</style><p>${LONG_TEXT}</p></body></html>`;
    globalThis.fetch = mock(() => mockFetchResponse(html));
    try {
      const result = await fetchArticleText('https://example.com/page');
      expect(result).not.toBeNull();
      expect(result!).not.toContain('alert');
      expect(result!).not.toContain('color:red');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('decodes HTML entities', async () => {
    const html = `<html><body><p>${'x'.repeat(200)} &amp; &lt;tag&gt; &#39;quoted&#39;</p></body></html>`;
    globalThis.fetch = mock(() => mockFetchResponse(html));
    try {
      const result = await fetchArticleText('https://example.com/entities');
      expect(result).not.toBeNull();
      expect(result!).toContain('& <tag>');
      expect(result!).toContain("'quoted'");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
