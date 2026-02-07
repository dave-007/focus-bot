import { describe, expect, test, mock } from 'bun:test';
import { authMiddleware } from '../../src/bot/middleware/auth.js';

// Config is mocked by tests/setup.ts preload with ALLOWED_USER_IDS: [111, 222]

function createMockContext(userId?: number) {
  return {
    from: userId !== undefined ? { id: userId } : undefined,
    reply: mock(() => Promise.resolve()),
  } as any;
}

describe('authMiddleware', () => {
  test('calls next() for authorized user', async () => {
    const ctx = createMockContext(111);
    const next = mock(() => Promise.resolve());

    await authMiddleware(ctx, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  test('calls next() for second authorized user', async () => {
    const ctx = createMockContext(222);
    const next = mock(() => Promise.resolve());

    await authMiddleware(ctx, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('replies "not authorized" for unauthorized user', async () => {
    const ctx = createMockContext(999);
    const next = mock(() => Promise.resolve());

    await authMiddleware(ctx, next);

    expect(next).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith('You are not authorized to use this bot.');
  });

  test('replies "not authorized" when from is undefined', async () => {
    const ctx = createMockContext();
    const next = mock(() => Promise.resolve());

    await authMiddleware(ctx, next);

    expect(next).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith('You are not authorized to use this bot.');
  });
});
