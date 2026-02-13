import { describe, expect, test, mock, beforeEach, afterAll } from 'bun:test';
import { handleTextMessage } from '../../src/bot/handlers/message.js';

// Shared mock state from tests/setup.ts preload
const mocks = (globalThis as any).__testMocks;
const originalFetch = globalThis.fetch;

const defaultMetadata = {
  title: 'Test Note',
  tags: ['ideas'],
  body: 'Test body.',
};

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

function setQueryError() {
  mocks.query.fn = () => ({
    async *[Symbol.asyncIterator]() {
      yield { type: 'result', subtype: 'error_max_turns', result: null };
    },
  });
}

function createMockContext(text?: string) {
  return {
    message: text !== undefined ? { text, message_id: 42 } : undefined,
    chat: text !== undefined ? { id: 12345 } : undefined,
    from: text !== undefined ? { id: 111 } : undefined,
    api: {
      sendChatAction: mock(() => Promise.resolve(true)),
      setMessageReaction: mock(() => Promise.resolve(true)),
    },
    react: mock(() => Promise.resolve()),
    reply: mock(() => Promise.resolve()),
  } as any;
}

describe('handleTextMessage', () => {
  beforeEach(() => {
    mocks.fs.writeFileSyncCalls = [];
    mocks.fs.readFileContent = {};
    mocks.telegraph.createPageResult = null;
    setQueryResponse(defaultMetadata);
    // Simple fetch mock — no real network calls
    globalThis.fetch = (async () => new Response('', { status: 404 })) as typeof fetch;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  test('captures note and reacts with thumbs up on success', async () => {
    const ctx = createMockContext('A thought worth saving');

    await handleTextMessage(ctx);

    expect(ctx.api.sendChatAction).toHaveBeenCalledWith(12345, 'typing');
    expect(ctx.react).toHaveBeenCalledWith('👍');
    // File should have been written
    expect(mocks.fs.writeFileSyncCalls.length).toBe(1);
  });

  test('returns early when no text', async () => {
    const ctx = createMockContext();

    await handleTextMessage(ctx);

    expect(mocks.fs.writeFileSyncCalls.length).toBe(0);
    expect(ctx.react).not.toHaveBeenCalled();
  });

  test('replies with error message when capture fails', async () => {
    setQueryError();
    const ctx = createMockContext('A failing message');

    await handleTextMessage(ctx);

    expect(ctx.reply).toHaveBeenCalledWith('Failed to save note. Please try again.');
  });
});
