/**
 * Test preload: global module mocks shared across all test files.
 *
 * Only mocks modules that are NOT tested directly:
 *   - config, Claude Agent SDK, node:fs, telegraph, node:child_process
 *
 * Test files control mock behavior via (globalThis as any).__testMocks.
 */
import { mock } from 'bun:test';

// ---------------------------------------------------------------------------
// Mutable mock state — test files modify this in beforeEach
// ---------------------------------------------------------------------------
const state = {
  query: {
    fn: (() => ({
      async *[Symbol.asyncIterator]() {
        yield {
          type: 'result',
          subtype: 'success',
          result: JSON.stringify({
            title: 'Default Test Note',
            categories: ['Captures'],
            topics: ['Testing', 'Default'],
            body: 'Default test body.',
          }),
        };
      },
    })) as (...args: any[]) => any,
  },
  fs: {
    writeFileSyncCalls: [] as any[][],
    readFileContent: {} as Record<string, string>,
    existsSyncResult: true as boolean | ((p: string) => boolean),
  },
  telegraph: {
    createPageResult: null as string | null,
  },
};

(globalThis as any).__testMocks = state;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
mock.module('../src/config.js', () => ({
  config: {
    NOTES_DIR: '/tmp/test-vault',
    CAPTURE_MODEL: 'haiku',
    ENRICHMENT_MODEL: 'haiku',
    ALLOWED_USER_IDS: [111, 222],
    ANTHROPIC_API_KEY: undefined,
    TRANSCRIPT_LOG: '/tmp/test-transcripts.log',
    PROMPTS_DIR: undefined,
  },
  loadCategories: () => ['Captures', 'Ideas', 'Clippings'],
  BOOKMARKS_DIR: '/tmp/test-vault/Bookmarks',
  CATEGORIES_DIR: '/tmp/test-vault/Categories',
  PROMPTS_DIR: null,
}));

// ---------------------------------------------------------------------------
// Claude Agent SDK
// ---------------------------------------------------------------------------
mock.module('@anthropic-ai/claude-agent-sdk', () => ({
  query: (...args: any[]) => state.query.fn(...args),
}));

// ---------------------------------------------------------------------------
// Node.js fs — captures write calls, returns configurable read content
// ---------------------------------------------------------------------------
const fsExports = {
  writeFileSync: (...args: any[]) => {
    state.fs.writeFileSyncCalls.push(args);
  },
  appendFileSync: () => {},
  readFileSync: (filePath: string, _encoding?: string) =>
    state.fs.readFileContent[filePath] ?? '',
  existsSync: (filePath: string) =>
    typeof state.fs.existsSyncResult === 'function'
      ? state.fs.existsSyncResult(filePath)
      : state.fs.existsSyncResult,
  mkdtempSync: (_prefix: string) => '/tmp/yt-mock-test',
  rmSync: () => {},
  statSync: () => ({ isDirectory: () => true }),
  readdirSync: () => ['Captures.md', 'Ideas.md', 'Clippings.md'],
};
mock.module('node:fs', () => ({ default: fsExports, ...fsExports }));

// ---------------------------------------------------------------------------
// Telegraph — prevents auto-init side effect on module load
// ---------------------------------------------------------------------------
mock.module('../src/utils/telegraph.js', () => ({
  createTelegraphPage: async (..._args: any[]) => state.telegraph.createPageResult,
  initTelegraph: async () => {},
}));

// ---------------------------------------------------------------------------
// Child process — prevents yt-dlp from running in tests
// ---------------------------------------------------------------------------
mock.module('node:child_process', () => ({
  spawn: (..._args: any[]) => {
    const proc = {
      stdout: { on: () => {} },
      stderr: { on: () => {} },
      on: (event: string, cb: Function) => {
        if (event === 'error')
          setTimeout(() => cb(new Error('spawn disabled in tests')), 0);
      },
      kill: () => {},
    };
    return proc;
  },
}));
