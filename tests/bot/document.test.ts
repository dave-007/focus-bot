import { describe, test, expect, beforeEach, mock } from 'bun:test';

const testMocks = (globalThis as any).__testMocks;

// Mock fetch for Telegram file download
const originalFetch = globalThis.fetch;

describe('Document handler', () => {
  beforeEach(() => {
    testMocks.fs.writeFileSyncCalls = [];
    testMocks.fs.existsSyncResult = false; // Files dir doesn't exist yet
    testMocks.query.fn = () => ({
      async *[Symbol.asyncIterator]() {
        yield {
          type: 'result',
          subtype: 'success',
          result: JSON.stringify({
            title: 'Test Document Note',
            tags: ['documents'],
            body: 'A document was shared.\n\n![[test-file.pdf]]',
          }),
        };
      },
    });
  });

  test('ensureFilesDir creates directory when it does not exist', async () => {
    const { ensureFilesDir } = await import('../../src/bot/handlers/document.js');
    testMocks.fs.existsSyncResult = false;
    ensureFilesDir();
    // mkdirSync should have been called (via mocked fs)
    // No error thrown means success
  });

  test('ensureFilesDir skips when directory exists', async () => {
    const { ensureFilesDir } = await import('../../src/bot/handlers/document.js');
    testMocks.fs.existsSyncResult = true;
    ensureFilesDir();
    // Should not throw
  });

  test('handleDocumentMessage downloads file and creates note', async () => {
    testMocks.fs.existsSyncResult = false;

    // Mock fetch to simulate Telegram file download
    globalThis.fetch = (async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
      if (urlStr.includes('api.telegram.org/file/')) {
        return new Response(Buffer.from('fake-pdf-content'), { status: 200 });
      }
      return originalFetch(url);
    }) as typeof fetch;

    const { handleDocumentMessage } = await import('../../src/bot/handlers/document.js');

    let reactedWith: string | null = null;
    let chatAction: string | null = null;

    const ctx = {
      message: {
        message_id: 42,
        document: {
          file_id: 'doc-file-123',
          file_name: 'test-file.pdf',
          mime_type: 'application/pdf',
        },
        caption: 'Check out this document',
      },
      from: { id: 111 },
      chat: { id: 999 },
      api: {
        getFile: async () => ({ file_path: 'documents/test-file.pdf' }),
        sendChatAction: async (_chatId: number, action: string) => {
          chatAction = action;
        },
      },
      react: async (emoji: string) => {
        reactedWith = emoji;
      },
      reply: async () => {},
    } as any;

    await handleDocumentMessage(ctx);

    // File should have been saved (first writeFileSync call = raw file)
    expect(testMocks.fs.writeFileSyncCalls.length).toBeGreaterThanOrEqual(1);
    const fileWriteCall = testMocks.fs.writeFileSyncCalls[0];
    expect(fileWriteCall[0]).toContain('Files');
    expect(fileWriteCall[0]).toContain('test-file.pdf');

    // Note should have been created (second writeFileSync call = markdown note)
    expect(testMocks.fs.writeFileSyncCalls.length).toBeGreaterThanOrEqual(2);
    const noteWriteCall = testMocks.fs.writeFileSyncCalls[1];
    expect(noteWriteCall[0]).toContain('Test Document Note');
    expect(noteWriteCall[0]).toContain('.md');
    expect(noteWriteCall[1]).toContain('![[test-file.pdf]]');

    // Should react with thumbs up
    expect(reactedWith).toBe('👍');

    // Restore fetch
    globalThis.fetch = originalFetch;
  });

  test('handleDocumentMessage uses fallback filename when file_name is missing', async () => {
    testMocks.fs.existsSyncResult = false;

    globalThis.fetch = (async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
      if (urlStr.includes('api.telegram.org/file/')) {
        return new Response(Buffer.from('content'), { status: 200 });
      }
      return originalFetch(url);
    }) as typeof fetch;

    const { handleDocumentMessage } = await import('../../src/bot/handlers/document.js');

    const ctx = {
      message: {
        message_id: 43,
        document: {
          file_id: 'doc-no-name',
          // No file_name
          mime_type: 'text/plain',
        },
        caption: undefined,
      },
      from: { id: 111 },
      chat: { id: 999 },
      api: {
        getFile: async () => ({ file_path: 'documents/file_0.txt' }),
        sendChatAction: async () => {},
      },
      react: async () => {},
      reply: async () => {},
    } as any;

    await handleDocumentMessage(ctx);

    // Should still save a file with a generated name
    expect(testMocks.fs.writeFileSyncCalls.length).toBeGreaterThanOrEqual(1);

    globalThis.fetch = originalFetch;
  });

  test('handleDocumentMessage replies with error on failure', async () => {
    const { handleDocumentMessage } = await import('../../src/bot/handlers/document.js');

    let repliedMessage: string | null = null;
    const ctx = {
      message: {
        message_id: 44,
        document: {
          file_id: 'doc-fail',
          file_name: 'fail.pdf',
        },
      },
      from: { id: 111 },
      chat: { id: 999 },
      api: {
        getFile: async () => {
          throw new Error('Telegram API error');
        },
        sendChatAction: async () => {},
      },
      react: async () => {},
      reply: async (msg: string) => {
        repliedMessage = msg;
      },
    } as any;

    await handleDocumentMessage(ctx);
    expect(repliedMessage).toBe('Failed to save document. Please try again.');
  });

  test('handlePhotoMessage downloads largest photo and creates note', async () => {
    testMocks.fs.existsSyncResult = false;

    globalThis.fetch = (async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
      if (urlStr.includes('api.telegram.org/file/')) {
        return new Response(Buffer.from('fake-image-data'), { status: 200 });
      }
      return originalFetch(url);
    }) as typeof fetch;

    const { handlePhotoMessage } = await import('../../src/bot/handlers/document.js');

    let reactedWith: string | null = null;
    const ctx = {
      message: {
        message_id: 45,
        photo: [
          { file_id: 'small-photo', width: 90, height: 90 },
          { file_id: 'medium-photo', width: 320, height: 320 },
          { file_id: 'large-photo', width: 800, height: 800 },
        ],
        caption: 'Look at this',
      },
      from: { id: 111 },
      chat: { id: 999 },
      api: {
        getFile: async (fileId: string) => {
          expect(fileId).toBe('large-photo'); // Should use largest
          return { file_path: 'photos/photo_123.jpg' };
        },
        sendChatAction: async () => {},
      },
      react: async (emoji: string) => {
        reactedWith = emoji;
      },
      reply: async () => {},
    } as any;

    await handlePhotoMessage(ctx);

    // Photo file should be saved
    expect(testMocks.fs.writeFileSyncCalls.length).toBeGreaterThanOrEqual(1);
    const fileWriteCall = testMocks.fs.writeFileSyncCalls[0];
    expect(fileWriteCall[0]).toContain('Files');
    expect(fileWriteCall[0]).toContain('.jpg');

    expect(reactedWith).toBe('👍');

    globalThis.fetch = originalFetch;
  });

  test('handlePhotoMessage skips when no photos', async () => {
    const { handlePhotoMessage } = await import('../../src/bot/handlers/document.js');

    const ctx = {
      message: { message_id: 46, photo: [] },
      from: { id: 111 },
      chat: { id: 999 },
      api: {},
      react: async () => {},
      reply: async () => {},
    } as any;

    // Should return without error
    await handlePhotoMessage(ctx);
    expect(testMocks.fs.writeFileSyncCalls.length).toBe(0);
  });
});
