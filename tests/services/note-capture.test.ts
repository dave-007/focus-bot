import { describe, expect, test, beforeEach, afterAll } from 'bun:test';
import { captureNote } from '../../src/services/note-capture.js';

// Shared mock state from tests/setup.ts preload
const mocks = (globalThis as any).__testMocks;
const originalFetch = globalThis.fetch;

function setQueryResponse(metadata: object) {
  mocks.query.fn = () => ({
    async *[Symbol.asyncIterator]() {
      yield {
        type: 'result',
        subtype: 'success',
        result: JSON.stringify(metadata),
      };
    },
  });
}

// Mock fetch so fetchPageMetadata (used by captureNote for URL messages) works
function mockFetch(pageMeta: { title?: string; description?: string; siteName?: string } = {}) {
  globalThis.fetch = (async (url: string | URL | Request) => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    if (urlStr.includes('oembed')) {
      return new Response(JSON.stringify({
        title: pageMeta.title ?? null,
        author_name: pageMeta.description?.replace('by ', '') ?? null,
        provider_name: pageMeta.siteName ?? null,
      }), { headers: { 'content-type': 'application/json' } });
    }
    return new Response(
      `<html><head>
        ${pageMeta.title ? `<meta property="og:title" content="${pageMeta.title}">` : ''}
        ${pageMeta.description ? `<meta property="og:description" content="${pageMeta.description}">` : ''}
        ${pageMeta.siteName ? `<meta property="og:site_name" content="${pageMeta.siteName}">` : ''}
      </head><body></body></html>`,
      { headers: { 'content-type': 'text/html' } },
    );
  }) as typeof fetch;
}

const defaultMetadata = {
  title: 'Test Note Title',
  categories: ['Captures', 'Ideas'],
  topics: ['Testing', 'Software'],
  body: 'This is a [[test]] note about [[software testing]].',
};

describe('captureNote', () => {
  beforeEach(() => {
    mocks.fs.writeFileSyncCalls = [];
    setQueryResponse(defaultMetadata);
    mockFetch();
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  test('captures a text message and writes file to NOTES_DIR', async () => {
    const result = await captureNote('This is a test thought about software');

    expect(result.title).toBe('Test Note Title');
    expect(result.filePath).toStartWith('/tmp/test-vault/');
    expect(result.filePath).toEndWith('.md');
    expect(result.filePath).not.toContain('Bookmarks');
    expect(result.urls).toEqual([]);

    expect(mocks.fs.writeFileSyncCalls.length).toBe(1);
    const [, content] = mocks.fs.writeFileSyncCalls[0];

    expect(content).toContain('---');
    expect(content).toContain('source: telegram');
    expect(content).toContain('status: inbox');
    expect(content).toContain('"[[Captures]]"');
    expect(content).toContain('"[[Ideas]]"');
    expect(content).toContain('"[[Testing]]"');
    expect(content).toContain('"[[Software]]"');
    expect(content).toContain('[[test]]');
  });

  test('routes URL messages to Bookmarks directory', async () => {
    setQueryResponse({
      title: 'Interesting Article',
      categories: ['Captures', 'Clippings'],
      topics: ['Web', 'Technology'],
      body: 'Check out https://example.com/article about [[technology]].',
    });
    mockFetch({ title: 'Example Article', description: 'A great article', siteName: 'Example' });

    const result = await captureNote('https://example.com/article');

    expect(result.urls).toEqual(['https://example.com/article']);
    expect(result.filePath).toStartWith('/tmp/test-vault/Bookmarks/');

    const [, content] = mocks.fs.writeFileSyncCalls[0];
    expect(content).toContain('url: "https://example.com/article"');
  });

  test('always includes [[Captures]] category', async () => {
    setQueryResponse({
      title: 'No Captures Category',
      categories: ['Ideas'],
      topics: ['Testing', 'Other'],
      body: 'Body text.',
    });

    await captureNote('Some thought');

    const [, content] = mocks.fs.writeFileSyncCalls[0];
    expect(content).toContain('"[[Captures]]"');
  });

  test('generates safe filename from title', async () => {
    setQueryResponse({
      title: 'A Title With Spaces',
      categories: ['Captures'],
      topics: ['One', 'Two'],
      body: 'Body.',
    });

    const result = await captureNote('Test');
    expect(result.filePath).toEndWith('A Title With Spaces.md');
  });

  test('frontmatter captured date matches YYYY-MM-DDTHH:mm format', async () => {
    await captureNote('Test thought');

    const [, content] = mocks.fs.writeFileSyncCalls[0];
    const match = content.match(/captured: (\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/);
    expect(match).not.toBeNull();
  });
});
