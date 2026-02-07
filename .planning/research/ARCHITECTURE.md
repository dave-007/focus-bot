# Architecture Patterns

**Domain:** Telegram note capture bot (Grammy + Claude Agent SDK)
**Researched:** 2026-02-02
**Confidence:** HIGH (verified against official Claude Agent SDK docs and reference implementation)

## Executive Summary

Focus Bot is a deliberately simple architecture — a thin Grammy layer receiving messages, routing them through Claude Agent SDK, and confirming the result. Unlike the reference Claudegram architecture (which handles streaming, queuing, sessions), Focus Bot needs none of that complexity because each message is an independent, stateless note capture operation.

**Key insight:** The Claude Agent SDK handles all the complexity. Focus Bot just needs to: receive message, call `query()`, wait for result, confirm to user.

## Recommended Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Focus Bot                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐   │
│  │   Grammy     │───▶│   Handler    │───▶│  Claude Agent    │   │
│  │   Bot Core   │    │   Layer      │    │  SDK (query())   │   │
│  └──────────────┘    └──────────────┘    └────────┬─────────┘   │
│         │                   │                      │             │
│         │                   │                      ▼             │
│         │                   │            ┌──────────────────┐   │
│         │                   │            │  Claude Runtime   │   │
│         │                   │            │  (Write tool)     │   │
│         │                   │            └────────┬─────────┘   │
│         │                   │                      │             │
│         ▼                   ▼                      ▼             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐   │
│  │  Telegram    │    │   Config     │    │  Obsidian Vault  │   │
│  │  API         │    │   (Zod)      │    │  (filesystem)    │   │
│  └──────────────┘    └──────────────┘    └──────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|----------------|-------------------|
| **Grammy Bot Core** | Receives Telegram updates, registers handlers, manages bot lifecycle | Handler Layer, Telegram API |
| **Handler Layer** | Dispatches messages to Claude, formats responses | Grammy Bot, Claude Agent SDK |
| **Claude Agent SDK** | Runs Claude Code agent with Write tool access | Claude Runtime, Handler Layer |
| **Config (Zod)** | Validates environment variables at startup | All components (read-only) |
| **Obsidian Vault** | Target filesystem directory for note files | Claude Runtime (Write tool) |

### Data Flow

**Happy path (message to note):**

```
1. User sends message to Telegram bot
                │
                ▼
2. Grammy receives update, passes to message handler
                │
                ▼
3. Handler calls Claude Agent SDK query() with:
   - prompt: User's message + instructions to generate title/tags
   - cwd: Notes directory (NOTES_DIR)
   - tools: ['Write'] only
   - permissionMode: 'acceptEdits'
                │
                ▼
4. Claude analyzes message, decides:
   - Title (for filename)
   - 3-5 tags (for frontmatter)
   - Formats markdown with frontmatter
                │
                ▼
5. Claude uses Write tool to create file in vault
                │
                ▼
6. SDK returns result message with success/failure
                │
                ▼
7. Handler extracts title from response, sends confirmation
   "Saved: [Note Title]"
```

**Error cases:**

- **Auth failure:** Middleware blocks before handler, replies with rejection
- **SDK error:** Handler catches, replies with user-friendly error
- **Write failure:** Claude reports failure, handler relays to user

## Patterns to Follow

### Pattern 1: Stateless Message Handling

**What:** Each message is a complete, independent operation. No session tracking, no conversation continuity.

**When:** Always — Focus Bot is intentionally stateless.

**Why:** Simplicity. Notes don't depend on previous notes. Each capture is atomic.

**Example:**
```typescript
// Each message is independent - no session tracking
bot.on('message:text', async (ctx) => {
  const result = await captureNote(ctx.message.text);
  await ctx.reply(`Saved: ${result.title}`);
});

// NOT this (Claudegram pattern - unnecessary complexity for Focus Bot)
const sessionManager = new SessionManager();
bot.on('message:text', async (ctx) => {
  const session = sessionManager.getOrCreate(ctx.chat.id);
  // ... session-aware handling
});
```

### Pattern 2: One-Shot Query Pattern

**What:** Use `query()` directly without streaming, sessions, or continuation.

**When:** For stateless operations where you just need a result.

**Why:** Focus Bot doesn't need streaming UI (just a confirmation message). The simpler pattern is faster to implement and debug.

**Example:**
```typescript
import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';

async function captureNote(content: string): Promise<{ title: string }> {
  const prompt = buildNotePrompt(content);

  const response = query({
    prompt,
    options: {
      cwd: config.NOTES_DIR,
      tools: ['Write'],
      permissionMode: 'acceptEdits',
      systemPrompt: NOTE_CAPTURE_SYSTEM_PROMPT,
    },
  });

  let resultText = '';
  for await (const msg of response) {
    if (msg.type === 'assistant') {
      for (const block of msg.message.content) {
        if (block.type === 'text') {
          resultText += block.text;
        }
      }
    }
    if (msg.type === 'result') {
      if (msg.subtype !== 'success') {
        throw new Error(`Agent failed: ${msg.subtype}`);
      }
    }
  }

  return { title: extractTitle(resultText) };
}
```

### Pattern 3: Minimal Tool Set

**What:** Grant Claude only the tools necessary for the task.

**When:** Always — principle of least privilege.

**Why:** Security. Focus Bot only needs to write files, so only grant Write tool.

**Example:**
```typescript
const response = query({
  prompt,
  options: {
    tools: ['Write'],  // Only what's needed
    // NOT: tools: ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep']
  },
});
```

### Pattern 4: System Prompt for Task Specialization

**What:** Use a task-specific system prompt to guide Claude's output format.

**When:** When you need consistent, predictable output.

**Why:** Claude needs clear instructions about the note format, frontmatter structure, and filename conventions.

**Example:**
```typescript
const NOTE_CAPTURE_SYSTEM_PROMPT = `You are a note capture assistant. When given a message:

1. Generate a concise title (3-7 words) that summarizes the core idea
2. Generate 3-5 relevant tags based on the subject matter
   - Use lowercase, hyphenated format (e.g., "machine-learning")
   - Tags should be specific enough to be useful for finding this note later
3. Write a markdown file with this exact format:

---
title: Your Generated Title
created: [ISO 8601 timestamp]
tags:
  - tag-one
  - tag-two
  - tag-three
---

[Original message content]

4. Save the file using the Write tool with filename: [slugified-title].md
5. Respond with only: "Saved: [Your Generated Title]"

Do not include any other commentary.`;
```

### Pattern 5: Middleware for Auth

**What:** Block unauthorized users at the middleware layer, before any handler runs.

**When:** Always — security should be the first check.

**Why:** Prevents unauthorized users from triggering any Claude API calls.

**Example:**
```typescript
// Auth middleware - runs before handlers
function authMiddleware(ctx: Context, next: NextFunction) {
  const userId = ctx.from?.id;

  if (!userId || !config.ALLOWED_USER_IDS.includes(userId)) {
    return ctx.reply('Not authorized.');
  }

  return next();
}

// Register before handlers
bot.use(authMiddleware);
bot.on('message:text', handleMessage);  // Only reached if auth passes
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Over-Engineering for Future Features

**What:** Building session management, queuing, streaming for "future needs."

**Why bad:** Focus Bot is explicitly scoped. These features add complexity without value. If needs change, YAGNI — build it then.

**Instead:** Start simple. Each message is independent. No sessions, no queues.

### Anti-Pattern 2: Streaming Response UI

**What:** Implementing real-time response streaming like Claudegram.

**Why bad:** Focus Bot's response is a simple confirmation ("Saved: [Title]"). Streaming a 20-character message is worse UX than waiting 2 seconds for a complete response.

**Instead:** Wait for the full result, then send one clean confirmation message.

### Anti-Pattern 3: Claude Session Persistence

**What:** Storing `session_id` from Claude responses to enable conversation continuity.

**Why bad:** Notes are independent. There's no conversation to continue. Session persistence adds complexity and potential bugs (stale sessions, cross-note confusion).

**Instead:** Each `query()` call is fresh. No `resume` option needed.

### Anti-Pattern 4: Request Queue

**What:** Implementing a request queue with processing flags like Claudegram.

**Why bad:** Focus Bot is single-user or small whitelist. The chance of concurrent requests is low, and even if it happens, Grammy handles it gracefully. The queue adds complexity for marginal benefit.

**Instead:** Let Grammy handle message ordering naturally. If concurrent processing becomes an issue later, add simple sequentialize middleware.

### Anti-Pattern 5: Multiple Response Messages

**What:** Splitting responses across multiple Telegram messages.

**Why bad:** Focus Bot's response is a single confirmation. Splitting it would be confusing and noisy.

**Instead:** Single `ctx.reply()` with the confirmation.

## File Structure

Recommended project structure:

```
src/
├── index.ts                 # Entry point: create bot, run
├── config.ts                # Zod schema, env validation
├── bot/
│   ├── bot.ts               # Bot initialization, middleware registration
│   └── handlers/
│       ├── message.ts       # Main message handler (note capture)
│       └── commands.ts      # /start, /recent handlers
├── claude/
│   └── capture.ts           # captureNote() function, system prompt
└── utils/
    └── slug.ts              # Title slugification for filenames
```

**File responsibilities:**

| File | Responsibility |
|------|----------------|
| `index.ts` | Bootstrap: load config, create bot, start runner |
| `config.ts` | Zod schema, fail-fast validation |
| `bot/bot.ts` | Bot instance, middleware stack, handler registration |
| `bot/handlers/message.ts` | Route text messages to Claude, send confirmation |
| `bot/handlers/commands.ts` | `/start` help, `/recent` listing |
| `claude/capture.ts` | Claude Agent SDK integration, system prompt |
| `utils/slug.ts` | Slugify titles for filenames |

## Build Order Implications

Dependencies between components dictate implementation order:

```
Phase 1: Foundation
  └── config.ts (Zod validation)
        │
        ▼
Phase 2: Core Bot
  ├── bot/bot.ts (Grammy setup, middleware)
  └── bot/handlers/commands.ts (/start)
        │
        ▼
Phase 3: Claude Integration
  └── claude/capture.ts (query, system prompt)
        │
        ▼
Phase 4: Message Handling
  └── bot/handlers/message.ts (ties it together)
        │
        ▼
Phase 5: Polish
  └── bot/handlers/commands.ts (/recent)
```

**Rationale:**

1. **Config first:** Everything depends on validated config. Fail fast if misconfigured.
2. **Core bot second:** Need a working bot before Claude integration. `/start` validates bot is running.
3. **Claude integration third:** Core capability. Can test in isolation with hardcoded inputs.
4. **Message handling fourth:** Connects bot to Claude. This is where the magic happens.
5. **Polish last:** `/recent` is a nice-to-have; it needs filesystem access patterns established first.

## Comparison with Claudegram

| Aspect | Claudegram | Focus Bot | Why Different |
|--------|------------|-----------|---------------|
| **Streaming UI** | Yes (debounced updates) | No | Focus Bot response is 20 chars, not paragraphs |
| **Session persistence** | Yes (Claude session IDs) | No | Notes are independent, no conversation |
| **Request queue** | Yes (per-chat sequentialize) | No | Single user, low concurrency |
| **Telegraph integration** | Yes (long responses) | No | Responses are always short |
| **Voice/TTS** | Yes | No | Text only for v1 |
| **Tools granted** | Many (Bash, Read, Write...) | Write only | Minimal permissions |
| **Message sender class** | Complex (streaming state) | Simple `ctx.reply()` | No streaming state to manage |
| **Project selection** | Dynamic (`/project` command) | Fixed (NOTES_DIR) | Single vault, no switching |

## Scalability Considerations

| Concern | At 1 user | At 10 users | At 100 users |
|---------|-----------|-------------|--------------|
| **Concurrency** | No issue | Add sequentialize if needed | Sequentialize required |
| **Rate limits (Telegram)** | No issue | No issue | May need backoff |
| **Rate limits (Claude)** | No issue | No issue | May need queuing |
| **Notes directory** | No issue | Separate vaults | Separate vaults |

**Note:** Focus Bot is designed as a personal tool. Multi-user at scale is out of scope. If needed, each user would have their own bot instance with their own vault.

## Sources

**HIGH confidence (official documentation):**
- [Claude Agent SDK TypeScript Reference](https://platform.claude.com/docs/en/agent-sdk/typescript) - API details, Options type, Query interface
- [Claude Agent SDK V2 Preview](https://platform.claude.com/docs/en/agent-sdk/typescript-v2-preview) - Simpler session patterns (not needed for Focus Bot, but good to know)
- Reference implementation: Claudegram project - Architecture patterns

**MEDIUM confidence (verified patterns):**
- [Grammy Documentation](https://grammy.dev/) - Bot framework patterns
- [Grammy GitHub](https://github.com/grammyjs/grammY) - Framework source

---

## Summary for Roadmap

**Build order:** Config -> Core Bot -> Claude Integration -> Message Handler -> Polish

**Key dependencies:**
- Message handler depends on Claude integration (captureNote function)
- Claude integration depends on config (NOTES_DIR)
- All handlers depend on bot core (middleware, registration)

**No research flags needed:** This is a straightforward integration of two well-documented systems (Grammy + Claude Agent SDK). Standard patterns apply.
