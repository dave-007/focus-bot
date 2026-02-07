import { describe, expect, test, mock, beforeEach, afterAll } from 'bun:test';
import { processNote } from '../../src/services/note-enrichment.js';

// Shared mock state from tests/setup.ts preload
const mocks = (globalThis as any).__testMocks;
const originalFetch = globalThis.fetch;

const NOTE_CONTENT = `---
captured: 2026-02-04T14:34
source: telegram
status: inbox
categories:
  - "[[Captures]]"
topics:
  - "[[Testing]]"
---
Check out https://example.com for details.
`;

const LONG_ARTICLE = 'A'.repeat(300);

function setQueryResponse(response: string) {
  mocks.query.fn = () => ({
    async *[Symbol.asyncIterator]() {
      yield { type: 'result', subtype: 'success', result: response };
    },
  });
}

// Mock fetch for html-metadata (fetchPageMetadata) and html-text (fetchArticleText)
function mockFetch(options: {
  pageTitle?: string;
  pageDescription?: string;
  siteName?: string;
  articleText?: string | null;
} = {}) {
  const { pageTitle = 'Test Page', pageDescription = 'A test description', siteName = 'Example', articleText = LONG_ARTICLE } = options;

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    const accept = (init?.headers as any)?.Accept || '';

    // oEmbed endpoint
    if (urlStr.includes('oembed')) {
      return new Response(JSON.stringify({
        title: pageTitle,
        author_name: pageDescription,
        provider_name: siteName,
      }), { headers: { 'content-type': 'application/json' } });
    }

    // HTML page requests — fetchPageMetadata uses Accept: text/html, fetchArticleText also
    if (accept === 'text/html') {
      const body = articleText !== null
        ? `<html><head>
            <meta property="og:title" content="${pageTitle}">
            <meta property="og:description" content="${pageDescription}">
            <meta property="og:site_name" content="${siteName}">
          </head><body><p>${articleText}</p></body></html>`
        : '';
      return new Response(body, {
        status: articleText !== null ? 200 : 404,
        headers: { 'content-type': 'text/html' },
      });
    }

    return new Response('', { status: 404 });
  }) as typeof fetch;
}

describe('processNote', () => {
  beforeEach(() => {
    mocks.fs.writeFileSyncCalls = [];
    mocks.fs.readFileContent = { '/tmp/test-vault/note.md': NOTE_CONTENT };
    mocks.telegraph.createPageResult = 'https://telegra.ph/test-page';
    setQueryResponse('This is a summary of the article.\n\n- Key point one\n- Key point two');
    mockFetch();
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  test('returns immediately when no URLs provided', async () => {
    const fetchSpy = mock(() => Promise.resolve(new Response()));
    globalThis.fetch = fetchSpy as typeof fetch;

    await processNote('/tmp/test-vault/note.md', []);

    // No fetch calls should have been made for enrichment
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('enriches generic URL with article summary', async () => {
    await processNote('/tmp/test-vault/note.md', ['https://example.com/article']);

    // File should have been written (enrichment appends to body + adds telegraph URL)
    expect(mocks.fs.writeFileSyncCalls.length).toBeGreaterThan(0);
  });

  test('publishes to Telegraph and stores URL in frontmatter', async () => {
    await processNote('/tmp/test-vault/note.md', ['https://example.com/article']);

    // Find the write call that adds telegraph to frontmatter
    const telegraphWrite = mocks.fs.writeFileSyncCalls.find(
      (call: any[]) => typeof call[1] === 'string' && call[1].includes('telegraph:'),
    );
    expect(telegraphWrite).toBeDefined();
    expect(telegraphWrite[1]).toContain('telegraph: "https://telegra.ph/test-page"');
  });

  test('sends Telegram notification when tg context provided', async () => {
    const mockSendMessage = mock(() => Promise.resolve({}));
    const mockSetReaction = mock(() => Promise.resolve(true));

    const tg = {
      chatId: 12345,
      messageId: 67890,
      api: { sendMessage: mockSendMessage, setMessageReaction: mockSetReaction } as any,
    };

    await processNote('/tmp/test-vault/note.md', ['https://example.com/article'], tg);

    expect(mockSendMessage).toHaveBeenCalledWith(12345, 'https://telegra.ph/test-page', {
      reply_parameters: { message_id: 67890 },
    });
    expect(mockSetReaction).toHaveBeenCalled();
  });

  test('handles enrichment failures gracefully', async () => {
    mockFetch({ articleText: null, pageTitle: undefined, pageDescription: undefined, siteName: undefined });
    mocks.telegraph.createPageResult = null;

    // Should not throw
    await processNote('/tmp/test-vault/note.md', ['https://example.com/fail']);
  });
});
