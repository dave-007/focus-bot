import { describe, expect, test, beforeEach } from 'bun:test';
import { processVoiceInput } from '../../src/services/voice-ai.js';

// Shared mock state from tests/setup.ts preload
const mocks = (globalThis as any).__testMocks;

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

/** Track call count to alternate responses across calls */
function setQueryResponses(...responses: Array<{ subtype: string; result: string | null }>) {
  let callIndex = 0;
  mocks.query.fn = () => {
    const resp = responses[Math.min(callIndex++, responses.length - 1)];
    return {
      async *[Symbol.asyncIterator]() {
        yield { type: 'result', ...resp };
      },
    };
  };
}

describe('processVoiceInput', () => {
  beforeEach(() => {
    mocks.fs.writeFileSyncCalls = [];
  });

  test('returns draft result from valid JSON response', async () => {
    setQueryResponse(JSON.stringify({
      action: 'draft',
      title: 'My Voice Note',
      tags: ['ideas'],
      body: 'This is my thought.',
    }));

    const result = await processVoiceInput('This is my thought', null);

    expect(result.action).toBe('draft');
    if (result.action === 'draft') {
      expect(result.title).toBe('My Voice Note');
      expect(result.tags).toEqual(['ideas']);
      expect(result.body).toBe('This is my thought.');
    }
  });

  test('returns save action', async () => {
    setQueryResponse('{"action":"save"}');

    const result = await processVoiceInput('save it', null);
    expect(result.action).toBe('save');
  });

  test('returns cancel action', async () => {
    setQueryResponse('OK cancelling. {"action":"cancel"}');

    const result = await processVoiceInput('cancel', null);
    expect(result.action).toBe('cancel');
  });

  test('extracts JSON embedded in surrounding text', async () => {
    setQueryResponse('Here is the result: {"action":"draft","title":"Test","tags":["captures"],"body":"Body text"} done.');

    const result = await processVoiceInput('test input', null);
    expect(result.action).toBe('draft');
  });

  test('retries once when first response has no valid JSON', async () => {
    setQueryResponses(
      { subtype: 'success', result: 'No JSON here, sorry' },
      { subtype: 'success', result: '{"action":"draft","title":"Retry Note","tags":["ideas"],"body":"From retry"}' },
    );

    const result = await processVoiceInput('test input', null);
    expect(result.action).toBe('draft');
    if (result.action === 'draft') {
      expect(result.title).toBe('Retry Note');
    }
  });

  test('falls back to raw draft when both attempts return no JSON', async () => {
    setQueryResponses(
      { subtype: 'success', result: 'Not JSON at all' },
      { subtype: 'success', result: 'Still not JSON' },
    );

    const result = await processVoiceInput('My important thought about consciousness', null);

    expect(result.action).toBe('draft');
    if (result.action === 'draft') {
      expect(result.body).toBe('My important thought about consciousness');
      expect(result.tags).toEqual(['captures']);
    }
  });

  test('falls back to raw draft when SDK returns error_max_turns', async () => {
    setQueryError('error_max_turns');

    const result = await processVoiceInput('A voice note about quantum physics', null);

    expect(result.action).toBe('draft');
    if (result.action === 'draft') {
      expect(result.body).toBe('A voice note about quantum physics');
      expect(result.tags).toEqual(['captures']);
      expect(result.title).toBe('A voice note about quantum physics');
    }
  });

  test('falls back to raw draft when SDK returns generic error', async () => {
    setQueryError('error');

    const result = await processVoiceInput('Some thought', null);

    expect(result.action).toBe('draft');
    if (result.action === 'draft') {
      expect(result.body).toBe('Some thought');
    }
  });

  test('fallback title strips special characters', async () => {
    setQueryError();

    const result = await processVoiceInput("It's a test! @#$% with symbols & stuff.", null);

    expect(result.action).toBe('draft');
    if (result.action === 'draft') {
      expect(result.title).toBe('Its a test  with symbols  stuff');
    }
  });

  test('fallback uses "Voice Note" for empty input', async () => {
    setQueryError();

    const result = await processVoiceInput('', null);

    expect(result.action).toBe('draft');
    if (result.action === 'draft') {
      expect(result.title).toBe('Voice Note');
    }
  });

  test('fallback truncates long input for title', async () => {
    setQueryError();

    const longInput = 'A'.repeat(100);
    const result = await processVoiceInput(longInput, null);

    expect(result.action).toBe('draft');
    if (result.action === 'draft') {
      expect(result.title.length).toBeLessThanOrEqual(60);
      expect(result.body).toBe(longInput);
    }
  });

  test('returns null from extractResult for invalid schema', async () => {
    setQueryResponse('{"action":"unknown","foo":"bar"}');

    // First call: invalid schema → retry
    // Second call also gets same invalid schema → fallback
    const result = await processVoiceInput('test', null);
    expect(result.action).toBe('draft');
  });
});
