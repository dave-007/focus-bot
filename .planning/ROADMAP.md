# Roadmap: Focus Bot

## Overview

Focus Bot delivers a single-purpose Telegram-to-Obsidian capture workflow: send a message, get an AI-organized note. The roadmap progresses from bot foundation (config, auth, basic commands) through core note capture (the product's entire value proposition) to polish features that build user trust.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation** - Bot scaffolding, config validation, auth middleware, /start command
- [ ] **Phase 2: Core Capture** - Message to note with AI-generated title, tags, and frontmatter
- [ ] **Phase 3: Polish** - /recent command for trust building

## Phase Details

### Phase 1: Foundation
**Goal**: Running bot that validates configuration, enforces user authorization, and responds to /start
**Depends on**: Nothing (first phase)
**Requirements**: CFG-01, CFG-02, CFG-03, AUTH-01, AUTH-02, CMD-01
**Success Criteria** (what must be TRUE):
  1. Bot starts successfully with valid TELEGRAM_BOT_TOKEN, ALLOWED_USER_IDS, and NOTES_DIR
  2. Bot fails fast with clear error message if any config is invalid or missing
  3. Unauthorized user receives "not authorized" message and cannot use the bot
  4. Authorized user can send /start and receives help message explaining how to use the bot
**Plans**: TBD

Plans:
- [ ] 01-01: TBD

### Phase 2: Core Capture
**Goal**: User sends text message, Claude analyzes it, generates title and tags, writes markdown note to vault, bot confirms
**Depends on**: Phase 1
**Requirements**: NOTE-01, NOTE-02, NOTE-03, NOTE-04, NOTE-05, NOTE-06
**Success Criteria** (what must be TRUE):
  1. User can send any text message and it becomes a markdown note in the vault
  2. Note has YAML frontmatter with generated title, created timestamp, and 3-5 relevant tags
  3. Filename is the generated title with reserved characters sanitized plus .md extension
  4. Bot confirms note was saved by displaying the generated title
  5. Note content preserves original message exactly
**Plans**: TBD

Plans:
- [ ] 02-01: TBD

### Phase 3: Polish
**Goal**: User can verify notes are being saved correctly via /recent command
**Depends on**: Phase 2
**Requirements**: CMD-02
**Success Criteria** (what must be TRUE):
  1. User can send /recent and see list of last few notes saved
  2. List shows note titles so user can verify captures are working
**Plans**: TBD

Plans:
- [ ] 03-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 0/TBD | Not started | - |
| 2. Core Capture | 0/TBD | Not started | - |
| 3. Polish | 0/TBD | Not started | - |
