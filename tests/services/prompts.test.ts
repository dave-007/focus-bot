import { describe, expect, test, beforeEach } from 'bun:test';
import { getPrompt, seedPrompts } from '../../src/services/prompts.js';

// Shared mock state from tests/setup.ts preload
const mocks = (globalThis as any).__testMocks;

describe('getPrompt', () => {
  beforeEach(() => {
    mocks.fs.readFileContent = {};
    mocks.fs.writeFileSyncCalls = [];
    mocks.fs.existsSyncResult = false;
  });

  test('returns default prompt when PROMPTS_DIR is null', () => {
    // PROMPTS_DIR is null in test setup (no custom prompts configured)
    const prompt = getPrompt('note-capture');
    expect(prompt).toContain('Analyze this message and generate metadata');
    expect(prompt).toContain('{{message}}');
    expect(prompt).toContain('{{urlContext}}');
  });

  test('returns default voice-assistant prompt', () => {
    const prompt = getPrompt('voice-assistant');
    expect(prompt).toContain('voice note assistant');
    expect(prompt).toContain('Obsidian vault');
    expect(prompt).toContain('"action": "draft"');
  });

  test('returns default video-summary prompt', () => {
    const prompt = getPrompt('video-summary');
    expect(prompt).toContain('detailed, in-depth summary');
    expect(prompt).toContain('{{titleContext}}');
    expect(prompt).toContain('{{transcript}}');
  });

  test('returns default article-summary prompt', () => {
    const prompt = getPrompt('article-summary');
    expect(prompt).toContain('Summarize this article');
    expect(prompt).toContain('{{titleContext}}');
    expect(prompt).toContain('{{articleText}}');
  });

  test('substitutes template variables', () => {
    const prompt = getPrompt('note-capture', {
      message: 'Hello world',
      urlContext: '\n\nSome URL context',
    });
    expect(prompt).toContain('Hello world');
    expect(prompt).toContain('Some URL context');
    expect(prompt).not.toContain('{{message}}');
    expect(prompt).not.toContain('{{urlContext}}');
  });

  test('substitutes empty string for empty variable', () => {
    const prompt = getPrompt('note-capture', {
      message: 'Test',
      urlContext: '',
    });
    expect(prompt).toContain('Test');
    expect(prompt).not.toContain('{{message}}');
    expect(prompt).not.toContain('{{urlContext}}');
  });

  test('leaves unreplaced variables if not provided', () => {
    const prompt = getPrompt('note-capture', { message: 'Test' });
    expect(prompt).toContain('Test');
    expect(prompt).toContain('{{urlContext}}');
  });
});

describe('seedPrompts', () => {
  beforeEach(() => {
    mocks.fs.writeFileSyncCalls = [];
    mocks.fs.existsSyncResult = false;
  });

  test('is a no-op when PROMPTS_DIR is null', () => {
    // PROMPTS_DIR is null in test config
    seedPrompts();
    expect(mocks.fs.writeFileSyncCalls.length).toBe(0);
  });
});
