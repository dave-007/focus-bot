# Focus Bot Requirements

## v1 Requirements

### Authentication

- [ ] **AUTH-01**: Bot rejects unauthorized users with "not authorized" message
- [ ] **AUTH-02**: Bot allows users in ALLOWED_USER_IDS whitelist

### Note Capture

- [ ] **NOTE-01**: User can send text message and it becomes a markdown note
- [ ] **NOTE-02**: Claude generates a title from the message content
- [ ] **NOTE-03**: Claude generates 3-5 relevant tags based on subject matter
- [ ] **NOTE-04**: Note is saved with YAML frontmatter (title, created datetime, tags)
- [ ] **NOTE-05**: Filename is the generated title with reserved characters sanitized (spaces preserved), plus .md extension
- [ ] **NOTE-06**: Bot confirms note was saved with the title

### Commands

- [ ] **CMD-01**: /start shows help message explaining how to use the bot
- [ ] **CMD-02**: /recent lists last few notes saved

### Configuration

- [ ] **CFG-01**: Bot validates TELEGRAM_BOT_TOKEN via Zod
- [ ] **CFG-02**: Bot validates ALLOWED_USER_IDS via Zod
- [ ] **CFG-03**: Bot validates NOTES_DIR (absolute path, exists) via Zod

---

## v2 Requirements (Deferred)

- Voice message transcription -> note
- Image attachment handling
- /search command to find notes

---

## Out of Scope

- **Folder organization** — flat directory only
- **Tag hierarchy** — flat tags only (no `#project/foo`)
- **Bidirectional sync** — Obsidian handles edits, bot only creates
- **Note editing/deletion** — use Obsidian
- **Group chat support** — personal tool only
- **Complex UI (inline keyboards)** — adds friction
- **Streaming responses** — not needed for simple confirmations

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Complete |
| AUTH-02 | Phase 1 | Complete |
| NOTE-01 | Phase 2 | Pending |
| NOTE-02 | Phase 2 | Pending |
| NOTE-03 | Phase 2 | Pending |
| NOTE-04 | Phase 2 | Pending |
| NOTE-05 | Phase 2 | Pending |
| NOTE-06 | Phase 2 | Pending |
| CMD-01 | Phase 1 | Complete |
| CMD-02 | Phase 3 | Pending |
| CFG-01 | Phase 1 | Complete |
| CFG-02 | Phase 1 | Complete |
| CFG-03 | Phase 1 | Complete |

---
*Last updated: 2026-02-03 after Phase 1 completion*
