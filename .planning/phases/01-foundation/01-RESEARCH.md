# Phase 1: Foundation - Research

**Researched:** 2026-02-03
**Domain:** Telegram bot scaffolding, environment configuration, authentication middleware
**Confidence:** HIGH

## Summary

Phase 1 establishes the foundational architecture for Focus Bot: a Telegram bot that validates configuration at startup, enforces user authorization, and responds to the /start command. The research confirms Grammy 1.39.3 with @grammyjs/runner 2.0.3 as the production-ready stack for long polling, and Zod 4.3.6 for fail-fast configuration validation.

The key architectural decisions for this phase are:
1. **Long polling with runner** instead of webhooks (avoids timeout issues with future Claude operations)
2. **Fail-fast config validation** using Zod's parse() at startup
3. **Auth middleware first in chain** blocking unauthorized users before any handler runs
4. **Graceful shutdown handling** for clean bot termination

**Primary recommendation:** Use Grammy's middleware pattern with auth middleware registered first, runner for concurrent long polling, and Zod schema validation that exits on startup if any config is invalid.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| grammy | 1.39.3 | Telegram Bot Framework | TypeScript-first, excellent docs, production-proven |
| @grammyjs/runner | 2.0.3 | Concurrent long polling | Required for scaling, per-chat sequentialization |
| zod | 4.3.6 | Schema validation | Type-safe config, fail-fast pattern, 14x faster than v3 |
| dotenv | 16.x | Environment loading | Standard .env file support |
| typescript | 5.9.3 | Type safety | Full Grammy/Zod type inference |
| tsx | 4.21.0 | Dev runtime | Fast TypeScript execution without compile step |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @grammyjs/auto-retry | 2.0.2 | Rate limit handling | Always - handles Telegram 429s automatically |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @grammyjs/runner | bot.start() | bot.start() is simpler but sequential - use runner for production |
| Zod | manual validation | Zod provides types and validation together, manual is error-prone |

**Installation:**
```bash
npm install grammy @grammyjs/runner @grammyjs/auto-retry zod dotenv
npm install -D typescript tsx @types/node
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── index.ts              # Entry point - load config, create bot, run
├── config.ts             # Zod schema + parse, exports validated config
├── bot/
│   ├── bot.ts            # Bot creation and middleware registration
│   ├── handlers/
│   │   └── command.ts    # /start and future command handlers
│   └── middleware/
│       └── auth.ts       # User whitelist middleware
└── types/
    └── index.ts          # Shared types (if needed)
```

### Pattern 1: Fail-Fast Config Validation
**What:** Parse and validate all environment variables at module load time, exit immediately if invalid
**When to use:** Always - config errors should never be discovered at runtime
**Example:**
```typescript
// Source: Zod docs + Grammy community patterns
import { z } from 'zod';
import { config as loadEnv } from 'dotenv';
import * as fs from 'node:fs';
import * as path from 'node:path';

loadEnv();

const envSchema = z.object({
  // Required - bot token from BotFather
  TELEGRAM_BOT_TOKEN: z.string().min(1, 'Telegram bot token is required'),

  // Required - comma-separated user IDs
  ALLOWED_USER_IDS: z
    .string()
    .min(1, 'At least one allowed user ID is required')
    .transform((val) => val.split(',').map((id) => parseInt(id.trim(), 10)))
    .refine((ids) => ids.every((id) => !isNaN(id)), 'All user IDs must be valid numbers'),

  // Required - absolute path to Obsidian vault, must exist
  NOTES_DIR: z
    .string()
    .min(1, 'Notes directory is required')
    .refine((val) => path.isAbsolute(val), 'NOTES_DIR must be an absolute path')
    .refine((val) => fs.existsSync(val), 'NOTES_DIR path does not exist'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
```

### Pattern 2: Auth Middleware First
**What:** Register auth middleware before all other handlers to block unauthorized users
**When to use:** Always - security boundary must be first in chain
**Example:**
```typescript
// Source: Grammy middleware docs
import { Context, NextFunction } from 'grammy';
import { config } from '../config.js';

export async function authMiddleware(
  ctx: Context,
  next: NextFunction
): Promise<void> {
  const userId = ctx.from?.id;

  if (!userId || !config.ALLOWED_USER_IDS.includes(userId)) {
    await ctx.reply('You are not authorized to use this bot.');
    return; // Don't call next() - stops processing chain
  }

  await next(); // Authorized - continue to handlers
}
```

### Pattern 3: Runner with Graceful Shutdown
**What:** Use run() instead of bot.start() for concurrent processing, with proper SIGINT handling
**When to use:** Always for production - enables concurrent updates and clean shutdown
**Example:**
```typescript
// Source: Grammy runner docs
import { Bot } from 'grammy';
import { run } from '@grammyjs/runner';
import { autoRetry } from '@grammyjs/auto-retry';

async function main() {
  const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

  // Auto-retry on transient errors (429, 5xx)
  bot.api.config.use(autoRetry({
    maxRetryAttempts: 5,
    maxDelaySeconds: 60,
  }));

  // Auth first
  bot.use(authMiddleware);

  // Commands
  bot.command('start', handleStart);

  // Error handler
  bot.catch((err) => {
    console.error(`Error handling update ${err.ctx.update.update_id}:`, err.error);
  });

  // Start with runner
  const handle = run(bot);

  // Graceful shutdown
  const shutdown = async () => {
    console.log('Shutting down...');
    await handle.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log('Bot started');
  await handle.task();
}

main();
```

### Pattern 4: Command Handler with Help Message
**What:** /start shows usage instructions
**When to use:** Required for all Telegram bots
**Example:**
```typescript
// Source: Grammy commands docs
import { Context } from 'grammy';

export async function handleStart(ctx: Context): Promise<void> {
  const helpMessage = `Welcome to Focus Bot!

I capture your thoughts and save them as notes in your Obsidian vault.

How to use:
- Just send me any text message
- I'll generate a title and tags automatically
- The note will be saved to your vault

Commands:
/start - Show this help message`;

  await ctx.reply(helpMessage);
}
```

### Anti-Patterns to Avoid
- **Using bot.start() in production:** Use runner for concurrent processing and graceful shutdown
- **Auth middleware after handlers:** Always register auth first - order matters
- **Validating config lazily:** Use fail-fast - exit on startup if config invalid
- **Not awaiting next():** Always `await next()` in middleware to ensure proper execution order

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Config validation | if/else checks | Zod schema | Type inference, detailed errors, transforms |
| Rate limit retry | setTimeout loops | @grammyjs/auto-retry | Handles 429s, exponential backoff, battle-tested |
| Long polling | bot.start() | @grammyjs/runner | Concurrent processing, graceful shutdown |
| User ID parsing | parseInt scattered | Zod transform | Validates AND transforms in one place |

**Key insight:** Grammy and Zod provide production-ready solutions for common bot concerns. Hand-rolling leads to edge case bugs and missing error handling.

## Common Pitfalls

### Pitfall 1: Using bot.start() for Production
**What goes wrong:** Sequential update processing, no graceful shutdown, blocks on slow operations
**Why it happens:** bot.start() is simpler and works in tutorials
**How to avoid:** Always use `run(bot)` from @grammyjs/runner for production
**Warning signs:** Bot becomes unresponsive during Claude operations (future phases)

### Pitfall 2: Auth Middleware in Wrong Position
**What goes wrong:** Unauthorized users can trigger handlers if auth is registered after them
**Why it happens:** Middleware order isn't obvious to new developers
**How to avoid:** Register auth middleware FIRST, before any bot.command() or bot.on() calls
**Warning signs:** Unauthorized users receiving command responses instead of rejection

### Pitfall 3: Not Awaiting next() in Middleware
**What goes wrong:** Middleware stack executes in wrong order, responses may be out of order
**Why it happens:** Easy to forget await on async function call
**How to avoid:** Always use `await next()` - never just `next()`
**Warning signs:** Timing middleware shows negative/zero times, handlers execute out of order

### Pitfall 4: Lazy Config Validation
**What goes wrong:** Bot starts but fails later when accessing missing config
**Why it happens:** Developer defers validation to "when needed"
**How to avoid:** Validate ALL config at module load, exit immediately if invalid
**Warning signs:** Runtime errors like "Cannot read property of undefined" on config access

### Pitfall 5: Hardcoded User IDs
**What goes wrong:** Need to redeploy bot to change allowed users
**Why it happens:** Quick testing with hardcoded values that never get extracted
**How to avoid:** Use ALLOWED_USER_IDS env var from the start
**Warning signs:** User IDs appear in source code

### Pitfall 6: Missing Error Handler
**What goes wrong:** Unhandled errors crash the bot
**Why it happens:** Works in dev, errors not anticipated
**How to avoid:** Always register bot.catch() with proper logging
**Warning signs:** Bot stops responding after errors, no logs explaining why

## Code Examples

Verified patterns from official sources:

### Complete Bot Initialization
```typescript
// Source: Grammy docs + runner docs
import { Bot, Context, NextFunction } from 'grammy';
import { run } from '@grammyjs/runner';
import { autoRetry } from '@grammyjs/auto-retry';
import { config } from './config.js';

// Auth middleware
async function authMiddleware(ctx: Context, next: NextFunction): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId || !config.ALLOWED_USER_IDS.includes(userId)) {
    await ctx.reply('You are not authorized to use this bot.');
    return;
  }
  await next();
}

// Start command
async function handleStart(ctx: Context): Promise<void> {
  await ctx.reply(`Welcome to Focus Bot!

I capture your thoughts and save them as notes in your Obsidian vault.

How to use:
- Just send me any text message
- I'll generate a title and tags automatically
- The note will be saved to your vault

Commands:
/start - Show this help message`);
}

async function main(): Promise<void> {
  const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

  // Transformer: auto-retry on transient errors
  bot.api.config.use(autoRetry({
    maxRetryAttempts: 5,
    maxDelaySeconds: 60,
  }));

  // Middleware: auth first
  bot.use(authMiddleware);

  // Commands
  bot.command('start', handleStart);

  // Global error handler
  bot.catch((err) => {
    console.error(`Error while handling update ${err.ctx.update.update_id}:`);
    console.error(err.error);
  });

  // Start with runner
  const handle = run(bot);

  // Graceful shutdown
  const shutdown = async (): Promise<void> => {
    console.log('Shutting down gracefully...');
    await handle.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log('Bot is running...');
  await handle.task();
}

main().catch(console.error);
```

### Complete Config Module
```typescript
// Source: Zod docs
import { z } from 'zod';
import { config as loadEnv } from 'dotenv';
import * as fs from 'node:fs';
import * as path from 'node:path';

loadEnv();

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z
    .string()
    .min(1, 'TELEGRAM_BOT_TOKEN is required'),

  ALLOWED_USER_IDS: z
    .string()
    .min(1, 'ALLOWED_USER_IDS is required')
    .transform((val) =>
      val.split(',').map((id) => parseInt(id.trim(), 10))
    )
    .refine(
      (ids) => ids.every((id) => !isNaN(id) && id > 0),
      'ALLOWED_USER_IDS must be comma-separated positive integers'
    ),

  NOTES_DIR: z
    .string()
    .min(1, 'NOTES_DIR is required')
    .refine(
      (val) => path.isAbsolute(val),
      'NOTES_DIR must be an absolute path'
    )
    .refine(
      (val) => fs.existsSync(val),
      (val) => ({ message: `NOTES_DIR does not exist: ${val}` })
    )
    .refine(
      (val) => fs.statSync(val).isDirectory(),
      'NOTES_DIR must be a directory'
    ),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Configuration error:');
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const config = parsed.data;
```

### Example .env File
```env
# Required: Bot token from @BotFather
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11

# Required: Comma-separated Telegram user IDs allowed to use the bot
ALLOWED_USER_IDS=123456789,987654321

# Required: Absolute path to Obsidian vault
NOTES_DIR=/path/to/obsidian-vault
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Telegraf | Grammy | 2021+ | Grammy is TypeScript-first, better maintained |
| Zod v3 | Zod v4 | 2025 | 14x faster parsing, smaller bundle |
| Manual validation | Zod schemas | Ongoing | Type inference + validation in one place |
| bot.start() | run(bot) with runner | Grammy 1.x | Concurrent processing, graceful shutdown |

**Deprecated/outdated:**
- Telegraf: Still works but Grammy has better TypeScript support and docs
- joi/yup for config: Zod provides better TypeScript integration
- process.env direct access: Use validated config object for type safety

## Open Questions

Things that couldn't be fully resolved:

1. **Exact help message wording**
   - What we know: /start should show usage instructions
   - What's unclear: Final copy depends on user preference
   - Recommendation: Start with clear, minimal message, iterate based on use

2. **NOTES_DIR validation timing**
   - What we know: Path must exist and be absolute
   - What's unclear: Should we also check write permissions at startup?
   - Recommendation: Basic existence check is sufficient; write errors caught at note creation time

## Sources

### Primary (HIGH confidence)
- [Grammy Official Docs](https://grammy.dev/) - Middleware, commands, errors
- [Grammy Runner Plugin](https://grammy.dev/plugins/runner) - run(), sequentialize, shutdown
- [Grammy GitHub](https://github.com/grammyjs/grammY) - Version verification
- [Zod Official Docs](https://zod.dev/) - Schema validation, transforms, refinements
- npm registry - Version verification (Grammy 1.39.3, runner 2.0.3, Zod 4.3.6)

### Secondary (MEDIUM confidence)
- [Grammy Middleware Guide](https://grammy.dev/guide/middleware) - Middleware chain, next() pattern
- [Environment Variable Validation with Zod](https://www.creatures.sh/blog/env-type-safety-and-validation/) - Fail-fast patterns
- Project research: `.planning/research/SUMMARY.md` - Stack decisions

### Tertiary (LOW confidence)
- [bot-base/telegram-bot-template](https://github.com/bot-base/telegram-bot-template) - Community patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All versions verified via npm, official docs complete
- Architecture: HIGH - Grammy middleware well-documented, patterns proven
- Pitfalls: HIGH - Official docs explicitly warn about middleware order and next()

**Research date:** 2026-02-03
**Valid until:** 60 days (stable ecosystem, Grammy 1.x mature)
