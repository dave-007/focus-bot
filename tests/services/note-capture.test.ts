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
  tags: ['ideas'],
  body: 'This is a [[test]] note about [[software testing]].',
};

describe('captureNote', () => {
  beforeEach(() => {
    mocks.fs.writeFileSyncCalls = [];
    mocks.fs.existsSyncResult = false;
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
    expect(content).toContain('tags:');
    expect(content).toContain('  - captures');
    expect(content).toContain('  - ideas');
    expect(content).toContain('[[test]]');
  });

  test('routes URL messages to Bookmarks directory', async () => {
    setQueryResponse({
      title: 'Interesting Article',
      tags: ['links', 'articles'],
      body: 'Check out https://example.com/article about [[technology]].',
    });
    mockFetch({ title: 'Example Article', description: 'A great article', siteName: 'Example' });

    const result = await captureNote('https://example.com/article');

    expect(result.urls).toEqual(['https://example.com/article']);
    expect(result.filePath).toStartWith('/tmp/test-vault/Bookmarks/');

    const [, content] = mocks.fs.writeFileSyncCalls[0];
    expect(content).toContain('url: "https://example.com/article"');
  });

  test('always includes captures tag', async () => {
    setQueryResponse({
      title: 'No Captures Tag',
      tags: ['ideas'],
      body: 'Body text.',
    });

    await captureNote('Some thought');

    const [, content] = mocks.fs.writeFileSyncCalls[0];
    expect(content).toContain('  - captures');
  });

  test('generates safe filename from title', async () => {
    setQueryResponse({
      title: 'A Title With Spaces',
      tags: ['ideas'],
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

  test('appends timestamp to filename when file already exists', async () => {
    // Simulate that the first filename attempt already exists on disk
    mocks.fs.existsSyncResult = (p: string) => {
      // Only the initial "Test Note Title.md" exists, the timestamped one does not
      return p.endsWith('Test Note Title.md');
    };

    const result = await captureNote('Some thought');

    // Should NOT be the bare title — should have a timestamp appended
    expect(result.filePath).not.toEndWith('Test Note Title.md');
    expect(result.filePath).toMatch(/Test Note Title \d+\.md$/);
    expect(result.filePath).toStartWith('/tmp/test-vault/');
  });
});
