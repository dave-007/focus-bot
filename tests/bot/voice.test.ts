import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { processVoiceSessionInput } from '../../src/bot/handlers/voice.js';
import { deleteSession } from '../../src/services/voice-session.js';

// Shared mock state from tests/setup.ts preload
const mocks = (globalThis as any).__testMocks;

const TELEGRAM_MESSAGE_LIMIT = 4096;

// Use unique user IDs per test to avoid session bleed
let nextUserId = 5000;

function setQueryResponse(response: string) {
  mocks.query.fn = () => ({
    async *[Symbol.asyncIterator]() {
      yield { type: 'result', subtype: 'success', result: response };
    },
  });
}

function setQueryError(subtype = 'error_max_turns') {
  mocks.query.fn = () => ({
    async *[Symbol.asyncIterator]() {
      yield { type: 'result', subtype, result: null };
    },
  });
}

function createMockContext() {
  return {
    api: {
      sendMessage: mock(() => Promise.resolve({ message_id: 99 })),
      editMessageText: mock(() => Promise.resolve(true)),
      sendChatAction: mock(() => Promise.resolve(true)),
    },
    reply: mock(() => Promise.resolve()),
  } as any;
}

describe('processVoiceSessionInput', () => {
  beforeEach(() => {
    mocks.fs.writeFileSyncCalls = [];
    mocks.fs.existsSyncResult = false;
    nextUserId++;
  });

  test('creates draft session and sends preview message', async () => {
    setQueryResponse(JSON.stringify({
      action: 'draft',
      title: 'Test Voice Note',
      tags: ['ideas'],
      body: 'A thought about something.',
    }));

    const ctx = createMockContext();
    const userId = nextUserId;
    await processVoiceSessionInput(ctx, userId, 12345, 'A thought about something');

    expect(ctx.api.sendMessage).toHaveBeenCalled();
    const [chatId, text] = ctx.api.sendMessage.mock.calls[0];
    expect(chatId).toBe(12345);
    expect(text).toContain('*Test Voice Note*');
    expect(text).toContain('_ideas_');
    expect(text).toContain('A thought about something.');

    deleteSession(userId);
  });

  test('truncates long draft messages for Telegram preview', async () => {
    const longBody = 'X'.repeat(5000);
    setQueryResponse(JSON.stringify({
      action: 'draft',
      title: 'Long Note',
      tags: ['captures'],
      body: longBody,
    }));

    const ctx = createMockContext();
    const userId = nextUserId;
    await processVoiceSessionInput(ctx, userId, 12345, 'long input');

    expect(ctx.api.sendMessage).toHaveBeenCalled();
    const [, text] = ctx.api.sendMessage.mock.calls[0];
    expect(text.length).toBeLessThanOrEqual(TELEGRAM_MESSAGE_LIMIT);
    expect(text).toContain('_(truncated for preview)_');
    expect(text).toContain('*Long Note*');

    deleteSession(userId);
  });

  test('does not truncate messages within Telegram limit', async () => {
    setQueryResponse(JSON.stringify({
      action: 'draft',
      title: 'Short Note',
      tags: ['captures'],
      body: 'Brief body.',
    }));

    const ctx = createMockContext();
    const userId = nextUserId;
    await processVoiceSessionInput(ctx, userId, 12345, 'brief input');

    expect(ctx.api.sendMessage).toHaveBeenCalled();
    const [, text] = ctx.api.sendMessage.mock.calls[0];
    expect(text).not.toContain('truncated');
    expect(text).toContain('Brief body.');

    deleteSession(userId);
  });

  test('falls back to raw draft on SDK error_max_turns', async () => {
    setQueryError('error_max_turns');

    const ctx = createMockContext();
    const userId = nextUserId;
    await processVoiceSessionInput(ctx, userId, 12345, 'My voice input');

    // Should still send a draft message (fallback from voice-ai)
    expect(ctx.api.sendMessage).toHaveBeenCalled();
    const [, text] = ctx.api.sendMessage.mock.calls[0];
    expect(text).toContain('My voice input');

    deleteSession(userId);
  });

  test('saves note to vault on save action', async () => {
    // First create a session with a draft
    setQueryResponse(JSON.stringify({
      action: 'draft',
      title: 'Note to Save',
      tags: ['ideas'],
      body: 'Content to save.',
    }));

    const ctx = createMockContext();
    const userId = nextUserId;
    await processVoiceSessionInput(ctx, userId, 12345, 'initial input');

    // Now trigger save
    mocks.fs.writeFileSyncCalls = [];
    setQueryResponse('{"action":"save"}');
    await processVoiceSessionInput(ctx, userId, 12345, 'save');

    expect(mocks.fs.writeFileSyncCalls.length).toBe(1);
    const [filePath, content] = mocks.fs.writeFileSyncCalls[0];
    expect(filePath).toStartWith('/tmp/test-vault/');
    expect(content).toContain('source: telegram-voice');
    expect(content).toContain('Content to save.');
    expect(content).toContain('  - captures');
    expect(content).toContain('  - ideas');
  });

  test('cancel action clears session and shows discard message', async () => {
    // First create a session
    setQueryResponse(JSON.stringify({
      action: 'draft',
      title: 'Temp Note',
      tags: ['captures'],
      body: 'Will be discarded.',
    }));

    const ctx = createMockContext();
    const userId = nextUserId;
    await processVoiceSessionInput(ctx, userId, 12345, 'temp input');

    // Now cancel
    setQueryResponse('{"action":"cancel"}');
    await processVoiceSessionInput(ctx, userId, 12345, 'cancel');

    // editMessageText should be called with discard message
    const editCalls = ctx.api.editMessageText.mock.calls;
    const lastEdit = editCalls[editCalls.length - 1];
    expect(lastEdit[2]).toContain('Draft discarded');
  });
});
