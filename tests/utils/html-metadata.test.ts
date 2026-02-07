import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { fetchPageMetadata } from '../../src/utils/html-metadata.js';

function mockFetchResponse(body: string | object, options: { status?: number; contentType?: string } = {}) {
  const { status = 200, contentType } = options;
  const isJson = typeof body === 'object';
  const responseBody = isJson ? JSON.stringify(body) : body;
  const ct = contentType || (isJson ? 'application/json' : 'text/html; charset=utf-8');
  return Promise.resolve(new Response(responseBody, {
    status,
    headers: { 'content-type': ct },
  }));
}

describe('fetchPageMetadata', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  test('uses oEmbed for YouTube URLs', async () => {
    globalThis.fetch = mock(() => mockFetchResponse({
      title: 'Rick Astley - Never Gonna Give You Up',
      author_name: 'Rick Astley',
      provider_name: 'YouTube',
    }));
    try {
      const result = await fetchPageMetadata('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(result.title).toBe('Rick Astley - Never Gonna Give You Up');
      expect(result.description).toBe('by Rick Astley');
      expect(result.siteName).toBe('YouTube');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('extracts Open Graph metadata from HTML', async () => {
    const html = `<html><head>
      <meta property="og:title" content="Test Article">
      <meta property="og:description" content="A test description">
      <meta property="og:site_name" content="Example Site">
    </head><body></body></html>`;

    globalThis.fetch = mock(() => mockFetchResponse(html));
    try {
      const result = await fetchPageMetadata('https://example.com/article');
      expect(result.title).toBe('Test Article');
      expect(result.description).toBe('A test description');
      expect(result.siteName).toBe('Example Site');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('falls back to <title> tag when no og:title', async () => {
    const html = `<html><head><title>Fallback Title</title></head><body></body></html>`;

    globalThis.fetch = mock(() => mockFetchResponse(html));
    try {
      const result = await fetchPageMetadata('https://example.com/basic');
      expect(result.title).toBe('Fallback Title');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('returns null fields when fetch fails', async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('Network error')));
    try {
      const result = await fetchPageMetadata('https://example.com/fail');
      expect(result.title).toBeNull();
      expect(result.description).toBeNull();
      expect(result.siteName).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('returns null fields for HTTP error', async () => {
    globalThis.fetch = mock(() => mockFetchResponse('Server Error', { status: 500 }));
    try {
      const result = await fetchPageMetadata('https://example.com/error');
      expect(result.title).toBeNull();
      expect(result.description).toBeNull();
      expect(result.siteName).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('handles meta tags with reversed attribute order', async () => {
    const html = `<html><head>
      <meta content="Reversed Title" property="og:title">
      <meta content="Reversed Desc" name="description">
    </head><body></body></html>`;

    globalThis.fetch = mock(() => mockFetchResponse(html));
    try {
      const result = await fetchPageMetadata('https://example.com/reversed');
      expect(result.title).toBe('Reversed Title');
      expect(result.description).toBe('Reversed Desc');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
