# Project Research Summary

**Project:** Focus Bot - Telegram Note Capture to Obsidian
**Domain:** Quick capture bot with AI-powered organization
**Researched:** 2026-02-02
**Confidence:** HIGH

## Executive Summary

Focus Bot is a Telegram-to-Obsidian quick capture bot differentiated by AI-generated titles and tags. The technical approach is straightforward: Grammy handles Telegram interactions, Claude Agent SDK provides intelligent content analysis and file writing, and Zod validates configuration. This is a deliberately simple architecture - each message is an independent, stateless note capture operation with no session management, queuing, or streaming complexity.

The recommended stack is mature and well-documented: Grammy 1.39.x with runner for production-ready concurrent message handling, Claude Agent SDK 0.2.29 with Write tool permissions, and Zod 4.x for validation (required as a peer dependency). The architecture is a thin wrapper around these frameworks - receive message, call Claude's query() function with minimal context, write note to vault, confirm to user. This simplicity is intentional and contrasts with more complex reference implementations like Claudegram.

The primary risks are operational rather than technical: Telegram webhook timeouts causing duplicate processing (mitigated by using long polling), Claude SDK permission misconfiguration causing silent write failures (mitigated by explicit permissionMode), and cost explosion from unscoped agent context (mitigated by single-shot operations with Write-only tool access). The domain is well-understood with clear patterns and multiple reference implementations, giving high confidence in the approach.

## Key Findings

### Recommended Stack

The stack is constrained and well-defined. Grammy is the de facto standard for TypeScript Telegram bots with excellent documentation and plugin ecosystem. The Claude Agent SDK provides official Anthropic API access with built-in tool orchestration. Zod 4.x is both recommended for validation AND required as a peer dependency of the Claude Agent SDK (Zod 4 is 14x faster than v3 anyway).

**Core technologies:**
- **Grammy 1.39.3 + @grammyjs/runner 2.0.3**: Telegram bot framework with concurrent long polling - required for production to handle Claude's async operations without webhook timeouts
- **@anthropic-ai/claude-agent-sdk 0.2.29**: Official Claude Code API access with Write tool for file operations - handles all AI complexity internally
- **Zod 4.3.6**: Schema validation and environment parsing - required peer dependency, provides type-safe config
- **TypeScript 5.9.3 + tsx 4.21.0**: Type safety and fast dev runtime - excellent support for both Grammy and Zod 4

**Key plugins:**
- **@grammyjs/auto-retry**: Automatically handles Telegram 429 rate limits - always use
- **@grammyjs/parse-mode**: Simplified message formatting for confirmations

**What NOT to use:**
- Webhooks for MVP (timeout risk with Claude operations)
- Databases or Redis (filesystem-only, no persistence needed)
- @grammyjs/conversations (overkill for stateless capture)
- Multiple tools for Claude (Write only, security principle)

### Expected Features

Research reveals a clear competitive gap: existing Telegram-to-Obsidian tools (telegram-sync, tg2obsidian, telegram-inbox) are all "dumb pipes" that move content without intelligence. Focus Bot's AI title and tag generation fills this gap.

**Must have (table stakes):**
- Text message capture with timestamps - fundamental value proposition
- /start command with help - Telegram bot standard
- Confirmation of save - users need feedback loop
- Markdown formatting preserved - Obsidian native format
- User allowlist/authentication - security requirement
- Error handling with clear messages - trust building

**Should have (competitive differentiators):**
- **AI-generated titles** - solves "untitled-note-47" problem, core value prop
- **AI-generated tags** - automatic categorization, "let the app handle it" trend
- /recent command - trust building, verify notes landed correctly
- Flat directory structure - simplicity, let tags handle organization

**Explicitly defer (v2+):**
- Voice message transcription - high complexity, defer until text proven
- Image support and OCR - separate feature track
- Custom templates - nice-to-have polish
- Folder selection - anti-pattern that adds decision paralysis
- Group chat support - complexity explosion
- Bidirectional sync - different product category

**Dependency insight:** AI title/tag generation is a single operation (content analysis), not separate features. Voice/image are ADDITIVE - they funnel into the existing text pipeline once proven.

### Architecture Approach

Focus Bot is intentionally simple compared to reference implementations like Claudegram. It doesn't need streaming UI, session persistence, request queuing, or Telegraph integration because each message is an independent capture operation with a simple confirmation response.

**Major components:**
1. **Grammy Bot Core** - Receives Telegram updates, registers handlers, manages bot lifecycle
2. **Handler Layer** - Routes messages to Claude, formats confirmations (thin orchestration)
3. **Claude Agent SDK** - Runs Claude Code agent with Write tool access (handles all AI complexity)
4. **Config (Zod)** - Validates environment variables at startup, fail-fast pattern
5. **Obsidian Vault** - Target filesystem directory, written via Claude's Write tool

**Data flow:** User message → Grammy handler → Claude query() with message + instructions → Claude analyzes and writes note with frontmatter → SDK returns result → Handler confirms "Saved: [Title]"

**Key architectural patterns:**
- **Stateless handling**: Each message is independent, no session tracking
- **One-shot query pattern**: Use query() directly without streaming or continuation
- **Minimal tool set**: Grant only Write tool (security principle of least privilege)
- **System prompt specialization**: Guide Claude's output format for consistent frontmatter
- **Middleware for auth**: Block unauthorized users before handler runs

**Build order:** Config → Core Bot → Claude Integration → Message Handler → Polish (/recent)

### Critical Pitfalls

Research identified 13 pitfalls across three severity levels. The critical ones require architectural decisions in Phase 1.

1. **Telegram webhook timeout causing duplicate processing** - Claude operations (API + file write) can exceed Telegram's ~30s timeout, causing re-sends. **Solution:** Use grammY runner with long polling instead of webhooks for MVP.

2. **Claude SDK permission system complexity** - Multiple overlapping controls (permissionMode, allowedTools, settings.json, canUseTool) can conflict causing silent failures. **Solution:** Explicit `permissionMode: "acceptEdits"`, explicit `allowedTools: ["Write"]`, exclude "user" from settingSources.

3. **Relative vs absolute file paths** - Claude makes mistakes with relative paths after directory changes. **Solution:** Always require absolute paths, pass vault path explicitly, validate paths before writing, implement path whitelisting.

4. **YAML frontmatter parsing edge cases** - Colons, special characters, reserved words break Obsidian parsing. **Solution:** Always quote string values, use ISO 8601 for dates, validate YAML output before writing with js-yaml.

5. **Cost explosion from unscoped agent context** - Agents try to read entire vaults or accumulate context. One case: "$5 for a simple change due to 5,000 XML/image files." **Solution:** Design for single-shot operations, grant Write only (not Read/Bash), implement max_tokens limits, clear context between requests.

**Moderate pitfalls:** Grammy runner vs bot.start() (start with runner), missing error boundaries (comprehensive try-catch), rate limits (auto-retry plugin), session persistence (stateless design), API key exposure (log sanitization).

**Minor pitfalls:** Claude API latency variability (set expectations), Unicode handling (UTF-8 everywhere), filename collisions (timestamp + sanitization).

## Implications for Roadmap

Based on research, suggested phase structure follows the natural dependency chain: foundation decisions → core integration → polish.

### Phase 1: Foundation & Bot Setup
**Rationale:** Architectural decisions must come first - webhook vs polling, permission modes, and stateless design can't be changed later without rewrites. Config validation enables fail-fast development.

**Delivers:** Running bot that responds to /start, validates config, has auth middleware

**Addresses:**
- Pitfall 1 (webhook timeout) - decide on long polling + runner
- Pitfall 2 (SDK permissions) - configure permissionMode correctly
- Pitfall 5 (cost explosion) - design minimal-context architecture
- Pitfall 10 (API key exposure) - establish security practices
- Feature: /start command (table stakes)
- Feature: User allowlist (table stakes)

**Stack elements:** Grammy + runner, Zod config, TypeScript setup

**Research flag:** SKIP - Well-documented patterns, official docs sufficient

### Phase 2: Core Note Capture
**Rationale:** This is the heart of the product. Must be implemented carefully with proper error handling, path validation, and frontmatter generation. All other features depend on this working reliably.

**Delivers:** Text message → AI-generated title/tags → Note saved to vault → Confirmation sent

**Addresses:**
- Pitfall 3 (file paths) - implement absolute path handling and validation
- Pitfall 4 (YAML frontmatter) - robust generation with quoting/validation
- Pitfall 7 (error boundaries) - comprehensive error handling
- Pitfall 12 (Unicode) - UTF-8 encoding everywhere
- Pitfall 13 (filename collisions) - timestamp + sanitization
- Feature: Text capture (core value prop)
- Feature: AI titles (key differentiator)
- Feature: AI tags (key differentiator)
- Feature: Timestamps (table stakes)
- Feature: Markdown preservation (table stakes)
- Feature: Error messages (table stakes)

**Stack elements:** Claude Agent SDK query(), Write tool, system prompt design

**Architecture:** Handler Layer → Claude Integration → File writing

**Research flag:** SKIP - Reference implementation exists (Claudegram), SDK documented

### Phase 3: Polish & Trust Building
**Rationale:** Once core capture works, add features that build user trust and handle operational concerns. These are independent of core functionality and can be iterated on.

**Delivers:** /recent command, rate limit handling, improved error messages, latency indicators

**Addresses:**
- Pitfall 8 (rate limits) - auto-retry plugin, backoff
- Pitfall 11 (latency UX) - set expectations, consider indicators
- Feature: /recent command (differentiator, trust building)
- Feature: Confirmation messages (polish existing)

**Stack elements:** @grammyjs/auto-retry, filesystem reading for /recent

**Research flag:** SKIP - Standard Grammy patterns

### Phase Ordering Rationale

- **Foundation first** because architectural decisions (polling vs webhooks, permission modes) can't be changed without rewrites. Config validation enables fail-fast development.
- **Core capture second** because everything else is useless without reliable note creation. This phase has the highest risk (AI integration, file writing, frontmatter generation) and needs the most testing.
- **Polish last** because it enhances working functionality rather than enabling new capabilities. These features are independent and can be added incrementally.

**Dependency chain:**
```
Config (Phase 1)
  ↓
Bot Core (Phase 1)
  ↓
Claude Integration (Phase 2) ← depends on config for NOTES_DIR
  ↓
Message Handler (Phase 2) ← depends on Claude integration
  ↓
Polish Features (Phase 3) ← depends on working core
```

**Pitfall timing:** Critical pitfalls (1, 2, 5) must be addressed in Phase 1 through architectural decisions. Implementation pitfalls (3, 4, 7, 12, 13) are addressed in Phase 2 during core development. Operational pitfalls (8, 11) are addressed in Phase 3 as polish.

### Research Flags

**Phases with standard patterns (skip `/gsd:research-phase`):**
- **Phase 1 (Foundation):** Well-documented Grammy patterns, official SDK docs cover all configuration
- **Phase 2 (Core Capture):** Reference implementation (Claudegram) provides patterns, SDK tools well-documented
- **Phase 3 (Polish):** Standard Grammy plugins, established operational patterns

**No deep research needed:** This domain has mature frameworks, official documentation, and reference implementations. All research questions were answerable from authoritative sources.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified via npm registry, official docs complete, clear peer dependencies |
| Features | MEDIUM | Good ecosystem research, competitive analysis clear, but "AI title quality" needs validation in practice |
| Architecture | HIGH | Reference implementation (Claudegram) verified, SDK documented, patterns proven |
| Pitfalls | HIGH | Multiple authoritative sources (Anthropic research, Grammy docs), real-world cases documented |

**Overall confidence:** HIGH

### Gaps to Address

Gaps are minor and will be resolved during implementation through testing:

- **AI title/tag quality validation**: Research confirms this is the differentiator, but actual quality needs user testing. Handle by starting with conservative prompts and iterating based on output quality.
- **Exact frontmatter format**: Obsidian supports variations; need to pick specific format. Handle by testing with Dataview plugin compatibility.
- **Filename slugification rules**: Multiple approaches valid. Handle by choosing safe, conservative rules (lowercase, hyphens, alphanumeric).
- **Cost modeling**: No baseline for typical Claude API costs per note. Handle by monitoring during development and setting up billing alerts.

None of these gaps require upfront research - they'll be resolved through implementation and iteration.

## Sources

### Primary (HIGH confidence)
- [Grammy Official Docs](https://grammy.dev/) - Framework patterns, deployment, plugins
- [Grammy GitHub](https://github.com/grammyjs/grammY) - Source verification
- [Claude Agent SDK TypeScript Reference](https://platform.claude.com/docs/en/agent-sdk/typescript) - API details, Options type
- [Claude Agent SDK GitHub](https://github.com/anthropics/claude-agent-sdk-typescript) - Version verification, issues
- [Anthropic: Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) - Agent design principles
- [Telegram Bot Features](https://core.telegram.org/bots/features) - Bot best practices
- [Obsidian YAML Front Matter](https://help.obsidian.md/Advanced+topics/YAML+front+matter) - Format specification
- npm registry - Direct version queries for all packages

### Secondary (MEDIUM confidence)
- [Common Pitfalls with Claude Agent SDK](https://liruifengv.com/posts/claude-agent-sdk-pitfalls-en/) - Permission system issues
- [Obsidian Forum: YAML Issues](https://forum.obsidian.md/t/current-status-for-parsing-working-with-yaml-frontmatter/70290) - Edge cases
- [obsidian-telegram-sync GitHub](https://github.com/soberhacker/obsidian-telegram-sync) - Competitive analysis
- [tg2obsidian GitHub](https://github.com/dimonier/tg2obsidian) - Feature comparison
- [Zapier: Best Note Taking Apps 2026](https://zapier.com/blog/best-note-taking-apps/) - Feature expectations
- Reference implementation: Claudegram project - Architecture patterns

### Tertiary (LOW confidence, informative only)
- [Claude Code Subagent Mistakes](https://dev.to/alireza_rezvani/4-claude-code-subagent-mistakes-that-kill-your-workflow-and-the-fixes-3n72) - Anecdotal pitfalls
- [Problems in Agentic Coding](https://medium.com/@TimSylvester/problems-in-agentic-coding-2866ca449ff0) - General agent issues

---
*Research completed: 2026-02-02*
*Ready for roadmap: yes*
