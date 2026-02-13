# Roadmap: Focus Bot

## Overview

Focus Bot delivers a single-purpose Telegram-to-Obsidian capture workflow: send a message (text or voice), get an AI-organized note. Organization uses type-based tags and inline `[[wiki-links]]` in the note body.

## Milestone 1: MVP (Phases 1-3)

- [x] **Phase 1: Foundation** - Bot scaffolding, config validation, auth middleware, /start command
- [x] **Phase 2: Core Capture** - Message to note with AI-generated title, tags, and frontmatter
- [x] **Phase 3: Vault Integration** - Steph Ango-inspired format: categories, topics, inline wiki-links

## Milestone 2: Enrichment

- [x] **Phase 4: URL/Bookmark Capture** - URL detection, AI summaries, Telegraph publishing, Bookmarks directory
- [x] **Phase 5: Tags Refactor** - Replace categories+topics with type-based tags (plain strings, always plural)
- [x] **Phase 6: Voice Notes** - Voice transcription via Groq Whisper, multi-turn drafting, reaction-based save

## Phase Details

### Phase 1: Foundation (Complete - 2026-02-03)
**Goal**: Running bot that validates configuration, enforces user authorization, and responds to /start

Plans:
- [x] 01-01-PLAN.md - Config validation, TypeScript setup, auth middleware
- [x] 01-02-PLAN.md - Start command, bot assembly, entry point with runner

### Phase 2: Core Capture (Complete - 2026-02-05)
**Goal**: User sends text message, Claude analyzes it, generates title and tags, writes markdown note to vault, bot confirms

Plans:
- [x] 02-01-PLAN.md - Config extension, dependencies, note capture service
- [x] 02-02-PLAN.md - Text message handler, bot wiring, end-to-end verification

Additional work beyond plans:
- Direct file writing (fs.writeFileSync)
- Admin commands (/health, /status, /logs, /restart)
- systemd service file, CLAUDE.md, README.md

### Phase 3: Vault Integration (Complete - 2026-02-06)
**Goal**: Restructure note format to align with Steph Ango's vault patterns
**Success Criteria**:
  1. Notes written to vault root (no Captures/ subdirectory)
  2. Categories as wiki-links constrained to Categories/ directory hub files
  3. Topics as wiki-links replacing flat tags
  4. Inline [[wiki-links]] in note body for key concepts
  5. `[[Captures]]` always included as a category
  6. /restart in Telegram menu, startup notification on boot

### Phase 4: URL/Bookmark Capture (Complete - 2026-02-06)
**Goal**: Detect URLs in messages, generate AI summaries, publish to Telegraph, save to Bookmarks directory
**Success Criteria**:
  1. Messages containing URLs get `url` field in frontmatter
  2. YouTube URLs: transcript fetched via yt-dlp, AI summary generated
  3. Generic URLs: article text fetched, AI summary generated
  4. Summaries published to telegra.ph with readable Instant View link
  5. Telegraph URL sent as reply and stored in frontmatter
  6. URL notes saved to NOTES_DIR/Bookmarks/
  7. Reaction feedback: 👍 on capture, 💯 on enrichment complete
  8. Enrichment failures never crash bot or block user

### Phase 5: Tags Refactor (Complete - 2026-02-07)
**Goal**: Replace categories+topics with type-based tags
**Success Criteria**:
  1. Tags are plain strings (not wiki-links), always plural
  2. `captures` tag code-enforced
  3. Categories/ directory dependency removed
  4. Wiki-links in body unchanged

### Phase 6: Voice Notes (Complete - 2026-02-11)
**Goal**: Voice message capture with multi-turn drafting and reaction-based save
**Success Criteria**:
  1. Voice messages transcribed via Groq Whisper (large-v3-turbo)
  2. Transcription processed by Claude into title, tags, body
  3. Draft displayed as formatted Telegram message (bold title, italic tags)
  4. Follow-up voice/text messages refine draft in-place
  5. 👍 reaction on draft triggers save to vault
  6. Voice/text "save" and "cancel" commands work
  7. Saved notes have `source: telegram-voice`
  8. `GROQ_API_KEY` required in config

## Progress

| Phase | Status | Completed |
|-------|--------|-----------|
| 1. Foundation | Complete | 2026-02-03 |
| 2. Core Capture | Complete | 2026-02-05 |
| 3. Vault Integration | Complete | 2026-02-06 |
| 4. URL/Bookmark Capture | Complete | 2026-02-06 |
| 5. Tags Refactor | Complete | 2026-02-07 |
| 6. Voice Notes | Complete | 2026-02-11 |
