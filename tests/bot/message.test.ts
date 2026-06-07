import { describe, expect, test, mock, beforeEach, afterAll } from 'bun:test';
import { handleTextMessage, flushBuffer, extractForwardInfo } from '../../src/bot/handlers/message.js';

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

function createMockContext(text?: string, options?: { forward_origin?: any }) {
  return {
    message: text !== undefined ? { text, message_id: 42, ...options } : undefined,
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
    mocks.fs.existsSyncResult = false;
    mocks.telegraph.createPageResult = null;
    setQueryResponse(defaultMetadata);
    globalThis.fetch = (async () => new Response('', { status: 404 })) as typeof fetch;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  test('buffers message and captures on flush', async () => {
    const ctx = createMockContext('A thought worth saving');

    await handleTextMessage(ctx);

    // Not yet captured (buffered)
    expect(mocks.fs.writeFileSyncCalls.length).toBe(0);

    // Flush manually
    await flushBuffer(111);

    expect(ctx.api.sendChatAction).toHaveBeenCalledWith(12345, 'typing');
    expect(ctx.react).toHaveBeenCalledWith('👍');
    expect(mocks.fs.writeFileSyncCalls.length).toBe(1);
  });

  test('returns early when no text', async () => {
    const ctx = createMockContext();

    await handleTextMessage(ctx);

    expect(mocks.fs.writeFileSyncCalls.length).toBe(0);
    expect(ctx.react).not.toHaveBeenCalled();
  });

  test('merges rapid-fire messages into single note', async () => {
    const ctx1 = createMockContext('First thought');
    const ctx2 = createMockContext('Second thought');

    await handleTextMessage(ctx1);
    await handleTextMessage(ctx2);

    await flushBuffer(111);

    expect(mocks.fs.writeFileSyncCalls.length).toBe(1);
    // Reacts on the last context
    expect(ctx2.react).toHaveBeenCalledWith('👍');
  });

  test('falls back to raw capture when all models fail', async () => {
    setQueryError();
    const ctx = createMockContext('A failing message');

    await handleTextMessage(ctx);
    await flushBuffer(111);

    expect(mocks.fs.writeFileSyncCalls.length).toBe(1);
    expect(ctx.react).toHaveBeenCalledWith('👍');
  });

  test('parses prefix tags and applies to note', async () => {
    const ctx = createMockContext('+recipe ^food My pasta recipe');

    await handleTextMessage(ctx);
    await flushBuffer(111);

    expect(mocks.fs.writeFileSyncCalls.length).toBe(1);
    const [, content] = mocks.fs.writeFileSyncCalls[0];
    expect(content).toContain('  - food');
    expect(content).toContain('  - recipe');
  });

  test('includes forward metadata in frontmatter', async () => {
    const ctx = createMockContext('Forwarded content', {
      forward_origin: {
        type: 'channel',
        date: 1715100600, // 2024-05-07T14:30:00Z
        chat: { title: 'My Channel' },
        message_id: 999,
      },
    });

    await handleTextMessage(ctx);
    await flushBuffer(111);

    expect(mocks.fs.writeFileSyncCalls.length).toBe(1);
    const [, content] = mocks.fs.writeFileSyncCalls[0];
    expect(content).toContain('forwarded_from: "My Channel"');
  });
});

describe('extractForwardInfo', () => {
  test('extracts channel forward info', () => {
    const msg = {
      forward_origin: {
        type: 'channel' as const,
        date: 1715100600,
        chat: { title: 'Tech News' },
        message_id: 123,
        author_signature: 'Editor',
      },
    };

    const info = extractForwardInfo(msg as any);
    expect(info?.from).toBe('Tech News');
    expect(info?.author).toBe('Editor');
    expect(info?.originalDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  test('extracts user forward info', () => {
    const msg = {
      forward_origin: {
        type: 'user' as const,
        date: 1715100600,
        sender_user: { first_name: 'John', last_name: 'Doe', username: 'johndoe' },
      },
    };

    const info = extractForwardInfo(msg as any);
    expect(info?.from).toBe('John Doe');
    expect(info?.author).toBe('johndoe');
  });

  test('extracts hidden_user forward info', () => {
    const msg = {
      forward_origin: {
        type: 'hidden_user' as const,
        date: 1715100600,
        sender_user_name: 'Anonymous',
      },
    };

    const info = extractForwardInfo(msg as any);
    expect(info?.from).toBe('Anonymous');
    expect(info?.author).toBeNull();
  });

  test('returns undefined for non-forwarded messages', () => {
    const info = extractForwardInfo({ text: 'hello' } as any);
    expect(info).toBeUndefined();
  });
});
